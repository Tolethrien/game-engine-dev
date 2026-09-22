// params: x = intensity, y = pulse speed, z = seed

fn material(in: MaterialInput) -> vec4f {
  let r = length(in.local) / (in.size.x * 0.5);
  let pulse = 0.8 + 0.2 * sin(frame.time * in.params.y + in.params.z * 7.0);
  let core = exp(-pow(r * 3.5, 2.0));
  // glow fades to zero before the edge, so the circle outline never shows
  let glow = exp(-r * 4.0) * pulse * (1.0 - smoothstep(0.7, 1.0, r));
  return vec4f((in.color.rgb * glow + vec3f(core)) * in.params.x, 0.0);
}
