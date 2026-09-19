@group(1) @binding(5) var texSampler: sampler;
@group(2) @binding(0) var scene: texture_2d<f32>;
// canvas sized, the gui drawn so far
@group(2) @binding(1) var gui: texture_2d<f32>;
// the pyramid level below the one being written
@group(2) @binding(2) var source: texture_2d<f32>;

// level 0 composes gui over the scene, the other levels read the level below
override compose: bool = false;

@vertex
fn vertexMain(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  // one triangle over the whole target, the scissor limits it to the group
  let corner = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  return vec4f(corner * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
}

fn fetch(uv: vec2f) -> vec4f {
  if (compose) {
    // same composition as present.wgsl: both premultiplied and linear
    let overlay = textureSampleLevel(gui, texSampler, uv, 0.0);
    let under = textureSampleLevel(scene, texSampler, uv, 0.0);
    return overlay + under * (1.0 - overlay.a);
  }
  return textureSampleLevel(source, texSampler, uv, 0.0);
}

// 13 tap downsample (Jimenez, Call of Duty: Advanced Warfare): each level is
// blurred on the way down, so sampling it later needs no extra blur pass
@fragment
fn fragmentMain(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let sourceSize = vec2f(select(textureDimensions(source), textureDimensions(gui), compose));
  let targetSize = max(floor(sourceSize * 0.5), vec2f(1.0));
  let uv = position.xy / targetSize;
  let texel = 1.0 / sourceSize;

  let a = fetch(uv + texel * vec2f(-2.0, -2.0));
  let b = fetch(uv + texel * vec2f(0.0, -2.0));
  let c = fetch(uv + texel * vec2f(2.0, -2.0));
  let d = fetch(uv + texel * vec2f(-2.0, 0.0));
  let e = fetch(uv);
  let f = fetch(uv + texel * vec2f(2.0, 0.0));
  let g = fetch(uv + texel * vec2f(-2.0, 2.0));
  let h = fetch(uv + texel * vec2f(0.0, 2.0));
  let i = fetch(uv + texel * vec2f(2.0, 2.0));
  let j = fetch(uv + texel * vec2f(-1.0, -1.0));
  let k = fetch(uv + texel * vec2f(1.0, -1.0));
  let l = fetch(uv + texel * vec2f(-1.0, 1.0));
  let m = fetch(uv + texel * vec2f(1.0, 1.0));

  return e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
}
