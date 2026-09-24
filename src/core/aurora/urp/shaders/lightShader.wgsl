// copied on purpose from drawWorldShader.wgsl: every shader stays standalone for now
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
@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var<uniform> camera: Camera;
override linearColors: bool = true;

// must match LightShape in draw/drawLight.ts
const SHAPE_BOX: u32 = 0u;
const SHAPE_ELLIPSE: u32 = 1u;

// must match LIGHT_LAYOUT in draw/drawLight.ts, locations in field order
struct InstanceIn {
  @location(0) position: vec2f,
  @location(1) size: vec2f,
  @location(2) rotation: f32,
  @location(3) color: vec4f,
  @location(4) intensity: f32,
  @location(5) shape: u32,
  @location(6) softness: f32,
  @location(7) falloff: f32,
  // box: corner radii
  @location(8) shapeData: vec4f,
};
struct VertexOut {
  @builtin(position) position: vec4f,
  // world units from the light center, before rotation
  @location(0) local: vec2f,
  @location(1) @interpolate(flat) halfSize: vec2f,
  // linear rgb, already scaled by alpha and intensity
  @location(2) @interpolate(flat) color: vec3f,
  @location(3) @interpolate(flat) shape: u32,
  @location(4) @interpolate(flat) softness: f32,
  @location(5) @interpolate(flat) falloff: f32,
  @location(6) @interpolate(flat) corners: vec4f,
};

// anchor is snapped to whole render texels, offset is not
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

// radius: topLeft, topRight, bottomRight, bottomLeft (y points down)
fn roundedBox(p: vec2f, halfSize: vec2f, radius: vec4f) -> f32 {
  let top = select(radius.x, radius.y, p.x > 0.0);
  let bottom = select(radius.w, radius.z, p.x > 0.0);
  let r = select(top, bottom, p.y > 0.0);
  let q = abs(p) - halfSize + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, vec2f(0.0))) - r;
}

@vertex
fn vertexMain(@builtin(vertex_index) index: u32, instance: InstanceIn) -> VertexOut {
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
  );
  let corner = corners[index];
  let halfSize = instance.size * 0.5;
  // one render texel of margin, so a hard edge is not cut by the quad
  let pad = 1.0 / camera.zoom;
  let local = corner * (halfSize + pad);
  let c = cos(instance.rotation);
  let s = sin(instance.rotation);
  let rotated = vec2f(local.x * c - local.y * s, local.x * s + local.y * c);

  var out: VertexOut;
  out.position = pixelToClip(worldToPixel(instance.position, halfSize + rotated));
  out.local = local;
  out.halfSize = halfSize;
  let color = inputColor(instance.color);
  out.color = color.rgb * color.a * instance.intensity;
  out.shape = instance.shape;
  // past half the shorter side the fade would leave the quad
  out.softness = clamp(instance.softness, 0.5, min(halfSize.x, halfSize.y));
  out.falloff = instance.falloff;
  let maxRadius = vec4f(min(halfSize.x, halfSize.y));
  out.corners = min(instance.shapeData, maxRadius);
  return out;
}

@fragment
fn fragmentMain(in: VertexOut) -> @location(0) vec4f {
  // d: 0 in full light, 1 on the edge
  var d: f32;
  if (in.shape == SHAPE_ELLIPSE) {
    // normalized radius: concentric ellipses, an sdf of the ellipse bulges inside
    let fraction = in.softness / min(in.halfSize.x, in.halfSize.y);
    d = (length(in.local / in.halfSize) - (1.0 - fraction)) / fraction;
  } else {
    // fades outside the shape shrunk by softness: a distance field is smooth outside
    // a convex shape, inside it creases along the diagonals; a point shrinks to its center
    let innerHalf = in.halfSize - in.softness;
    let innerCorners = max(in.corners - in.softness, vec4f(0.0));
    d = roundedBox(in.local, innerHalf, innerCorners) / in.softness;
  }
  d = clamp(d, 0.0, 1.0);
  // inverse square: hot center and a long tail
  let core = 1.0 / (1.0 + in.falloff * d * d);
  // takes the tail to 0 at the edge well before it, srgb encoding would lift a late fade into a ring
  let fade = 1.0 - d * d;
  let light = core * fade * fade;
  // alpha is left alone by the additive blend
  return vec4f(in.color * light, 0.0);
}
