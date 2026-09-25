@group(1) @binding(5) var texSampler: sampler;
@group(2) @binding(0) var offscreenCanvas: texture_2d<f32>;
// canvas sized, read texel to texel
@group(2) @binding(1) var gui: texture_2d<f32>;
// mirrors ScreenPas.writeParams
struct Screen {
  invGamma: f32,
  _pad: f32,
  // render texels under one canvas pixel
  texelsPerPixel: vec2f,
};
@group(2) @binding(2) var<uniform> screen: Screen;

override linearColors: bool = true;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

fn outputColor(color: vec3f) -> vec3f {
  if (!linearColors) {
    return color;
  }
  let low = color * 12.92;
  let high = 1.055 * pow(color, vec3f(1.0 / 2.4)) - 0.055;
  return select(high, low, color <= vec3f(0.0031308));
}

// render quality differs from the canvas: a smaller render is enlarged with sharp bilinear
// (texels stay crisp at a fractional scale), a larger one averages the pixel's footprint
// (supersampling; one bilinear tap there skips texels and shimmers in motion)
fn sceneColor(uv: vec2f) -> vec4f {
  let size = vec2f(textureDimensions(offscreenCanvas));
  let ratio = screen.texelsPerPixel;
  if (max(ratio.x, ratio.y) <= 1.0) {
    let position = uv * size;
    let edge = floor(position + 0.5);
    let sharp = edge + clamp((position - edge) / max(ratio, vec2f(0.0001)), vec2f(-0.5), vec2f(0.5));
    return textureSampleLevel(offscreenCanvas, texSampler, sharp / size, 0.0);
  }
  // taps spread evenly over the footprint, each bilinear read already averages up to 2x2
  let taps = vec2i(clamp(ceil(ratio), vec2f(1.0), vec2f(4.0)));
  let spacing = ratio / vec2f(taps);
  let first = uv * size - ratio * 0.5 + spacing * 0.5;
  var sum = vec4f(0.0);
  for (var y = 0; y < taps.y; y++) {
    for (var x = 0; x < taps.x; x++) {
      let position = first + spacing * vec2f(f32(x), f32(y));
      sum += textureSampleLevel(offscreenCanvas, texSampler, position / size, 0.0);
    }
  }
  return sum / f32(taps.x * taps.y);
}

// interleaved gradient noise (Jimenez 2014): 0..1, even spread, no texture needed
fn gradientNoise(pixel: vec2f) -> f32 {
  return fract(52.9829189 * fract(dot(pixel, vec2f(0.06711056, 0.00583715))));
}
// triangular noise of +-1 step of the 8 bit canvas: breaks gradient banding in dark
// light falloffs; triangular hides the noise itself better than a flat one
fn dither(pixel: vec2f) -> f32 {
  let noise = gradientNoise(pixel) + gradientNoise(pixel + vec2f(113.0, 71.0)) - 1.0;
  return noise / 255.0;
}

@vertex
fn vertexMain(@builtin(vertex_index) index: u32) -> VertexOut {
  var corners = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
  );
  let corner = corners[index];
  var out: VertexOut;
  out.position = vec4f(corner * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
  out.uv = corner;
  return out;
}

@fragment
fn fragmentMain(in: VertexOut) -> @location(0) vec4f {
  let scene = sceneColor(in.uv);
  let overlay = textureLoad(gui, vec2u(in.position.xy), 0);
  // both premultiplied and linear, composed before the single srgb encode
  let color = clamp(overlay + scene * (1.0 - overlay.a), vec4f(0.0), vec4f(1.0));
  if (color.a <= 0.0) {
    return vec4f(0.0);
  }
  // srgb encode is non-linear, so it runs on straight color, the canvas wants premultiplied back
  // display calibration on the straight color, before the encode: black and white stay put
  let straight = pow(min(color.rgb / color.a, vec3f(1.0)), vec3f(screen.invGamma));
  // after the encode: the noise must be one step of what the canvas stores
  let encoded = clamp(outputColor(straight) + dither(in.position.xy), vec3f(0.0), vec3f(1.0));
  return vec4f(encoded * color.a, color.a);
}