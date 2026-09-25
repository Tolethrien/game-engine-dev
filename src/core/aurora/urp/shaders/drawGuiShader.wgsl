// the shape and the clip id are flat per primitive, so every pixel of a 2x2 quad takes
// the same branch and walks the same clip chain: derivatives stay valid
diagnostic(off, derivative_uniformity);

struct Frame {
  time: f32,
  realTime: f32,
  delta: f32,
  realDelta: f32,
  renderSize: vec2f,
  canvasSize: vec2f,
  frame: u32,
};
@group(0) @binding(0) var<uniform> frame: Frame;
@group(1) @binding(0) var albedo: texture_2d_array<f32>;
@group(1) @binding(3) var uiAtlas: texture_2d_array<f32>;
@group(1) @binding(4) var fonts: texture_2d_array<f32>;
@group(1) @binding(5) var texSampler: sampler;
@group(1) @binding(6) var fontNearest: sampler;
@group(1) @binding(7) var fontLinear: sampler;
// clip rect in canvas pixels, id 0 is no clip; must match ClipBuffer.push in clip/clipBuffer.ts
struct Clip {
  // top left corner before rotation, snapped like a shape anchor
  anchor: vec2f,
  halfSize: vec2f,
  radius: vec4f,
  // cos, sin, around the center like a rect
  rotation: vec2f,
  parent: u32,
};
// must match CLIP.maxDepth in clip/clip.ts
const MAX_CLIP_DEPTH: u32 = 8u;
@group(2) @binding(0) var<storage, read> clips: array<Clip>;
// blur pyramid of gui over scene, rebuilt per backdrop group; mip 0 is half the canvas
@group(2) @binding(1) var backdrop: texture_2d<f32>;
// blur pyramid of the scene alone, built once per frame for backdrops with no gui under them
@group(2) @binding(2) var backdropScene: texture_2d<f32>;
override linearColors: bool = true;

// must match Shape and GuiShape in draw/drawInternal.ts
const SHAPE_BOX: u32 = 0u;
const SHAPE_ELLIPSE: u32 = 1u;
const SHAPE_QUAD: u32 = 2u;
// glyph of an mtsdf atlas: distances in all four channels
const SHAPE_MTSDF: u32 = 3u;
// only the outline ring of a letter, drawn before the fills of its text
const SHAPE_MTSDF_OUTLINE: u32 = 4u;
// glyph of a bitmap or dynamic font: coverage in alpha, distance in red
const SHAPE_GLYPH: u32 = 5u;
const SHAPE_GLYPH_OUTLINE: u32 = 6u;
// box-shadow: box geometry, blur in outlineWidth, params = offset.xy, spread, inset
const SHAPE_SHADOW: u32 = 7u;
const SHAPE_INNER_SHADOW: u32 = 8u;
// text shadow: glyph quad moved by the offset, blur in outlineWidth, params.x = spread
const SHAPE_GLYPH_SHADOW: u32 = 9u;
const SHAPE_MTSDF_SHADOW: u32 = 10u;
// backdrop-filter: box geometry, params.x = blur sigma, replaces what is behind with its blur
const SHAPE_BACKDROP: u32 = 11u;
// the same, reading the scene pyramid: no gui was drawn under it
const SHAPE_BACKDROP_SCENE: u32 = 12u;
// blur sigma of a pyramid level in its own texels, must match BACKDROP.sigmaPerTexel in backdrop/backdrop.ts
const BACKDROP_SIGMA: f32 = 0.8;
// must match UI_ATLAS in draw/drawInternal.ts, marks a layer of the ui texture array
const UI_ATLAS: u32 = 0x80000000u;

