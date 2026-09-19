@group(0) @binding(0) var inputTexture: texture_2d<f32>; 
@group(0) @binding(1) var outputTexture: texture_storage_2d<rgba16float, write>; 
@group(0) @binding(2) var linearSampler: sampler;

override workgroupSize: u32 = 8;
const weights = array<f32, 5>(0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
const offsets = array<f32, 5>(1,1,2,4,4); 

@compute @workgroup_size(workgroupSize, workgroupSize)
fn computeMain(@builtin(global_invocation_id) globalD: vec3<u32>) {
    let outputSize = vec2<f32>(textureDimensions(outputTexture));
    
    if (globalD.x >= u32(outputSize.x) || globalD.y >= u32(outputSize.y)) {
        return;
    }

    let inputSize = vec2<f32>(textureDimensions(inputTexture));
    let texelSize = 1.0 / inputSize;
    
    let uv = (vec2<f32>(globalD.xy) * 2.0 + vec2<f32>(1.0)) / inputSize;
    
    var final_color = textureSampleLevel(inputTexture, linearSampler, uv, 0.0) * weights[0];

    for (var i = 1; i < 5; i++) {
        let offset = texelSize * vec2<f32>(offsets[i], 0.0);
        final_color += textureSampleLevel(inputTexture, linearSampler, uv + offset, 0.0) * weights[i];
        final_color += textureSampleLevel(inputTexture, linearSampler, uv - offset, 0.0) * weights[i];
    }

    textureStore(outputTexture, globalD.xy, final_color);
}
