// the shape is constant per primitive, so every pixel of a 2x2 quad takes the same
// branch: the shadow return does not break derivatives a material may still take
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
struct Camera {
  position: vec2f,
  zoom: f32,
  rotation: f32,
};
const SHAPE_BOX: u32 = 0u;
const SHAPE_ELLIPSE: u32 = 1u;
const SHAPE_QUAD: u32 = 2u;
// box that takes its coverage from the font array
const SHAPE_GLYPH: u32 = 3u;
// only the outline ring of a glyph, drawn before the fills of its text
const SHAPE_GLYPH_OUTLINE: u32 = 4u;
// glyph of an mtsdf atlas: distances in all four channels
const SHAPE_MTSDF: u32 = 5u;
const SHAPE_MTSDF_OUTLINE: u32 = 6u;
// gui box-shadow: box geometry, blur in outlineWidth, params = offset.xy, spread, inset
const SHAPE_SHADOW: u32 = 7u;
const SHAPE_INNER_SHADOW: u32 = 8u;
// gui text shadow: glyph quad moved by the offset, blur in outlineWidth, params.x = spread
const SHAPE_GLYPH_SHADOW: u32 = 9u;
const SHAPE_MTSDF_SHADOW: u32 = 10u;
// gui backdrop-filter: box geometry, params.x = blur sigma, samples the blurred snapshot of what is behind
const SHAPE_BACKDROP: u32 = 11u;
// blur sigma of a backdrop level in its own texels, must match BACKDROP.sigmaPerTexel in passes/draw.ts
const BACKDROP_SIGMA: f32 = 0.8;
struct SortParams {
  // per axis: x, y, z
  origin: vec3f,
  total: f32,
  step: vec3f,
  _pad0: f32,
  count: vec3f,
  _pad1: f32,
  // 0 for axes the mode does not use
  weight: vec3f,
  _pad2: f32,
};
@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var<uniform> camera: Camera;
@group(1) @binding(0) var albedo: texture_2d_array<f32>;
@group(1) @binding(3) var uiAtlas: texture_2d_array<f32>;
@group(1) @binding(4) var fonts: texture_2d_array<f32>;
@group(1) @binding(5) var texSampler: sampler;
@group(1) @binding(6) var fontNearest: sampler;
@group(1) @binding(7) var fontLinear: sampler;
// clip rect in draw space, id 0 is no clip; must match pushClip in passes/draw.ts
struct Clip {
  // top left corner before rotation, snapped like a shape anchor
  anchor: vec2f,
  halfSize: vec2f,
  radius: vec4f,
  // cos, sin, around the center like a rect
  rotation: vec2f,
  parent: u32,
};
// must match CLIP.maxDepth in passes/draw.ts
const MAX_CLIP_DEPTH: u32 = 8u;
@group(2) @binding(0) var<uniform> sortParams: SortParams;
// gui: blur pyramid of scene + gui, mip 0 is half the canvas; world: 1x1 placeholder
@group(2) @binding(1) var backdrop: texture_2d<f32>;
@group(2) @binding(2) var<storage, read> clips: array<Clip>;
override linearColors: bool = true;
override depthSort: bool = false;
override opaquePass: bool = false;
// gui: positions are canvas pixels, no camera, target is canvas sized
override screenSpace: bool = false;
// "gx+gy+z": sortDepth reads the diagonal gx + gy + z instead of point.y
override isoSort: bool = false;
// must match UI_ATLAS in draw.ts, marks a layer of the ui texture array
const UI_ATLAS: u32 = 0x80000000u;