// must match GUI_LAYOUT in draw/drawInternal.ts, locations in field order
struct InstanceIn {
  @location(0) position: vec2f,
  @location(1) size: vec2f,
  @location(2) rotation: f32,
  @location(3) color: vec4f,
  @location(4) shapeData: vec4f,
  @location(5) outlineWidth: f32,
  @location(6) outlineColor: vec4f,
  @location(7) shape: u32,
  @location(8) uvRect: vec4f,
  @location(9) layer: u32,
  @location(10) params: vec4f,
  @location(11) materialClip: u32,
};
struct VertexOut {
  @builtin(position) position: vec4f,
  // position from the shape center before rotation, quad: from its first point
  @location(0) local: vec2f,
  @location(1) @interpolate(flat) halfSize: vec2f,
  @location(2) @interpolate(flat) shapeData: vec4f,
  @location(3) @interpolate(flat) color: vec4f,
  @location(4) @interpolate(flat) shape: u32,
  @location(5) @interpolate(flat) uvRect: vec4f,
  @location(6) @interpolate(flat) layer: u32,
  @location(7) @interpolate(flat) outlineWidth: f32,
  @location(8) @interpolate(flat) outlineColor: vec4f,
  // quad corners relative to its first point
  @location(9) @interpolate(flat) quadB: vec2f,
  @location(10) @interpolate(flat) quadC: vec2f,
  @location(11) @interpolate(flat) quadD: vec2f,
  @location(12) @interpolate(flat) params: vec4f,
  @location(13) @interpolate(flat) clip: u32,
  // canvas position of the rendered pixel, from the same snapped anchor as the shape
  @location(14) clipPoint: vec2f,
};

// shapeData readers, must match the write* functions in draw/drawInternal.ts
fn boxCorners(data: vec4f) -> vec4f {
  return data;
}
fn quadPointC(data: vec4f) -> vec2f {
  return data.xy;
}
fn quadPointD(data: vec4f) -> vec2f {
  return data.zw;
}
// glyph: texels of the atlas its distance field reaches
fn glyphRange(data: vec4f) -> f32 {
  return data.x;
}
// glyph: where the letter sits in its text block, 0..1
fn glyphBlockCorner(data: vec4f) -> vec2f {
  return data.yz;
}
// glyph: letter size in its text block, two 12 bit values packed in one float
fn glyphBlockSize(data: vec4f) -> vec2f {
  let packed = data.w;
  let height = floor(packed / 4096.0);
  return vec2f(packed - height * 4096.0, height) / 4095.0;
}

// canvas antialiasing expects srgb blending, our targets are linear
fn textCoverage(coverage: f32, color: vec4f) -> f32 {
  let rgb = color.rgb / max(color.a, 0.0001);
  let luma = dot(rgb, vec3f(0.2126, 0.7152, 0.0722));
  let light = pow(coverage, 2.2);
  let dark = 1.0 - pow(1.0 - coverage, 2.2);
  return mix(dark, light, luma);
}

