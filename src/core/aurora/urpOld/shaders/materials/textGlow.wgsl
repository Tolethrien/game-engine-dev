// params: x = glow reach in pixels, y = halo strength (below 1), z = how much
// the letter is lifted towards white
// neon look: a bright, almost white letter in a dimmer halo of its colour.
// The halo must reach exactly zero before the glyph quad ends: colours are
// linear, so even a few percent left at the quad edge shows up as a box.
// in.reach says how far the field of this glyph is still true.

fn material(in: MaterialInput) -> vec4f {
  let core = vec4f(mix(in.color.rgb, vec3f(in.color.a), in.params.z), in.color.a);
  let fill = core * in.texel;
  let reach = clamp(in.params.x, 0.001, in.reach);
  let fade = 1.0 - clamp(max(in.dist, 0.0) / reach, 0.0, 1.0);
  let halo = fade * fade * in.params.y * (1.0 - in.texel.a);
  return fill + in.color * halo;
}
