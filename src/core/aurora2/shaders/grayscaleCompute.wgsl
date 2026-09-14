@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var outputTexture: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8)
fn computeMain(@builtin(global_invocation_id) id: vec3u) {
  let size = textureDimensions(inputTexture);
  if (id.x >= size.x || id.y >= size.y) {
    return;
  }
  let color = textureLoad(inputTexture, id.xy, 0);
  let luma = dot(color.rgb, vec3f(0.2126, 0.7152, 0.0722));
  textureStore(outputTexture, id.xy, vec4f(vec3f(luma), color.a));
}