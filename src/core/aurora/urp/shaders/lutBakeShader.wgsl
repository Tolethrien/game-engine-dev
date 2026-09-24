@group(2) @binding(0) var lut: texture_storage_3d<rgba16float, write>;
// must match the layout written in PostPass.writeBake
struct Bake {
  mode: u32,
  // agx look: saturation, slope and power (ASC CDL), identity for "none"
  lookSaturation: f32,
  brightness: f32,
  contrast: f32,
  lookSlope: vec3f,
  saturation: f32,
  lookPower: vec3f,
  // turns
  hueShift: f32,
  // lms gains of the white balance, from temperature and tint on the cpu
  whiteBalance: vec3f,
  sepia: f32,
  // linear
  colorFilter: vec3f,
  invert: f32,
};
@group(2) @binding(1) var<uniform> bake: Bake;

override groupSize: u32 = 8;

// must match TONE_MAPPING in passes/postPass.ts
const MODE_NONE: u32 = 0u;
const MODE_REINHARD: u32 = 1u;
const MODE_ACES: u32 = 2u;
const MODE_FILMIC: u32 = 3u;
const MODE_AGX: u32 = 4u;

// must match lutEncode in postShader.wgsl: linear near black (0 stays exactly 0),
// logarithmic above, so hdr up to LUT_MAX fits and shadows keep their cells
const LUT_SCALE: f32 = 256.0;
const LUT_MAX: f32 = 64.0;
fn lutDecode(coord: vec3f) -> vec3f {
  return (exp2(coord * log2(1.0 + LUT_MAX * LUT_SCALE)) - 1.0) / LUT_SCALE;
}

fn reinhard(x: vec3f) -> vec3f {
  return x / (x + 1.0);
}
// ACES fit by Stephen Hill (BakingLab). The matrices mix the channels, so a burnt out
// saturated color drifts to white; a per channel curve keeps pure red red at any strength.
// WGSL matrices are built from columns: color * matrix dots color with each row below
const ACES_INPUT = mat3x3f(
  vec3f(0.59719, 0.35458, 0.04823),
  vec3f(0.07600, 0.90834, 0.01566),
  vec3f(0.02840, 0.13383, 0.83777),
);
const ACES_OUTPUT = mat3x3f(
  vec3f(1.60475, -0.53108, -0.07367),
  vec3f(-0.10208, 1.10813, -0.00605),
  vec3f(-0.00327, -0.07276, 1.07602),
);
fn aces(x: vec3f) -> vec3f {
  let color = x * ACES_INPUT;
  // RRT and ODT in one rational fit
  let a = color * (color + 0.0245786) - 0.000090537;
  let b = color * (0.983729 * color + 0.4329510) + 0.238081;
  return clamp((a / b) * ACES_OUTPUT, vec3f(0.0), vec3f(1.0));
}

// AgX (Troy Sobotka, Blender 4), minimal fit by Benjamin Wrensch: softer than ACES,
// burnt out colors go to white with less hue shift (red passes orange, not pink)
const AGX_INSET = mat3x3f(
  vec3f(0.842479062253094, 0.0423282422610123, 0.0423756549057051),
  vec3f(0.0784335999999992, 0.878468636469772, 0.0784336),
  vec3f(0.0792237451477643, 0.0791661274605434, 0.879142973793104),
);
const AGX_OUTSET = mat3x3f(
  vec3f(1.19687900512017, -0.0528968517574562, -0.0529716355144438),
  vec3f(-0.0980208811401368, 1.15190312990417, -0.0980434501171241),
  vec3f(-0.0990297440797205, -0.0989611768448433, 1.15107367264116),
);
const AGX_EV = vec2f(-12.47393, 4.026069);
// the agx sigmoid in log space, a polynomial fit of Blender's default contrast
fn agxContrast(x: vec3f) -> vec3f {
  let x2 = x * x;
  let x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x
    + 0.4298 * x2 + 0.1191 * x - 0.00232;
}
// on the display encoded curve, like the looks in Blender
fn agxLook(x: vec3f) -> vec3f {
  let luma = dot(x, LUMA);
  let graded = pow(max(x * bake.lookSlope, vec3f(0.0)), bake.lookPower);
  return luma + bake.lookSaturation * (graded - luma);
}
fn agx(x: vec3f) -> vec3f {
  // column matrices used like in the glsl original: matrix * color
  let inset = AGX_INSET * max(x, vec3f(0.0));
  // log2 of 0 is -inf, clamped to the lowest stop below
  let logColor = clamp(log2(max(inset, vec3f(1e-10))), vec3f(AGX_EV.x), vec3f(AGX_EV.y));
  let curve = agxLook(agxContrast((logColor - AGX_EV.x) / (AGX_EV.y - AGX_EV.x)));
  // the curve ends display encoded (2.2), back to linear for the srgb encode of the screen pass
  let outset = AGX_OUTSET * curve;
  return pow(clamp(outset, vec3f(0.0), vec3f(1.0)), vec3f(2.2));
}
// Hejl-Burgess-Dawson: the curve has a 2.2 gamma baked in, undone here since
// the screen pass encodes srgb itself; without it the image gets encoded twice
fn filmic(x: vec3f) -> vec3f {
  let value = max(vec3f(0.0), x - 0.004);
  let encoded = (value * (6.2 * value + 0.5)) / (value * (6.2 * value + 1.7) + 0.06);
  return pow(encoded, vec3f(2.2));
}
fn toneMap(x: vec3f) -> vec3f {
  switch (bake.mode) {
    case MODE_REINHARD: {
      return reinhard(x);
    }
    case MODE_ACES: {
      return aces(x);
    }
    case MODE_FILMIC: {
      return filmic(x);
    }
    case MODE_AGX: {
      return agx(x);
    }
    default: {
      return x;
    }
  }
}