fn viewSize() -> vec2f {
  return select(frame.renderSize, frame.canvasSize, screenSpace);
}
// anchor is snapped to whole render texels, offset is not,
// so rotated and rounded shapes keep their exact form
fn worldToPixel(anchor: vec2f, offset: vec2f) -> vec2f {
  if (screenSpace) {
    return floor(anchor + 0.5) + offset;
  }
  let center = floor(frame.renderSize * 0.5);
  let cam = floor((camera.position + center) * camera.zoom + 0.5);
  let rel = floor(anchor * camera.zoom + 0.5) - cam + offset * camera.zoom;
  if (camera.rotation == 0.0) {
    return rel + center;
  }
  let c = cos(camera.rotation);
  let s = sin(camera.rotation);
  return vec2f(rel.x * c - rel.y * s, rel.x * s + rel.y * c) + center;
}
// the anchor worldToPixel puts on screen, still in draw space (world units or canvas px)
fn snapAnchor(anchor: vec2f) -> vec2f {
  if (screenSpace) {
    return floor(anchor + 0.5);
  }
  return floor(anchor * camera.zoom + 0.5) / camera.zoom;
}
// larger key is closer, must match sortKey in passes/draw.ts
fn sortDepth(point: vec3f) -> f32 {
  let sorted = vec3f(point.x, select(point.y, point.x + point.y + point.z, isoSort), point.z);
  let index = clamp(
    floor((sorted - sortParams.origin) / sortParams.step),
    vec3f(0.0),
    sortParams.count - 1.0,
  );
  let key = dot(index, sortParams.weight);
  return 1.0 - (key + 1.0) / (sortParams.total + 1.0);
}

// approximate distance: exact on the edge, good enough for
// antialiasing and outlines, drifts only for thick outlines
// on very stretched ellipses
fn ellipse(p: vec2f, radius: vec2f) -> f32 {
  let k0 = length(p / radius);
  let k1 = length(p / (radius * radius));
  return select(
    k0 * (k0 - 1.0) / max(k1, 0.000001),
    -min(radius.x, radius.y),
    k1 < 0.000001,
  );
}

// canvas antialiasing expects srgb blending, our targets are linear
fn textCoverage(coverage: f32, color: vec4f) -> f32 {
  let rgb = color.rgb / max(color.a, 0.0001);
  let luma = dot(rgb, vec3f(0.2126, 0.7152, 0.0722));
  let light = pow(coverage, 2.2);
  let dark = 1.0 - pow(1.0 - coverage, 2.2);
  return mix(dark, light, luma);
}

fn pixelToClip(pixel: vec2f) -> vec4f {
  return vec4f(pixel / viewSize() * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
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

struct InstanceIn {
  @location(0) position: vec2f,
  @location(1) size: vec2f,
  @location(2) rotation: f32,
  @location(3) radius: vec4f,
  @location(4) outlineWidth: f32,
  @location(5) color: vec4f,
  @location(6) outlineColor: vec4f,
  @location(7) shape: u32,
  @location(8) uvRect: vec4f,
  @location(9) layer: u32,
  @location(10) sortPoint: vec3f,
  @location(11) params: vec4f,
  @location(12) materialClip: u32,
};

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) @interpolate(flat) halfSize: vec2f,
  @location(2) @interpolate(flat) radius: vec4f,
  @location(3) @interpolate(flat) outlineWidth: f32,
  @location(4) @interpolate(flat) color: vec4f,
  @location(5) @interpolate(flat) outlineColor: vec4f,
  @location(6) @interpolate(flat) shape: u32,
  @location(7) @interpolate(flat) uvRect: vec4f,
  @location(8) @interpolate(flat) layer: u32,
  @location(9) @interpolate(flat) params: vec4f,
  // quad corners relative to its first point
  @location(10) @interpolate(flat) quadB: vec2f,
  @location(11) @interpolate(flat) quadC: vec2f,
  @location(12) @interpolate(flat) quadD: vec2f,
  @location(13) @interpolate(flat) clip: u32,
  // draw space position of the rendered pixel, clips are tested against it
  @location(14) clipPoint: vec2f,
};