// anchor is snapped to whole canvas pixels, offset is not,
// so rotated and rounded shapes keep their exact form
fn toPixel(anchor: vec2f, offset: vec2f) -> vec2f {
  return floor(anchor + 0.5) + offset;
}
fn snapAnchor(anchor: vec2f) -> vec2f {
  return floor(anchor + 0.5);
}
// must match packMaterialClip in clip/clip.ts
fn clipOf(materialClip: u32) -> u32 {
  return materialClip >> 16u;
}
// min over the chain, not a product: a child flush with its parent's edge
// would get that edge antialiased twice
fn clipCoverage(id: u32, point: vec2f) -> f32 {
  var coverage = 1.0;
  var current = id;
  for (var depth = 0u; depth < MAX_CLIP_DEPTH && current != 0u; depth++) {
    let clip = clips[current];
    let offset = point - (snapAnchor(clip.anchor) + clip.halfSize);
    let local = vec2f(
      offset.x * clip.rotation.x + offset.y * clip.rotation.y,
      offset.y * clip.rotation.x - offset.x * clip.rotation.y,
    );
    let dist = roundedBox(local, clip.halfSize, clip.radius);
    coverage = min(coverage, clamp(0.5 - dist / max(fwidth(dist), 0.0001), 0.0, 1.0));
    current = clip.parent;
  }
  return coverage;
}
fn pixelToClip(pixel: vec2f) -> vec4f {
  return vec4f(pixel / frame.canvasSize * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
}
fn inputColor(color: vec4f) -> vec4f {
  if (!linearColors) {
    return color;
  }
  let low = color.rgb / 12.92;
  let high = pow((color.rgb + 0.055) / 1.055, vec3f(2.4));
  return vec4f(select(high, low, color.rgb <= vec3f(0.04045)), color.a);
}
fn premultiply(color: vec4f) -> vec4f {
  return vec4f(color.rgb * color.a, color.a);
}

// radius: topLeft, topRight, bottomRight, bottomLeft (y points down)
fn roundedBox(p: vec2f, halfSize: vec2f, radius: vec4f) -> f32 {
  let top = select(radius.x, radius.y, p.x > 0.0);
  let bottom = select(radius.w, radius.z, p.x > 0.0);
  let r = select(top, bottom, p.y > 0.0);
  let q = abs(p) - halfSize + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, vec2f(0.0))) - r;
}
// approximate distance: exact on the edge, good enough for antialiasing
fn ellipse(p: vec2f, radius: vec2f) -> f32 {
  let k0 = length(p / radius);
  let k1 = length(p / (radius * radius));
  return select(
    k0 * (k0 - 1.0) / max(k1, 0.000001),
    -min(radius.x, radius.y),
    k1 < 0.000001,
  );
}

fn cross2(a: vec2f, b: vec2f) -> f32 {
  return a.x * b.y - a.y * b.x;
}
// uv of p inside quad a, b, c, d (clockwise from top left), outside when not in 0..1,
// keeps the texture straight where two triangles would kink along the diagonal
fn invBilinear(p: vec2f, a: vec2f, b: vec2f, c: vec2f, d: vec2f) -> vec2f {
  let e = b - a;
  let f = d - a;
  let g = a - b + c - d;
  let h = p - a;
  let k2 = cross2(g, f);
  let k1 = cross2(e, f) + cross2(h, g);
  let k0 = cross2(h, e);

  let w = k1 * k1 - 4.0 * k0 * k2;
  if (w < 0.0) {
    return vec2f(-1.0);
  }
  // stable roots: k0 / q stays exact when k2 is near zero (almost a parallelogram),
  // dividing by a tiny k2 there loses all precision and the texture collapses
  let q = -0.5 * (k1 + select(-1.0, 1.0, k1 >= 0.0) * sqrt(w));
  var v = k0 / q;
  var u = quadU(h, e, f, g, v);
  if (u < 0.0 || u > 1.0 || v < 0.0 || v > 1.0) {
    v = q / k2;
    u = quadU(h, e, f, g, v);
  }
  return vec2f(u, v);
}
// solves u from the larger axis, a vertical or horizontal edge would divide by zero
fn quadU(h: vec2f, e: vec2f, f: vec2f, g: vec2f, v: f32) -> f32 {
  let denX = e.x + g.x * v;
  let denY = e.y + g.y * v;
  return select((h.y - f.y * v) / denY, (h.x - f.x * v) / denX, abs(denX) > abs(denY));
}