const LUMA = vec3f(0.2126, 0.7152, 0.0722);
// perceptual operations (contrast, sepia, invert) run on the display encoding
fn srgbEncode(color: vec3f) -> vec3f {
  let low = color * 12.92;
  let high = 1.055 * pow(color, vec3f(1.0 / 2.4)) - 0.055;
  return select(high, low, color <= vec3f(0.0031308));
}
fn srgbDecode(color: vec3f) -> vec3f {
  let low = color / 12.92;
  let high = pow((color + 0.055) / 1.055, vec3f(2.4));
  return select(high, low, color <= vec3f(0.04045));
}

// white balance in lms like Unity: the cone response is scaled, not rgb
const LINEAR_TO_LMS = mat3x3f(
  vec3f(3.90405e-1, 5.49941e-1, 8.92632e-3),
  vec3f(7.08416e-2, 9.63172e-1, 1.35775e-3),
  vec3f(2.31082e-2, 1.28021e-1, 9.36245e-1),
);
const LMS_TO_LINEAR = mat3x3f(
  vec3f(2.85847e+0, -1.62879e+0, -2.48910e-2),
  vec3f(-2.10182e-1, 1.15820e+0, 3.24281e-4),
  vec3f(-4.18120e-2, -1.18169e-1, 1.06867e+0),
);
fn whiteBalance(color: vec3f) -> vec3f {
  return max((color * LINEAR_TO_LMS * bake.whiteBalance) * LMS_TO_LINEAR, vec3f(0.0));
}

fn rgbToHsv(color: vec3f) -> vec3f {
  let k = vec4f(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  let p = select(vec4f(color.gb, k.xy), vec4f(color.bg, k.wz), color.g < color.b);
  let q = select(vec4f(p.xyw, color.r), vec4f(color.r, p.yzx), color.r >= p.x);
  let chroma = q.x - min(q.w, q.y);
  let epsilon = 1e-10;
  return vec3f(abs(q.z + (q.w - q.y) / (6.0 * chroma + epsilon)), chroma / (q.x + epsilon), q.x);
}
fn hsvToRgb(hsv: vec3f) -> vec3f {
  let p = abs(fract(hsv.xxx + vec3f(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return hsv.z * mix(vec3f(1.0), clamp(p - 1.0, vec3f(0.0), vec3f(1.0)), hsv.y);
}

// sepia = brightness toned brown on the display encoding. The classic matrix keeps grey
// almost grey (1 : 0.89 : 0.69), dark scenes came out greyish; this ratio is 1 : 0.78 : 0.55,
// scaled so the luma stays the same
const SEPIA_TONE = vec3f(1.234, 0.963, 0.679);

fn grade(input: vec3f) -> vec3f {
  var color = whiteBalance(input) * bake.colorFilter * bake.brightness;

  var encoded = srgbEncode(color);
  encoded = max((encoded - 0.5) * bake.contrast + 0.5, vec3f(0.0));
  color = srgbDecode(encoded);

  let luma = dot(color, LUMA);
  color = max(luma + bake.saturation * (color - luma), vec3f(0.0));

  if (bake.hueShift != 0.0) {
    var hsv = rgbToHsv(color);
    hsv.x = fract(hsv.x + bake.hueShift);
    color = hsvToRgb(hsv);
  }

  encoded = srgbEncode(color);
  let sepia = min(dot(encoded, LUMA) * SEPIA_TONE, vec3f(1.0));
  encoded = mix(encoded, sepia, bake.sepia);
  encoded = mix(encoded, 1.0 - min(encoded, vec3f(1.0)), bake.invert);
  return srgbDecode(encoded);
}

@compute @workgroup_size(groupSize, groupSize, 1)
fn computeMain(@builtin(global_invocation_id) id: vec3u) {
  let size = textureDimensions(lut);
  if (any(id >= size)) {
    return;
  }
  let coord = vec3f(id) / vec3f(size - 1u);
  let color = grade(toneMap(lutDecode(coord)));
  textureStore(lut, id, vec4f(color, 1.0));
}
