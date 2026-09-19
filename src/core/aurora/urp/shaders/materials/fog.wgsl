// params: x = blob size in pixels, y = drift speed, z = coverage (0 clear, 1 all fog)
// fog colour and its densest opacity come from the shape colour

fn fogHash(point: vec2f) -> f32 {
  return fract(sin(dot(point, vec2f(127.1, 311.7))) * 43758.5453);
}

fn fogNoise(point: vec2f) -> f32 {
  let cell = floor(point);
  let local = fract(point);
  let eased = local * local * (3.0 - 2.0 * local);
  let a = fogHash(cell);
  let b = fogHash(cell + vec2f(1.0, 0.0));
  let c = fogHash(cell + vec2f(0.0, 1.0));
  let d = fogHash(cell + vec2f(1.0, 1.0));
  return mix(mix(a, b, eased.x), mix(c, d, eased.x), eased.y);
}

fn fogFbm(start: vec2f) -> f32 {
  var value = 0.0;
  var amplitude = 0.5;
  var point = start;
  for (var octave = 0; octave < 5; octave++) {
    value += amplitude * fogNoise(point);
    point = point * 2.03 + vec2f(17.0, 9.0);
    amplitude *= 0.5;
  }
  return value;
}

fn material(in: MaterialInput) -> vec4f {
  let time = frame.time * in.params.y;
  let point = (in.local + in.size * 0.5) / max(in.params.x, 1.0);
  // domain warp: the blobs curl and change shape instead of sliding as a flat texture
  let warp = vec2f(
    fogFbm(point + vec2f(time * 0.3, 0.0)),
    fogFbm(point + vec2f(5.2, 1.3) - vec2f(0.0, time * 0.2)),
  );
  let noise = fogFbm(point + warp * 1.5 + vec2f(time * 0.5, time * 0.15));
  let threshold = 1.0 - clamp(in.params.z, 0.0, 1.0);
  let density = smoothstep(threshold, threshold + 0.35, noise);
  return in.color * density;
}
