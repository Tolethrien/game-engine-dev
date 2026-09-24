// default fill and outline, scaled past 1 by intensity: the scene is hdr, so this is what
// tone mapping (and later bloom) picks up as glow
fn material(in: MaterialInput) -> vec4f {
  let outline = in.outlineColor * in.ring;
  let base = outline + in.color * in.texel * (1.0 - outline.a);
  // rgb only, alpha stays coverage
  return vec4f(base.rgb * in.params.x, base.a);
}
