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

fn inputColor(color: vec4f) -> vec4f {
  if (!linearColors) {
    return color;
  }
  let low = color.rgb / 12.92;
  let high = pow((color.rgb + 0.055) / 1.055, vec3f(2.4));
  return vec4f(select(high, low, color.rgb <= vec3f(0.04045)), color.a);
}

struct QuadIn {
  @location(0) position: vec2f,
  @location(1) size: vec2f,
  @location(2) color: vec4f,
};

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
};

@vertex
fn vertexMain(@builtin(vertex_index) index: u32, quad: QuadIn) -> VertexOut {
  var corners = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
  );
  let world = quad.position + corners[index] * quad.size;
  let rel = world - camera.position;
  let c = cos(camera.rotation);
  let s = sin(camera.rotation);
  let rotated = vec2f(rel.x * c - rel.y * s, rel.x * s + rel.y * c);
  let pixel = rotated * camera.zoom + frame.renderSize * 0.5;
  let ndc = pixel / frame.renderSize * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0);

  var out: VertexOut;
  out.position = vec4f(ndc, 0.0, 1.0);
  out.color = inputColor(quad.color);
  return out;
}

@fragment
fn fragmentMain(in: VertexOut) -> @location(0) vec4f {
  return in.color;
}