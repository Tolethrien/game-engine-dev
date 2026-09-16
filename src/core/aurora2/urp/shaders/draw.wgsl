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
@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var<uniform> camera: Camera;
@group(1) @binding(0) var albedo: texture_2d_array<f32>;
@group(1) @binding(5) var texSampler: sampler;
override linearColors: bool = true;
override depthSort: bool = false;
override opaquePass: bool = false;
override sortMargin: f32 = 0.0;
// anchor is snapped to whole render texels, offset is not,
// so rotated and rounded shapes keep their exact form
fn worldToPixel(anchor: vec2f, offset: vec2f) -> vec2f {
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
fn sortDepth(point: vec2f) -> f32 {
  let center = floor(frame.renderSize.y * 0.5);
  let cam = floor((camera.position.y + center) * camera.zoom + 0.5);
  let pixel = floor(point.y * camera.zoom + 0.5) - cam + center + sortMargin;
  let range = frame.renderSize.y + sortMargin * 2.0;
  let row = clamp(pixel, 0.0, range - 1.0);
  return 1.0 - (row + 1.0) / (range + 1.0);
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

struct RectIn {
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
  @location(10) sortPoint: vec2f
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
};

@vertex
fn vertexMain(@builtin(vertex_index) index: u32, rect: RectIn) -> VertexOut {
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
  );
  let halfSize = rect.size * 0.5;
  // one render texel of margin for antialiasing
  let pad = 1.0 / camera.zoom;
  let local = corners[index] * (halfSize + pad);

  let c = cos(rect.rotation);
  let s = sin(rect.rotation);
  let rotated = vec2f(local.x * c - local.y * s, local.x * s + local.y * c);

  var out: VertexOut;
  out.position = pixelToClip(worldToPixel(rect.position, halfSize + rotated));
   out.position.z = select(0.0, sortDepth(rect.sortPoint), depthSort);
  out.local = local;
  out.halfSize = halfSize;
  out.radius = rect.radius;
  out.outlineWidth = rect.outlineWidth;
  out.color = premultiply(inputColor(rect.color));
  out.outlineColor = premultiply(inputColor(rect.outlineColor));
 out.shape = rect.shape;
  out.uvRect = rect.uvRect;
  out.layer = rect.layer;
  return out;
}

@fragment
fn fragmentMain(in: VertexOut) -> @location(0) vec4f {
  // clamp keeps the antialiasing margin from reading neighbours in the atlas
  let uv01 = clamp(in.local / in.halfSize * 0.5 + 0.5, vec2f(0.0), vec2f(1.0));
  let uv = in.uvRect.xy + uv01 * in.uvRect.zw;
  let texel = premultiply(textureSample(albedo, texSampler, uv, in.layer));

  var dist: f32;
  if (in.shape == SHAPE_ELLIPSE) {
    dist = ellipse(in.local, in.halfSize);
  } else {
    dist = roundedBox(in.local, in.halfSize, in.radius);
  }
  let aa = max(fwidth(dist), 0.0001);
  let shape = clamp(0.5 - dist / aa, 0.0, 1.0);
  let fill = clamp(0.5 - (dist + in.outlineWidth) / aa, 0.0, 1.0);

  // outline is layered over the fill, ring = 1 on the outline band
  let ring = (shape - fill) / max(shape, 0.0001);
  let outline = in.outlineColor * ring;
  let layered = outline + in.color * texel * (1.0 - outline.a);
  if (opaquePass) {
    // hard outer edge, a partly covered pixel must not write depth
    if (shape * texel.a < 0.5) {
      discard;
    }
    return vec4f(layered.rgb, 1.0);
  }
  return layered * shape;
}