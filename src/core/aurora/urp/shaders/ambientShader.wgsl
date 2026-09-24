struct Ambient {
  colorA: vec4f,
  colorB: vec4f,
  // cos, sin scaled to the render size and normalized, see LightPass.writeAmbient
  direction: vec2f,
};
@group(2) @binding(0) var<uniform> ambient: Ambient;

@fragment
fn fragmentMain(in: FullscreenOut) -> @location(0) vec4f {
  let t = clamp(dot(in.uv - 0.5, ambient.direction) + 0.5, 0.0, 1.0);
  return vec4f(mix(ambient.colorA.rgb, ambient.colorB.rgb, t), 1.0);
}