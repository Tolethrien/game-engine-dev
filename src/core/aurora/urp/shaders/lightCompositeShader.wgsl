@group(2) @binding(0) var scene: texture_2d<f32>;
@group(2) @binding(1) var lightMap: texture_2d<f32>;
// share of the pixel drawn by emissive materials, see WorldPass
@group(2) @binding(2) var emissive: texture_2d<f32>;

@fragment
fn fragmentMain(in: FullscreenOut) -> @location(0) vec4f {
  // all at render resolution, read texel to texel
  let pixel = vec2u(in.position.xy);
  let color = textureLoad(scene, pixel, 0);
  let light = textureLoad(lightMap, pixel, 0).rgb;
  let glow = textureLoad(emissive, pixel, 0).r;
  // emissive keeps its own color, the rest takes the light; premultiplied, coverage stays
  return vec4f(color.rgb * mix(light, vec3f(1.0), glow), color.a);
}
