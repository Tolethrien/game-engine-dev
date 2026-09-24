// mist lying in the world: noise in world units, so it stays put when the camera moves and
// drifts with the wind; in the "world" stage the light composite lights it like the ground,
// bright around torches, gone in the dark
// params: x = scale (noise cells per world unit), y = wind speed (world units / s), z = density
fn effect(in: EffectInput) -> vec4f {
  let wind = vec2f(in.time * in.params.y, in.time * in.params.y * 0.3);
  let point = (in.world + wind) * in.params.x;
  let slow = fbm(point);
  let fast = fbm(point * 2.1 - wind * in.params.x * 0.8 + vec2f(3.7, 8.2));
  let cloud = smoothstep(0.35, 0.85, slow * 0.65 + fast * 0.35);
  return vec4f(in.color, cloud * in.params.z);
}
