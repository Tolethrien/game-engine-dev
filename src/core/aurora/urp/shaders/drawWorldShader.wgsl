// the clip id is flat per primitive, so every pixel of a 2x2 quad walks the same
// clip chain and fwidth inside clipCoverage stays valid
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
// must match ViewCamera in sharedBinds.ts: view center in world units, world units to render texels
struct Camera {
  center: vec2f,
  scale: f32,
  rotation: f32,
};
@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var<uniform> camera: Camera;
@group(1) @binding(0) var albedo: texture_2d_array<f32>;
@group(1) @binding(3) var uiAtlas: texture_2d_array<f32>;
@group(1) @binding(4) var fonts: texture_2d_array<f32>;
@group(1) @binding(5) var texSampler: sampler;
@group(1) @binding(7) var fontLinear: sampler;
// must match sortParams in passes/worldPass.ts, each row is vec3f + f32
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
@group(2) @binding(0) var<uniform> sortParams: SortParams;
// clip rect in world space, id 0 is no clip; must match ClipBuffer.push in clip/clipBuffer.ts
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
@group(2) @binding(1) var<storage, read> clips: array<Clip>;
override linearColors: bool = true;
// false for sortMode "none": params are never uploaded, every shape stays at depth 0
override depthSort: bool = false;
// opaque pipeline: writes depth, so a pixel is either fully kept or dropped
override opaquePass: bool = false;
// must match URPProps.pixelSnap == "world" and pixelSnap in lightShader.wgsl
override pixelSnap: bool = true;
// an alpha tested edge thins out in the mips, averaged alpha drops under the cut;
// raised per level so zoomed out tiles still meet and leaves keep their mass
const MIP_ALPHA_SCALE: f32 = 0.25;
// material ignores the light map, must match Material.emissive
override emissive: bool = false;

// must match Shape in draw/drawInternal.ts
const SHAPE_BOX: u32 = 0u;
const SHAPE_ELLIPSE: u32 = 1u;
const SHAPE_QUAD: u32 = 2u;
// glyph of an mtsdf atlas: distances in all four channels
const SHAPE_MTSDF: u32 = 3u;
// only the outline ring of a letter, drawn before the fills of its text
const SHAPE_MTSDF_OUTLINE: u32 = 4u;
// must match UI_ATLAS in draw/drawInternal.ts, marks a layer of the ui texture array
const UI_ATLAS: u32 = 0x80000000u;

