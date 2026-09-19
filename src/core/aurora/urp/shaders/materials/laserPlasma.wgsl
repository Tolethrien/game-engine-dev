// params: x = intensity, y = speed, z = seed

fn material(in: MaterialInput) -> vec4f {
  let time = frame.time * in.params.y + in.params.z * 11.0;
  let along = in.local.x;
  let across = abs(in.local.y) / (in.size.y * 0.5);

  // beam thickness breathing along its length
  let thickness = 0.45
    + 0.2 * sin(along * 0.021 + time * 2.1)
    + 0.12 * sin(along * 0.067 - time * 3.7)
    + 0.06 * sin(along * 0.19 + time * 6.3);
  let body = 1.0 - smoothstep(thickness * 0.55, thickness, across);
  let hot = 1.0 - smoothstep(0.0, thickness * 0.45, across);
  // tight halo just outside the body, gone well before the line edge
  let halo = exp(-max(across - thickness, 0.0) * 25.0) * 0.25;

  let beam = in.color.rgb * (body + halo) + vec3f(hot * 0.9);
  return vec4f(beam * in.params.x, 0.0);
}
