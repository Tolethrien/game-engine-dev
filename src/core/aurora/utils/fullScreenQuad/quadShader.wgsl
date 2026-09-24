struct FullscreenOut {
  @builtin(position) position: vec4f,
  // 0..1, top left is 0,0 like the rest of aurora
  @location(0) uv: vec2f,
};

@vertex
fn vertexMain(@builtin(vertex_index) index: u32) -> FullscreenOut {
  // triangle-strip order: 0,0  1,0  0,1  1,1
  let corner = vec2f(f32(index & 1u), f32(index >> 1u));
  var out: FullscreenOut;
  out.position = vec4f(corner * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
  out.uv = corner;
  return out;
}