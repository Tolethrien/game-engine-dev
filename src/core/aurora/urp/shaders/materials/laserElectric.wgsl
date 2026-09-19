// params: x = intensity, y = speed, z = seed

fn electricHash(value: f32) -> f32 {
  return fract(sin(value * 127.1) * 43758.5453);
}

fn material(in: MaterialInput) -> vec4f {
  let time = frame.time * in.params.y + in.params.z * 17.0;
  let along = in.local.x;
  let across = in.local.y / (in.size.y * 0.5);

  // filament wandering around the beam axis
  let wave = sin(along * 0.045 + time * 3.0) * 0.35
    + sin(along * 0.11 - time * 5.3) * 0.2
    + sin(along * 0.27 + time * 9.1) * 0.08;
  let filament = exp(-pow((across - wave) * 9.0, 2.0));

  let core = exp(-pow(across * 5.0, 2.0));
  let flicker = 0.85 + 0.15 * electricHash(floor(frame.time * 30.0) + in.params.z);

  let beam = in.color.rgb * filament * 1.5 + vec3f(core);
  return vec4f(beam * in.params.x * flicker, 0.0);
}