@vertex
fn vertexMain(@builtin(vertex_index) index: u32, instance: InstanceIn) -> VertexOut {
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
  );
  let corner = corners[index];
  var out: VertexOut;

  if (instance.shape == SHAPE_QUAD) {
    // quads pack their 4 points into position, size and radius
    let a = instance.position;
    let b = instance.size;
    let c = instance.radius.xy;
    let d = instance.radius.zw;
    let top = select(a, b, corner.x > 0.0);
    let bottom = select(d, c, corner.x > 0.0);
    let point = select(top, bottom, corner.y > 0.0);
    out.position = pixelToClip(worldToPixel(a, point - a));
    out.clipPoint = snapAnchor(a) + point - a;
    out.local = point - a;
    out.halfSize = vec2f(length(b - a), length(d - a)) * 0.5;
    out.quadB = b - a;
    out.quadC = c - a;
    out.quadD = d - a;
  } else {
    let halfSize = instance.size * 0.5;
    // one render texel of margin for antialiasing
    var pad = select(1.0 / camera.zoom, 1.0, screenSpace);
    if (instance.shape == SHAPE_SHADOW) {
      // outer shadow reaches past the box: offset, spread and 3 sigma of blur
      let offset = instance.params.xy;
      pad += max(abs(offset.x), abs(offset.y)) + max(instance.params.z, 0.0) + 1.5 * instance.outlineWidth;
    }
    let local = corner * (halfSize + pad);
    let c = cos(instance.rotation);
    let s = sin(instance.rotation);
    let rotated = vec2f(local.x * c - local.y * s, local.x * s + local.y * c);
    out.position = pixelToClip(worldToPixel(instance.position, halfSize + rotated));
    out.clipPoint = snapAnchor(instance.position) + halfSize + rotated;
    out.local = local;
    out.halfSize = halfSize;
  }

  out.position.z = select(0.0, sortDepth(instance.sortPoint), depthSort);
  out.radius = instance.radius;
  out.outlineWidth = instance.outlineWidth;
  out.color = premultiply(inputColor(instance.color));
  out.outlineColor = premultiply(inputColor(instance.outlineColor));
  out.shape = instance.shape;
  out.uvRect = instance.uvRect;
  out.layer = instance.layer;
  out.params = instance.params;
  out.clip = instance.materialClip >> 16u;
  return out;
}

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
  // how far dist stays true: the reach of the distance field of a glyph in pixels
  reach: f32,
  params: vec4f,
};

// MATERIAL

// shadows skip the material, offset and spread act on the box like in css
fn shadowCoverage(in: VertexOut, dist: f32, aa: f32, shape: f32) -> f32 {
  let offset = in.params.xy;
  let spread = in.params.z;
  let sigma = max(in.outlineWidth * 0.5, 0.5);
  if (in.shape == SHAPE_SHADOW) {
    let radius = max(in.radius + spread, vec4f(0.0));
    let blurred = blurredBox(in.local - offset, in.halfSize + spread, radius, sigma);
    // always cut out under the box, a see-through panel must not show its own shadow
    return blurred * (1.0 - shape);
  }
  // inner: inside the box shrunk by its outline, outside a blurred box shrunk by spread
  let inset = in.params.w;
  let mask = clamp(0.5 - (dist + inset) / aa, 0.0, 1.0);
  let shrink = inset + spread;
  let radius = max(in.radius - shrink, vec4f(0.0));
  let blurred = blurredBox(in.local - offset, in.halfSize - shrink, radius, sigma);
  return mask * (1.0 - blurred);
}

// cubic b-spline from 4 bilinear taps, a plain bilinear read of a small level shows its texels
fn backdropSample(uv: vec2f, level: f32) -> vec4f {
  let size = vec2f(textureDimensions(backdrop, u32(level)));
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
  let a = textureSampleLevel(backdrop, texSampler, low, level);
  let b = textureSampleLevel(backdrop, texSampler, vec2f(high.x, low.y), level);
  let c = textureSampleLevel(backdrop, texSampler, vec2f(low.x, high.y), level);
  let d = textureSampleLevel(backdrop, texSampler, high, level);
  return g0.y * (g0.x * a + g1.x * b) + g1.y * (g0.x * c + g1.x * d);
}

