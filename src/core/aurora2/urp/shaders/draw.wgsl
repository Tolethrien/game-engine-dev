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
@group(2) @binding(0) var<uniform> sortParams: SortParams;
override linearColors: bool = true;
override depthSort: bool = false;
override opaquePass: bool = false;
// gui: positions are canvas pixels, no camera, target is canvas sized
override screenSpace: bool = false;
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
// larger key is closer, must match sortKey in passes/draw.ts
fn sortDepth(point: vec3f) -> f32 {
  let index = clamp(
    floor((point - sortParams.origin) / sortParams.step),
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
    out.local = point - a;
    out.halfSize = vec2f(length(b - a), length(d - a)) * 0.5;
    out.quadB = b - a;
    out.quadC = c - a;
    out.quadD = d - a;
  } else {
    let halfSize = instance.size * 0.5;
    // one render texel of margin for antialiasing
    let pad = select(1.0 / camera.zoom, 1.0, screenSpace);
    let local = corner * (halfSize + pad);
    let c = cos(instance.rotation);
    let s = sin(instance.rotation);
    let rotated = vec2f(local.x * c - local.y * s, local.x * s + local.y * c);
    out.position = pixelToClip(worldToPixel(instance.position, halfSize + rotated));
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
  // signed distance to the outer edge, negative inside, uv units on quads
  dist: f32,
  // how far dist stays true: the reach of the distance field of a glyph in pixels
  reach: f32,
  params: vec4f,
};

// MATERIAL

@fragment
fn fragmentMain(in: VertexOut) -> @location(0) vec4f {
  let maskGlyph = in.shape == SHAPE_GLYPH || in.shape == SHAPE_GLYPH_OUTLINE;
  let msdfGlyph = in.shape == SHAPE_MTSDF || in.shape == SHAPE_MTSDF_OUTLINE;
  let glyph = maskGlyph || msdfGlyph;
  let glyphOutline = in.shape == SHAPE_GLYPH_OUTLINE || in.shape == SHAPE_MTSDF_OUTLINE;
  var uv01: vec2f;
  var local = in.local;
  var dist: f32;

  if (in.shape == SHAPE_QUAD) {
    let quadUv = invBilinear(in.local, vec2f(0.0), in.quadB, in.quadC, in.quadD);
    dist = -min(min(quadUv.x, 1.0 - quadUv.x), min(quadUv.y, 1.0 - quadUv.y));
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
    texel = vec4f(select(covered, 0.0, glyphOutline));
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
    // the ring starts at the letter edge, so it never covers the fill
    let outer = clamp(0.5 - (glyphDist - in.outlineWidth) / glyphAa, 0.0, 1.0);
    let inner = clamp(0.5 - glyphDist / glyphAa, 0.0, 1.0);
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
    return vec4f(color.rgb, 1.0);
  }
  return color * shape;
}
