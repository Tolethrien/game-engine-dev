// the "after rain" look: the pyramid of bloomShader.wgsl without a threshold, mixed into
// the scene instead of added; downsample13/upsampleTent are copies, cleaned up when shaders
// are built from pieces
@group(1) @binding(5) var texSampler: sampler;
// the level read by this step: the scene for the first level, a pyramid mip otherwise
@group(2) @binding(0) var source: texture_2d<f32>;
// must match DiffusionPass.writeParams
struct Diffusion {
  // linear
  hazeColor: vec3f,
  amount: f32,
  haze: f32,
};
@group(2) @binding(1) var<uniform> diffusion: Diffusion;
@group(2) @binding(2) var scene: texture_2d<f32>;
// the top used level, the blurred average light of the area; only read by the composite
@group(2) @binding(3) var veil: texture_2d<f32>;

fn luma(color: vec3f) -> f32 {
  return dot(color, vec3f(0.2126, 0.7152, 0.0722));
}
fn tap(uv: vec2f, texel: vec2f, x: f32, y: f32) -> vec3f {
  return textureSampleLevel(source, texSampler, uv + texel * vec2f(x, y), 0.0).rgb;
}

// 13 taps in 5 overlapping 2x2 boxes (Jimenez 2014); karis weighs each box by 1 / (1 + luma),
// so a lone torch pixel does not flicker as it moves between texels
fn downsample13(uv: vec2f, karis: bool) -> vec3f {
  let texel = 1.0 / vec2f(textureDimensions(source));
  let a = tap(uv, texel, -2.0, -2.0);
  let b = tap(uv, texel, 0.0, -2.0);
  let c = tap(uv, texel, 2.0, -2.0);
  let d = tap(uv, texel, -2.0, 0.0);
  let e = tap(uv, texel, 0.0, 0.0);
  let f = tap(uv, texel, 2.0, 0.0);
  let g = tap(uv, texel, -2.0, 2.0);
  let h = tap(uv, texel, 0.0, 2.0);
  let i = tap(uv, texel, 2.0, 2.0);
  let j = tap(uv, texel, -1.0, -1.0);
  let k = tap(uv, texel, 1.0, -1.0);
  let l = tap(uv, texel, -1.0, 1.0);
  let m = tap(uv, texel, 1.0, 1.0);
  let center = (j + k + l + m) * 0.25;
  let topLeft = (a + b + d + e) * 0.25;
  let topRight = (b + c + e + f) * 0.25;
  let bottomLeft = (d + e + g + h) * 0.25;
  let bottomRight = (e + f + h + i) * 0.25;
  if (!karis) {
    return center * 0.5 + (topLeft + topRight + bottomLeft + bottomRight) * 0.125;
  }
  let wCenter = 0.5 / (1.0 + luma(center));
  let wTopLeft = 0.125 / (1.0 + luma(topLeft));
  let wTopRight = 0.125 / (1.0 + luma(topRight));
  let wBottomLeft = 0.125 / (1.0 + luma(bottomLeft));
  let wBottomRight = 0.125 / (1.0 + luma(bottomRight));
  let sum = center * wCenter + topLeft * wTopLeft + topRight * wTopRight
    + bottomLeft * wBottomLeft + bottomRight * wBottomRight;
  return sum / (wCenter + wTopLeft + wTopRight + wBottomLeft + wBottomRight);
}
// 3x3 tent over the smaller level: no blocky texels when it is stretched up
fn upsampleTent(uv: vec2f) -> vec3f {
  let texel = 1.0 / vec2f(textureDimensions(source));
  var sum = tap(uv, texel, 0.0, 0.0) * 4.0;
  sum += (tap(uv, texel, 0.0, -1.0) + tap(uv, texel, -1.0, 0.0)
    + tap(uv, texel, 1.0, 0.0) + tap(uv, texel, 0.0, 1.0)) * 2.0;
  sum += tap(uv, texel, -1.0, -1.0) + tap(uv, texel, 1.0, -1.0)
    + tap(uv, texel, -1.0, 1.0) + tap(uv, texel, 1.0, 1.0);
  return sum / 16.0;
}

// cubic b-spline from 4 bilinear taps: the veil level is tiny (about 30x17), stretched with
// plain bilinear it shows diamonds and boxes around every lone light
fn sampleVeil(uv: vec2f) -> vec3f {
  let size = vec2f(textureDimensions(veil));
  let pixel = uv * size - 0.5;
  let base = floor(pixel);
  let f = pixel - base;
  let f2 = f * f;
  let f3 = f2 * f;
  let w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
  let w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  let w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
  let w3 = f3 / 6.0;
  // each pair of texels as one bilinear tap placed between them by their weights
  let near = w0 + w1;
  let far = w2 + w3;
  let nearUv = (base - 1.0 + w1 / near + 0.5) / size;
  let farUv = (base + 1.0 + w3 / far + 0.5) / size;
  return textureSampleLevel(veil, texSampler, nearUv, 0.0).rgb * near.x * near.y
    + textureSampleLevel(veil, texSampler, vec2f(farUv.x, nearUv.y), 0.0).rgb * far.x * near.y
    + textureSampleLevel(veil, texSampler, vec2f(nearUv.x, farUv.y), 0.0).rgb * near.x * far.y
    + textureSampleLevel(veil, texSampler, farUv, 0.0).rgb * far.x * far.y;
}

@fragment
fn fragmentPrefilter(in: FullscreenOut) -> @location(0) vec4f {
  return vec4f(downsample13(in.uv, true), 1.0);
}
@fragment
fn fragmentDownsample(in: FullscreenOut) -> @location(0) vec4f {
  return vec4f(downsample13(in.uv, false), 1.0);
}
// blended as lerp(own downsample, this, scatter) through the blend constant
@fragment
fn fragmentUpsample(in: FullscreenOut) -> @location(0) vec4f {
  return vec4f(upsampleTent(in.uv), 1.0);
}
@fragment
fn fragmentComposite(in: FullscreenOut) -> @location(0) vec4f {
  let color = textureLoad(scene, vec2u(in.position.xy), 0);
  // mixed, not added: the scene gets soft, not brighter; the pyramid averages the
  // premultiplied scene, so it mixes with it as is
  var rgb = mix(color.rgb, upsampleTent(in.uv), diffusion.amount);
  // veiling glare is scattered light, it adds: darks rise, highlights barely change,
  // and a dark night stays dark since the veil is its own light
  let average = sampleVeil(in.uv);
  rgb += average * diffusion.hazeColor * diffusion.haze;
  return vec4f(rgb, color.a);
}
