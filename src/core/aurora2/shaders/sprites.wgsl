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
@group(1) @binding(0) var albedo: texture_2d_array<f32>;
@group(1) @binding(5) var texSampler: sampler;
struct SpriteIn {
  @location(0) position: vec2f,
  @location(1) size: vec2f,
  @location(2) tint: vec4f,
  @location(3) uvRect: vec4f,
  @location(4) layer: u32,
};

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) tint: vec4f,
  @location(2) @interpolate(flat) layer: u32,
};

@vertex
fn vertexMain(@builtin(vertex_index) index: u32, sprite: SpriteIn) -> VertexOut {
  var corners = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
  );
  let corner = corners[index];
 let world = sprite.position + corner * sprite.size;
let rel = world - camera.position;
let c = cos(camera.rotation);
let s = sin(camera.rotation);
let rotated = vec2f(rel.x * c - rel.y * s, rel.x * s + rel.y * c);
let pixel = rotated * camera.zoom + frame.renderSize * 0.5;

var out: VertexOut;
out.position = vec4f(pixel / frame.renderSize * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
  out.uv = sprite.uvRect.xy + corner * sprite.uvRect.zw;
  out.tint = sprite.tint;
  out.layer = sprite.layer;
  return out;
}

@fragment
fn fragmentMain(in: VertexOut) -> @location(0) vec4f {
  return textureSample(albedo, texSampler, in.uv, in.layer) * in.tint;
}