// Evan Wallace, fast rounded rectangle shadows: exact erf along x, 4 samples along y
// https://madebyevan.com/shaders/fast-rounded-rectangle-shadows/
fn gaussian(x: f32, sigma: f32) -> f32 {
  return exp(-(x * x) / (2.0 * sigma * sigma)) / (2.5066282746 * sigma);
}
fn erf2(x: vec2f) -> vec2f {
  let s = sign(x);
  let a = abs(x);
  var y = 1.0 + (0.278393 + (0.230389 + 0.000972 * a) * a) * a;
  y = y * y;
  return s - s / (y * y);
}
fn blurredBoxX(x: f32, y: f32, sigma: f32, corner: f32, halfSize: vec2f) -> f32 {
  let delta = min(halfSize.y - corner - abs(y), 0.0);
  let curved = halfSize.x - corner + sqrt(max(0.0, corner * corner - delta * delta));
  let integral = 0.5 + 0.5 * erf2((x + vec2f(-curved, curved)) * (0.7071067812 / sigma));
  return integral.y - integral.x;
}
// coverage of a gaussian blurred rounded box centered at 0, one corner radius per quadrant
fn blurredBox(p: vec2f, halfSize: vec2f, radius: vec4f, sigma: f32) -> f32 {
  if (halfSize.x <= 0.0 || halfSize.y <= 0.0) {
    return 0.0;
  }
  let top = select(radius.x, radius.y, p.x > 0.0);
  let bottom = select(radius.w, radius.z, p.x > 0.0);
  let corner = min(select(top, bottom, p.y > 0.0), min(halfSize.x, halfSize.y));
  let low = p.y - halfSize.y;
  let high = p.y + halfSize.y;
  let start = clamp(-3.0 * sigma, low, high);
  let end = clamp(3.0 * sigma, low, high);
  let stride = (end - start) / 4.0;
  var y = start + stride * 0.5;
  var value = 0.0;
  for (var i = 0; i < 4; i++) {
    value += blurredBoxX(p.x, p.y - y, sigma, corner, halfSize) * gaussian(y, sigma) * stride;
    y += stride;
  }
  return value;
}
// shadows skip the material, offset and spread act on the box like in css
fn shadowCoverage(in: VertexOut, corners: vec4f, dist: f32, aa: f32, coverage: f32) -> f32 {
  let offset = in.params.xy;
  let spread = in.params.z;
  let sigma = max(in.outlineWidth * 0.5, 0.5);
  if (in.shape == SHAPE_SHADOW) {
    let radius = max(corners + spread, vec4f(0.0));
    let blurred = blurredBox(in.local - offset, in.halfSize + spread, radius, sigma);
    // always cut out under the box, a see-through panel must not show its own shadow
    return blurred * (1.0 - coverage);
  }
  // inner: inside the box shrunk by its outline, outside a blurred box shrunk by spread
  let inset = in.params.w;
  let mask = clamp(0.5 - (dist + inset) / aa, 0.0, 1.0);
  let shrink = inset + spread;
  let radius = max(corners - shrink, vec4f(0.0));
  let blurred = blurredBox(in.local - offset, in.halfSize - shrink, radius, sigma);
  return mask * (1.0 - blurred);
}

// cubic b-spline from 4 bilinear taps, a plain bilinear read of a small level shows its texels
fn backdropSample(pyramid: texture_2d<f32>, uv: vec2f, level: f32) -> vec4f {
  let size = vec2f(textureDimensions(pyramid, u32(level)));
  let position = uv * size - 0.5;
  let base = floor(position);
  let f = position - base;
  let f2 = f * f;
  let f3 = f2 * f;
  let w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
  let w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  let w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
  let w3 = f3 / 6.0;
  let g0 = w0 + w1;
  let g1 = w2 + w3;
  // each tap lands between two texel centers by the ratio of their weights
  let low = (base - 0.5 + w1 / g0) / size;
  let high = (base + 1.5 + w3 / g1) / size;
  let a = textureSampleLevel(pyramid, texSampler, low, level);
  let b = textureSampleLevel(pyramid, texSampler, vec2f(high.x, low.y), level);
  let c = textureSampleLevel(pyramid, texSampler, vec2f(low.x, high.y), level);
  let d = textureSampleLevel(pyramid, texSampler, high, level);
  return g0.y * (g0.x * a + g1.x * b) + g1.y * (g0.x * c + g1.x * d);
}
fn backdropColor(pyramid: texture_2d<f32>, pixel: vec2f, sigma: f32) -> vec4f {
  let uv = pixel / frame.canvasSize;
  let top = f32(textureNumLevels(pyramid) - 1u);
  // must match backdropLevel in backdrop/backdrop.ts
  let level = clamp(log2(max(sigma, 0.0001) / BACKDROP_SIGMA) - 1.0, 0.0, top);
  let low = floor(level);
  var color = backdropSample(pyramid, uv, low);
  // levels above what the region needed hold stale data, even at zero weight a NaN would leak
  if (level > low) {
    color = mix(color, backdropSample(pyramid, uv, low + 1.0), level - low);
  }
  return color;
}

