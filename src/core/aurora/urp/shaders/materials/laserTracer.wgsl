// params: x = intensity, y = speed, z = dash length in pixels
// head in front, fading tail behind

fn material(in: MaterialInput) -> vec4f {
  let time = frame.time * in.params.y;
  let dashLength = max(in.params.z, 1.0);
  let along = in.local.x + in.size.x * 0.5;
  let across = abs(in.local.y) / (in.size.y * 0.5);

  let phase = fract(along / dashLength - time);
  let dash = smoothstep(0.0, 0.05, 1.0 - phase) * pow(phase, 3.0);
  let core = exp(-pow(across * 4.0, 2.0));
  // glow fades to zero before the edge, so the line rect never shows
  let edge = 1.0 - smoothstep(0.6, 1.0, across);
  let glow = exp(-across * 2.5) * 0.5 * edge;

  let beam = in.color.rgb * glow * dash + vec3f(core * dash);
  return vec4f(beam * in.params.x, 0.0);
}
