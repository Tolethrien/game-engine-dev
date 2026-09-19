// plain fill with the outline layered over it
fn material(in: MaterialInput) -> vec4f {
  let outline = in.outlineColor * in.ring;
  return outline + in.color * in.texel * (1.0 - outline.a);
}