// contract of every material in urp/shaders/materials, do not change field meaning
struct MaterialInput {
  // 0..1 across the shape, before rotation
  uv: vec2f,
  // pixels from the shape center, before rotation
  local: vec2f,
  size: vec2f,
  // premultiplied
  color: vec4f,
  outlineColor: vec4f,
  texel: vec4f,
  // 1 on the outline band, 0 inside the fill
  ring: f32,
  // signed distance to the outer edge, negative inside, approximate on quads
  dist: f32,
  // how far dist stays true
  reach: f32,
  params: vec4f,
};

// replaced with the material fragment, one pipeline per material:
// fn material(in: MaterialInput) -> vec4f, returns premultiplied color
// MATERIAL

@vertex
fn vertexMain(@builtin(vertex_index) index: u32, instance: InstanceIn) -> VertexOut {
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
  );
  let corner = corners[index];
  var out: VertexOut;

  if (instance.shape == SHAPE_QUAD) {
    // quad packs its 4 points into position, size and shapeData
    let a = instance.position;
    let b = instance.size;
    let c = quadPointC(instance.shapeData);
    let d = quadPointD(instance.shapeData);
    let top = select(a, b, corner.x > 0.0);
    let bottom = select(d, c, corner.x > 0.0);
    let point = select(top, bottom, corner.y > 0.0);
    out.position = pixelToClip(toPixel(a, point - a));
    out.clipPoint = snapAnchor(a) + point - a;
    out.local = point - a;
    out.halfSize = vec2f(length(b - a), length(d - a)) * 0.5;
    out.quadB = b - a;
    out.quadC = c - a;
    out.quadD = d - a;
  } else {
    let halfSize = instance.size * 0.5;
    // one pixel of margin, so the antialiased edge is not cut by the quad
    var pad = 1.0;
    if (instance.shape == SHAPE_SHADOW) {
      // the outer shadow reaches past the box: offset, spread and 3 sigma of blur
      let offset = instance.params.xy;
      pad += max(abs(offset.x), abs(offset.y)) + max(instance.params.z, 0.0) + 1.5 * instance.outlineWidth;
    }
    let local = corner * (halfSize + pad);
    let c = cos(instance.rotation);
    let s = sin(instance.rotation);
    let rotated = vec2f(local.x * c - local.y * s, local.x * s + local.y * c);
    out.position = pixelToClip(toPixel(instance.position, halfSize + rotated));
    out.clipPoint = snapAnchor(instance.position) + halfSize + rotated;
    out.local = local;
    out.halfSize = halfSize;
  }

  out.shapeData = instance.shapeData;
  out.color = premultiply(inputColor(instance.color));
  out.shape = instance.shape;
  out.uvRect = instance.uvRect;
  out.layer = instance.layer;
  out.outlineWidth = instance.outlineWidth;
  out.outlineColor = premultiply(inputColor(instance.outlineColor));
  out.params = instance.params;
  out.clip = clipOf(instance.materialClip);
  return out;
}

