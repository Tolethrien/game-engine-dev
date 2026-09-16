@group(2) @binding(0) var scene: texture_2d<f32>;

override linearColors: bool = true;

struct VertexOut {
  @builtin(position) position: vec4f,
};

fn outputColor(color: vec3f) -> vec3f {
  if (!linearColors) {
    return color;
  }
  let low = color * 12.92;
  let high = 1.055 * pow(color, vec3f(1.0 / 2.4)) - 0.055;
  return select(high, low, color <= vec3f(0.0031308));
}

@vertex
fn vertexMain(@builtin(vertex_index) index: u32) -> VertexOut {
  var corners = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
  );
  let corner = corners[index];

  var out: VertexOut;
  out.position = vec4f(corner * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
  return out;
}

@fragment
fn fragmentMain(in: VertexOut) -> @location(0) vec4f {
  let color = clamp(textureLoad(scene, vec2u(in.position.xy), 0), vec4f(0.0), vec4f(1.0));
  if (color.a <= 0.0) {
    return vec4f(0.0);
  }
  let straight = color.rgb / color.a;
  return vec4f(outputColor(straight) * color.a, color.a);
}