fn backdropColor(pixel: vec2f, sigma: f32) -> vec4f {
  let uv = pixel / frame.canvasSize;
  let top = f32(textureNumLevels(backdrop) - 1u);
  // must match backdropLevel in passes/draw.ts
  let level = clamp(log2(max(sigma, 0.0001) / BACKDROP_SIGMA) - 1.0, 0.0, top);
  let low = floor(level);
  var color = backdropSample(uv, low);
  // levels above what the group needed hold stale data, even at zero weight a NaN would leak
  if (level > low) {
    color = mix(color, backdropSample(uv, low + 1.0), level - low);
  }
  return color;
}

// the clip id is flat per primitive, so fwidth inside the loop sees the same path on the whole 2x2 quad
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
    // min, not a product: a child flush with its parent's edge would get that edge antialiased twice
    coverage = min(coverage, clamp(0.5 - dist / max(fwidth(dist), 0.0001), 0.0, 1.0));
    current = clip.parent;
  }
  return coverage;
}

@fragment
fn fragmentMain(in: VertexOut) -> @location(0) vec4f {
  let clip = clipCoverage(in.clip, in.clipPoint);
  // opaque writes depth, a pixel mostly cut away must not; discard keeps helpers for derivatives
  if (clip < select(0.0001, 0.5, opaquePass)) {
    discard;
  }
  let color = shade(in);
  return select(color * clip, color, opaquePass);
}