@fragment
fn fragmentMain(in: VertexOut) -> @location(0) vec4f {
  let clip = clipCoverage(in.clip, in.clipPoint);
  // discard keeps helpers for derivatives
  if (clip < 0.0001) {
    discard;
  }
  let msdfGlyph = in.shape == SHAPE_MTSDF || in.shape == SHAPE_MTSDF_OUTLINE || in.shape == SHAPE_MTSDF_SHADOW;
  let maskGlyph = in.shape == SHAPE_GLYPH || in.shape == SHAPE_GLYPH_OUTLINE || in.shape == SHAPE_GLYPH_SHADOW;
  let glyph = msdfGlyph || maskGlyph;
  let glyphOutline = in.shape == SHAPE_MTSDF_OUTLINE || in.shape == SHAPE_GLYPH_OUTLINE;
  let glyphShadow = in.shape == SHAPE_MTSDF_SHADOW || in.shape == SHAPE_GLYPH_SHADOW;
  var uv01: vec2f;
  var local = in.local;
  var dist: f32;
  // glyphs carry their field in shapeData, their quad has square corners
  let maxRadius = vec4f(min(in.halfSize.x, in.halfSize.y));
  let corners = select(min(boxCorners(in.shapeData), maxRadius), vec4f(0.0), glyph);
  if (in.shape == SHAPE_QUAD) {
    let quadUv = invBilinear(in.local, vec2f(0.0), in.quadB, in.quadC, in.quadD);
    // approximate px: uv-space distance scaled by the shorter of the two edges from the first point
    let edge = min(length(in.quadB), length(in.quadD));
    dist = -min(min(quadUv.x, 1.0 - quadUv.x), min(quadUv.y, 1.0 - quadUv.y)) * edge;
    uv01 = clamp(quadUv, vec2f(0.0), vec2f(1.0));
    // materials get a centered local like on other shapes
    local = (uv01 - 0.5) * in.halfSize * 2.0;
  } else {
    // clamp keeps the antialiasing margin from reading neighbours in the atlas
    uv01 = clamp(in.local / in.halfSize * 0.5 + 0.5, vec2f(0.0), vec2f(1.0));
    if (in.shape == SHAPE_ELLIPSE) {
      dist = ellipse(in.local, in.halfSize);
    } else {
      dist = roundedBox(in.local, in.halfSize, corners);
    }
  }

  var glyphDist = 0.0;
  var glyphReach = 0.0;
  var glyphCoverage = 0.0;
  if (glyph) {
    // letters may touch their cell edge, half a texel inset keeps the
    // edge sample from picking the neighbouring cell in the atlas
    let atlasSize = vec2f(textureDimensions(fonts, 0).xy);
    let halfTexel = 0.5 / atlasSize;
    let glyphUv = clamp(
      in.uvRect.xy + uv01 * in.uvRect.zw,
      in.uvRect.xy + halfTexel,
      in.uvRect.xy + in.uvRect.zw - halfTexel,
    );
    let pixelsPerTexel = in.halfSize.x * 2.0 / (in.uvRect.z * atlasSize.x);
    glyphReach = glyphRange(in.shapeData) * pixelsPerTexel;
    if (msdfGlyph) {
      let data = textureSampleLevel(fonts, fontLinear, glyphUv, in.layer, 0.0);
      let median = max(min(data.r, data.g), min(max(data.r, data.g), data.b));
      let sharp = (0.5 - median) * 2.0 * glyphReach;
      let soft = (0.5 - data.a) * 2.0 * glyphReach;
      // the median keeps corners sharp near the edge, the plain field in alpha
      // is the honest distance further out, where outlines and shadows live
      glyphDist = mix(sharp, soft, smoothstep(0.3, 0.8, abs(soft) / glyphReach));
    } else {
      // alpha is coverage, red the distance: 0.5 on the edge, the reach to 0 and 1
      glyphCoverage = textureSampleLevel(fonts, fontNearest, glyphUv, in.layer, 0.0).a;
      let field = textureSampleLevel(fonts, fontLinear, glyphUv, in.layer, 0.0).r;
      glyphDist = (0.5 - field) * 2.0 * glyphReach;
    }
  }
  // fwidth must stay out of branches
  let aa = max(fwidth(dist), 0.0001);
  let coverage = clamp(0.5 - dist / aa, 0.0, 1.0);
  // outline grows inward, at most to the center of the shorter side
  let outlineWidth = min(in.outlineWidth, min(in.halfSize.x, in.halfSize.y));
  let fill = clamp(0.5 - (dist + outlineWidth) / aa, 0.0, 1.0);
  let glyphAa = max(fwidth(glyphDist), 0.0001);

  if (in.shape == SHAPE_SHADOW || in.shape == SHAPE_INNER_SHADOW) {
    return in.color * shadowCoverage(in, corners, dist, aa, coverage) * clip;
  }
  // replaces what is behind inside the shape, the box drawn next tints it
  if (in.shape == SHAPE_BACKDROP) {
    return backdropColor(backdrop, in.position.xy, in.params.x) * coverage * clip;
  }
  if (in.shape == SHAPE_BACKDROP_SCENE) {
    return backdropColor(backdropScene, in.position.xy, in.params.x) * coverage * clip;
  }
  if (glyphShadow) {
    // the field is no convolution, a smoothstep of +-blur fades about as wide as the box gaussian
    let width = max(in.outlineWidth, glyphAa * 0.5);
    return in.color * (1.0 - smoothstep(-width, width, glyphDist - in.params.x)) * clip;
  }

  // textures have no mips, so the level sample works inside a branch
  var texel: vec4f;
  if ((in.layer & UI_ATLAS) != 0u) {
    // the ui array is plain rgba8unorm, unlike the srgb albedo it needs decoding here
    let layer = in.layer & ~UI_ATLAS;
    let uv = (in.uvRect.xy + uv01 * in.uvRect.zw) / vec2f(textureDimensions(uiAtlas, 0));
    texel = premultiply(inputColor(textureSampleLevel(uiAtlas, texSampler, uv, layer, 0.0)));
  } else {
    let uv = (in.uvRect.xy + uv01 * in.uvRect.zw) / vec2f(textureDimensions(albedo, 0));
    // albedo is srgb and premultiplied at load: sampling returns linear premultiplied
    texel = textureSampleLevel(albedo, texSampler, uv, in.layer, 0.0);
  }
  if (glyph) {
    // mtsdf has no coverage channel, it comes from the distance
    let covered = select(glyphCoverage, clamp(0.5 - glyphDist / glyphAa, 0.0, 1.0), msdfGlyph);
    // the outline layer paints no fill, the fill of the text comes later on top
    texel = vec4f(select(textCoverage(covered, in.color), 0.0, glyphOutline));
  }

  var input: MaterialInput;
  input.uv = uv01;
  input.local = local;
  input.size = in.halfSize * 2.0;
  input.color = in.color;
  input.outlineColor = in.outlineColor;
  input.texel = texel;
  // share of the covered pixel that lies on the outline band
  input.ring = (coverage - fill) / max(coverage, 0.0001);
  input.dist = dist;
  // shapes are true distances everywhere
  input.reach = max(in.halfSize.x, in.halfSize.y);
  input.params = in.params;
  if (glyph) {
    // text outlines grow outwards, the letter itself stays untouched; the ring
    // reaches 1.5px under the letter so its edge blends over a solid ring, no seam
    let outer = clamp(0.5 - (glyphDist - in.outlineWidth) / glyphAa, 0.0, 1.0);
    let inner = clamp(0.5 - (glyphDist + glyphAa * 1.5) / glyphAa, 0.0, 1.0);
    input.ring = select(0.0, outer - inner, glyphOutline);
    input.dist = glyphDist;
    input.reach = glyphReach;
    input.uv = glyphBlockCorner(in.shapeData) + uv01 * glyphBlockSize(in.shapeData);
  }
  // the material paints the shape, coverage cuts it to the antialiased edge
  return material(input) * coverage * clip;
}
