@group(0) @binding(0) var source: texture_2d<f32>;

// straight alpha in, premultiplied out; srgb loads decode and srgb targets encode,
// so the multiply happens on linear colour
@fragment
fn premultiplyMain(in: FullscreenOut) -> @location(0) vec4f {
  let color = textureLoad(source, vec2u(in.position.xy), 0);
  return vec4f(color.rgb * color.a, color.a);
}

// one mip from the level above: a 2x2 box of premultiplied colour, so transparent
// texels add no colour; an odd edge repeats its last texel
@fragment
fn downsampleMain(in: FullscreenOut) -> @location(0) vec4f {
  let last = vec2i(textureDimensions(source)) - 1;
  let base = vec2i(in.position.xy) * 2;
  var sum = vec4f(0.0);
  for (var y = 0; y < 2; y++) {
    for (var x = 0; x < 2; x++) {
      sum += textureLoad(source, min(base + vec2i(x, y), last), 0);
    }
  }
  return sum * 0.25;
}
