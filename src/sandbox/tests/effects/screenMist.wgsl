// mist hanging on the lens: noise in screen space, two layers drifting at different speeds
// params: x = scale (noise cells across the screen height), y = speed, z = density
fn effect(in: EffectInput) -> vec4f {
  let point = vec2f(in.uv.x * in.aspect, in.uv.y) * in.params.x;
  let drift = vec2f(in.time * in.params.y, in.time * in.params.y * 0.35);
  let slow = fbm(point + drift);
  let fast = fbm(point * 1.7 - drift * 1.6 + vec2f(5.2, 1.3));
  let cloud = smoothstep(0.3, 0.8, slow * 0.6 + fast * 0.4);
  return vec4f(in.color, cloud * in.params.z);
}