// must match WORLD_LAYOUT in draw/drawInternal.ts, locations in field order
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
  @location(12) sortPoint: vec3f,
};
// must match the color targets of WorldPass, in creation order
struct FragmentOut {
  @location(0) color: vec4f,
  // premultiplied like color, so what is drawn over an emissive pixel covers its mask too
  @location(1) emissive: vec4f,
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
  // world position of the rendered pixel, from the same snapped anchor as the shape
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

// one transform for every shape, only the camera is snapped (to whole render texels):
// an edge two shapes share in the world stays shared on screen at any zoom
fn worldToPixel(anchor: vec2f, offset: vec2f) -> vec2f {
  let center = floor(frame.renderSize * 0.5);
  let view = camera.center * camera.scale;
  let cam = select(view, floor(view + 0.5), pixelSnap);
  let rel = (anchor + offset) * camera.scale - cam;
  if (camera.rotation == 0.0) {
    return rel + center;
  }
  let c = cos(camera.rotation);
  let s = sin(camera.rotation);
  return vec2f(rel.x * c - rel.y * s, rel.x * s + rel.y * c) + center;
}
// larger key is closer, must match sortKey in passes/worldPass.ts
fn sortDepth(point: vec3f) -> f32 {
  let cell = clamp(
    floor((point - sortParams.origin) / sortParams.step),
    vec3f(0.0),
    sortParams.count - 1.0,
  );
  let key = dot(cell, sortParams.weight);
  return 1.0 - (key + 1.0) / (sortParams.total + 1.0);
}
// whole world units are sprite texels: pixel art keeps its grid at any zoom
fn snapAnchor(anchor: vec2f) -> vec2f {
  return select(anchor, floor(anchor + 0.5), pixelSnap);
}
// sharp bilinear, position in texels: flat inside a texel and a one pixel wide blend
// across its edge, so a fractional zoom or position never repeats texels unevenly;
// minifying (a texel under a pixel) falls back to plain bilinear on the mips
fn sharpTexel(position: vec2f, texelsPerPixel: vec2f, uvRect: vec4f, lod: f32) -> vec2f {
  let band = clamp(texelsPerPixel, vec2f(0.0001), vec2f(1.0));
  let edge = floor(position + 0.5);
  let sharp = edge + clamp((position - edge) / band, vec2f(-0.5), vec2f(0.5));
  // half a texel of the sampled level inside the crop (flipped when zw is negative),
  // or the filter reads the next sprite of the sheet
  let low = min(uvRect.xy, uvRect.xy + uvRect.zw);
  let high = max(uvRect.xy, uvRect.xy + uvRect.zw);
  let inset = min(vec2f(0.5 * exp2(lod)), (high - low) * 0.5);
  return clamp(sharp, low + inset, high - inset);
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
  return vec4f(pixel / frame.renderSize * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
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

// contract of every material in urp/shaders/materials, do not change field meaning
struct MaterialInput {
  // 0..1 across the shape, before rotation
  uv: vec2f,
  // world units from the shape center, before rotation
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
    let anchor = snapAnchor(a);
    out.position = pixelToClip(worldToPixel(anchor, point - a));
    out.clipPoint = anchor + point - a;
    out.local = point - a;
    out.halfSize = vec2f(length(b - a), length(d - a)) * 0.5;
    out.quadB = b - a;
    out.quadC = c - a;
    out.quadD = d - a;
  } else {
    let halfSize = instance.size * 0.5;
    // one render texel of margin, so the antialiased edge is not cut by the quad
    let pad = 1.0 / camera.scale;
    let local = corner * (halfSize + pad);
    let c = cos(instance.rotation);
    let s = sin(instance.rotation);
    let rotated = vec2f(local.x * c - local.y * s, local.x * s + local.y * c);
    // letters keep their layout positions, snapping each would break the spacing when zoomed in
    let glyph = instance.shape == SHAPE_MTSDF || instance.shape == SHAPE_MTSDF_OUTLINE;
    let anchor = select(snapAnchor(instance.position), instance.position, glyph);
    out.position = pixelToClip(worldToPixel(anchor, halfSize + rotated));
    out.clipPoint = anchor + halfSize + rotated;
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
  out.position.z = select(0.0, sortDepth(instance.sortPoint), depthSort);
  return out;
}

@fragment
fn fragmentMain(in: VertexOut) -> FragmentOut {
  let clip = clipCoverage(in.clip, in.clipPoint);
  // opaque writes depth, a pixel mostly cut away must not; discard keeps helpers for derivatives
  if (clip < select(0.0001, 0.5, opaquePass)) {
    discard;
  }
  let glyph = in.shape == SHAPE_MTSDF || in.shape == SHAPE_MTSDF_OUTLINE;
  let glyphOutline = in.shape == SHAPE_MTSDF_OUTLINE;
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
      // glyphs carry their field in shapeData, their quad has square corners
      let maxRadius = vec4f(min(in.halfSize.x, in.halfSize.y));
      let corners = select(min(boxCorners(in.shapeData), maxRadius), vec4f(0.0), glyph);
      dist = roundedBox(in.local, in.halfSize, corners);
    }
  }

  var glyphDist = 0.0;
  var glyphReach = 0.0;
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
    let unitsPerTexel = in.halfSize.x * 2.0 / (in.uvRect.z * atlasSize.x);
    glyphReach = glyphRange(in.shapeData) * unitsPerTexel;
    let data = textureSampleLevel(fonts, fontLinear, glyphUv, in.layer, 0.0);
    let median = max(min(data.r, data.g), min(max(data.r, data.g), data.b));
    let sharp = (0.5 - median) * 2.0 * glyphReach;
    let soft = (0.5 - data.a) * 2.0 * glyphReach;
    // the median keeps corners sharp near the edge, the plain field in alpha
    // is the honest distance further out, where outlines live
    glyphDist = mix(sharp, soft, smoothstep(0.3, 0.8, abs(soft) / glyphReach));
  }
  // fwidth must stay out of branches
  let aa = max(fwidth(dist), 0.0001);
  let coverage = clamp(0.5 - dist / aa, 0.0, 1.0);
  // outline grows inward, at most to the center of the shorter side
  let outlineWidth = min(in.outlineWidth, min(in.halfSize.x, in.halfSize.y));
  let fill = clamp(0.5 - (dist + outlineWidth) / aa, 0.0, 1.0);
  // derivatives must stay outside branches
  let glyphAa = max(fwidth(glyphDist), 0.0001);
  let texelPosition = in.uvRect.xy + uv01 * in.uvRect.zw;
  let texelDx = dpdx(texelPosition);
  let texelDy = dpdy(texelPosition);
  // explicit level, so the samples below may sit in branches; the ui atlas has no mips
  let lod = 0.5 * log2(max(max(dot(texelDx, texelDx), dot(texelDy, texelDy)), 1.0));
  let texelUv = sharpTexel(texelPosition, abs(texelDx) + abs(texelDy), in.uvRect, lod);

  var texel: vec4f;
  if ((in.layer & UI_ATLAS) != 0u) {
    // the ui array is plain rgba8unorm, unlike the srgb albedo it needs decoding here
    let layer = in.layer & ~UI_ATLAS;
    let uv = texelUv / vec2f(textureDimensions(uiAtlas, 0));
    texel = premultiply(inputColor(textureSampleLevel(uiAtlas, texSampler, uv, layer, 0.0)));
  } else {
    let uv = texelUv / vec2f(textureDimensions(albedo, 0));
    // albedo is srgb and premultiplied at load: sampling returns linear premultiplied
    texel = textureSampleLevel(albedo, texSampler, uv, in.layer, lod);
  }
  if (glyph) {
    let covered = clamp(0.5 - glyphDist / glyphAa, 0.0, 1.0);
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
  let color = material(input);
  if (opaquePass) {
    // a mostly empty pixel must not write depth, or it hides what lies behind its soft edge
    if (coverage * min(color.a * (1.0 + lod * MIP_ALPHA_SCALE), 1.0) < 0.5) {
      discard;
    }
    // color is premultiplied, undo it: opaque writes full alpha, not a darkened edge
    return fragmentOut(vec4f(color.rgb / max(color.a, 0.0001), 1.0));
  }
  // the material paints the shape, coverage cuts it to the antialiased edge
  return fragmentOut(color * coverage * clip);
}
fn fragmentOut(color: vec4f) -> FragmentOut {
  var out: FragmentOut;
  out.color = color;
  out.emissive = vec4f(select(0.0, color.a, emissive), 0.0, 0.0, color.a);
  return out;
}
