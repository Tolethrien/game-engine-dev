// params.x: 0 = fill (the letter/shape) goes rainbow, outline stays normal
//           1 = outline goes rainbow, fill stays normal

fn hue(h: f32) -> vec3f {
  let r = abs(h * 6.0 - 3.0) - 1.0;
  let g = 2.0 - abs(h * 6.0 - 2.0);
  let b = 2.0 - abs(h * 6.0 - 4.0);
  return clamp(vec3f(r, g, b), vec3f(0.0), vec3f(1.0));
}

fn material(in: MaterialInput) -> vec4f {
  let rainbow = hue(fract(frame.time * 0.5 + in.uv.x + in.uv.y));
  let onOutline = in.params.x > 0.5;

  let outlineAlpha = in.outlineColor.a * in.ring;
  var outlineRGB = in.outlineColor.rgb;
  if (onOutline) {
    outlineRGB = rainbow;
  }
  let outline = vec4f(outlineRGB * outlineAlpha, outlineAlpha);

  var fill = in.color * in.texel;
  if (!onOutline) {
    fill = vec4f(rainbow * fill.a, fill.a);
  }

  return outline + fill * (1.0 - outline.a);
}
