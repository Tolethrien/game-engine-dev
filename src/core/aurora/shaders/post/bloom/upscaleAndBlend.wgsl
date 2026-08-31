
@group(0) @binding(0) var lowerResBlurTexture: texture_2d<f32>;
@group(0) @binding(1) var currentLevelTexture: texture_2d<f32>;
@group(0) @binding(2) var outputTexture: texture_storage_2d<rgba16float, write>;
@group(0) @binding(3) var linearSampler: sampler;

override workgroupSize: u32 = 8;

@compute @workgroup_size(workgroupSize, workgroupSize)
fn computeMain(@builtin(global_invocation_id) globalID: vec3<u32>) {
    let outputSize = vec2<f32>(textureDimensions(outputTexture));
    let uintSize = vec2<u32>(outputSize); 
    if (globalID.x >= uintSize.x || globalID.y >= uintSize.y) {
        return;
    }

    let uv = (vec2<f32>(globalID.xy) + vec2<f32>(0.5)) / outputSize;

    let upscaledBlurColor = textureSampleLevel(lowerResBlurTexture, linearSampler, uv, 0.0);
    let currentLevelColor = textureSampleLevel(currentLevelTexture, linearSampler, uv, 0.0);
    let blendedColor = upscaledBlurColor * 0.8 + currentLevelColor;

    textureStore(outputTexture, globalID.xy, blendedColor);
}