fn shade(in: VertexOut) -> vec4f {
  let maskGlyph = in.shape == SHAPE_GLYPH || in.shape == SHAPE_GLYPH_OUTLINE || in.shape == SHAPE_GLYPH_SHADOW;
  let msdfGlyph = in.shape == SHAPE_MTSDF || in.shape == SHAPE_MTSDF_OUTLINE || in.shape == SHAPE_MTSDF_SHADOW;
  let glyph = maskGlyph || msdfGlyph;
  let glyphOutline = in.shape == SHAPE_GLYPH_OUTLINE || in.shape == SHAPE_MTSDF_OUTLINE;
  var uv01: vec2f;
  var local = in.local;
  var dist: f32;

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
      // glyphs keep their reach in radius, their quad has square corners
      dist = roundedBox(in.local, in.halfSize, select(in.radius, vec4f(0.0), glyph));
    }
  }

  let uv = in.uvRect.xy + uv01 * in.uvRect.zw;
  // textures have no mips, so the level sample works inside a branch
  let layer = in.layer & ~UI_ATLAS;
  var sampled: vec4f;
  var glyphDist = 0.0;
  var glyphCoverage = 0.0;
  var pixelsPerGlyphTexel = 0.0;
  if (glyph) {
    // glyphs may touch their cell edge, half a texel inset keeps the
    // edge sample from picking the neighbouring cell in the atlas
    let atlasSize = vec2f(textureDimensions(fonts, 0).xy);
    let halfTexel = 0.5 / atlasSize;
    let glyphUv = clamp(uv, in.uvRect.xy + halfTexel, in.uvRect.xy + in.uvRect.zw - halfTexel);
    pixelsPerGlyphTexel = in.halfSize.x * 2.0 / (in.uvRect.z * atlasSize.x);
    // radius carries how many texels the distance field of this glyph reaches
    let reach = in.radius.x * pixelsPerGlyphTexel;
    if (msdfGlyph) {
      let data = textureSampleLevel(fonts, fontLinear, glyphUv, in.layer, 0.0);
      let median = max(min(data.r, data.g), min(max(data.r, data.g), data.b));
      let sharp = (0.5 - median) * 2.0 * reach;
      let soft = (0.5 - data.a) * 2.0 * reach;
      // the median keeps corners sharp near the edge, the plain field in alpha
      // is the honest distance further out, where outlines and glows live
      glyphDist = mix(sharp, soft, smoothstep(0.3, 0.8, abs(soft) / reach));
    } else {
      // alpha is coverage, red the distance: 0.5 on the edge, the reach to 0 and 1
      glyphCoverage = textureSampleLevel(fonts, fontNearest, glyphUv, in.layer, 0.0).a;
      let field = textureSampleLevel(fonts, fontLinear, glyphUv, in.layer, 0.0).r;
      glyphDist = (0.5 - field) * 2.0 * reach;
    }
    sampled = vec4f(1.0);
  } else if ((in.layer & UI_ATLAS) != 0u) {
    // ui array is plain rgba8unorm, unlike the srgb albedo it needs decoding here
    sampled = inputColor(textureSampleLevel(uiAtlas, texSampler, uv, layer, 0.0));
  } else {
    sampled = textureSampleLevel(albedo, texSampler, uv, layer, 0.0);
  }
  var texel = premultiply(sampled);
  let aa = max(fwidth(dist), 0.0001);
  let shape = clamp(0.5 - dist / aa, 0.0, 1.0);
  let fill = clamp(0.5 - (dist + in.outlineWidth) / aa, 0.0, 1.0);
  // derivatives must stay outside branches
  let glyphAa = max(fwidth(glyphDist), 0.0001);
  if (glyph) {
    // mtsdf has no coverage channel, it comes from the distance
    let covered = select(glyphCoverage, clamp(0.5 - glyphDist / glyphAa, 0.0, 1.0), msdfGlyph);
    // the outline layer paints no fill, the fill of the text comes later on top
    texel = vec4f(select(textCoverage(covered, in.color), 0.0, glyphOutline));
  }

  if (in.shape == SHAPE_SHADOW || in.shape == SHAPE_INNER_SHADOW) {
    return in.color * shadowCoverage(in, dist, aa, shape);
  }
  if (in.shape == SHAPE_BACKDROP) {
    // replaces what is behind inside the shape, the box drawn next tints it
    return backdropColor(in.position.xy, in.params.x) * shape;
  }
  if (in.shape == SHAPE_GLYPH_SHADOW || in.shape == SHAPE_MTSDF_SHADOW) {
    // the field is no convolution, a smoothstep of +-blur fades about as wide as the box gaussian
    let width = max(in.outlineWidth, glyphAa * 0.5);
    return in.color * (1.0 - smoothstep(-width, width, glyphDist - in.params.x));
  }

  var input: MaterialInput;
  input.uv = uv01;
  input.local = local;
  input.size = in.halfSize * 2.0;
  input.color = in.color;
  input.outlineColor = in.outlineColor;
  input.texel = texel;
  input.ring = (shape - fill) / max(shape, 0.0001);
  input.dist = dist;
  // shapes are true distances everywhere, glyphs only inside their field
  input.reach = max(in.halfSize.x, in.halfSize.y);
  if (glyph) {
    // text outlines grow outwards, the letter itself stays untouched
    // the ring reaches 1.5px under the letter, so its antialiased edge blends
    // over a solid ring instead of leaving a seam of background
    let outer = clamp(0.5 - (glyphDist - in.outlineWidth) / glyphAa, 0.0, 1.0);
    let inner = clamp(0.5 - (glyphDist + glyphAa * 1.5) / glyphAa, 0.0, 1.0);
    input.ring = select(0.0, outer - inner, glyphOutline);
    input.dist = glyphDist;
    input.reach = in.radius.x * pixelsPerGlyphTexel;
    // where this letter sits in its text: radius.yz is the corner, radius.w the
    // size, two 12 bit values in one float (see the packing note in todo.md).
    // A letter spanning its own uv carries 0, 0 and a size of one.
    let packed = in.radius.w;
    let packedHeight = floor(packed / 4096.0);
    let uvSize = vec2f(packed - packedHeight * 4096.0, packedHeight) / 4095.0;
    input.uv = in.radius.yz + uv01 * uvSize;
  }
  input.params = in.params;
  let color = material(input);

  if (opaquePass) {
    // hard outer edge, a partly covered pixel must not write depth
    if (shape * color.a < 0.5) {
      discard;
    }
    // color is premultiplied, undo it: opaque writes full alpha, not a darkened edge
    return vec4f(color.rgb / max(color.a, 0.0001), 1.0);
  }
  return color * shape;
}
