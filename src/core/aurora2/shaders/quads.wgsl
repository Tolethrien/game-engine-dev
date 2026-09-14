struct Viewport {
  size: vec2f,
};
@group(0) @binding(0) var<uniform> viewport: Viewport;

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
  let pixel = quad.position + corners[index] * quad.size;
  let ndc = pixel / viewport.size * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0);

  var out: VertexOut;
  out.position = vec4f(ndc, 0.0, 1.0);
  out.color = quad.color;
  return out;
}

@fragment
fn fragmentMain(in: VertexOut) -> @location(0) vec4f {
  return in.color;
}