// params: x = intensity, y = speed, z = distance between pulses in pixels

fn material(in: MaterialInput) -> vec4f {
  let time = frame.time * in.params.y;
  let spacing = max(in.params.z, 1.0);
  let along = in.local.x;
  let across = abs(in.local.y) / (in.size.y * 0.5);

  let core = exp(-pow(across * 6.0, 2.0));
  // glow fades to zero before the edge, so the line rect never shows
  let edge = 1.0 - smoothstep(0.6, 1.0, across);
  let glow = exp(-across * 3.5) * 0.35 * edge;
  let pulse = pow(0.5 + 0.5 * sin((along / spacing - time) * 6.2831), 12.0);
  let pulseGlow = pulse * exp(-across * 1.5) * edge;

  let beam = in.color.rgb * (glow + pulseGlow * 1.8) + vec3f(core * (0.6 + pulse));
  return vec4f(beam * in.params.x, 0.0);
}
