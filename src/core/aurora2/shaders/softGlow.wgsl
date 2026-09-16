@group(1) @binding(5) var texSampler: sampler;
@group(2) @binding(0) var scene: texture_2d<f32>;
@group(2) @binding(1) var small: texture_2d<f32>;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

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
fn downMain(in: VertexOut) -> @location(0) vec4f {
  let texel = 1.0 / vec2f(textureDimensions(scene));
  var color = vec4f(0.0);
  color += textureSample(scene, texSampler, in.uv + texel * vec2f(-1.0, -1.0));
  color += textureSample(scene, texSampler, in.uv + texel * vec2f(1.0, -1.0));
  color += textureSample(scene, texSampler, in.uv + texel * vec2f(-1.0, 1.0));
  color += textureSample(scene, texSampler, in.uv + texel * vec2f(1.0, 1.0));
  return color * 0.25;
}

@fragment
fn mixMain(in: VertexOut) -> @location(0) vec4f {
  let base = textureSample(scene, texSampler, in.uv);
  let blurred = textureSample(small, texSampler, in.uv);
  return mix(base, blurred, 0.5);
}
