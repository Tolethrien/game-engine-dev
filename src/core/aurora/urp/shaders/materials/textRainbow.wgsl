// params: x = speed, y = colour bands across one glyph
// uses texel coverage, so only the letter is painted, not its quad

fn material(in: MaterialInput) -> vec4f {
  let phase = in.uv.x * in.params.y + in.uv.y * 0.5 - frame.time * in.params.x;
  let tint = 0.5 + 0.5 * cos(6.2831 * (phase + vec3f(0.0, 0.33, 0.67)));
  let alpha = in.texel.a * in.color.a;
  return vec4f(tint * alpha, alpha);
}
