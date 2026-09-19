@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var outputTexture: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var linearSampler: sampler; 
@group(1) @binding(0) var<uniform> bloomParams: BloomParams;

override workgroupSize: u32 = 8;

struct BloomParams{
    threshold:f32,
    thresholdSoftness:f32,
    bloomIntense:f32
};

@compute
@workgroup_size(workgroupSize, workgroupSize)
fn computeMain(@builtin(global_invocation_id) globalID: vec3<u32>) {
    let outputCoords = globalID.xy;

    let inputSize = textureDimensions(inputTexture);
    let outputSize = inputSize;

    if (outputCoords.x >= outputSize.x || outputCoords.y >= outputSize.y) {
        return;
    }

    let uv = (vec2<f32>(outputCoords) + vec2<f32>(0.5)) / vec2<f32>(outputSize);

    let sampledColor = textureSampleLevel(inputTexture, linearSampler, uv, 0.0);

    let thresholdValue = bloomParams.threshold; 
    let kneeValue = bloomParams.thresholdSoftness;     
    
    var outputColor = vec4<f32>(0, 0, 0, 0);

    let luminance = dot(sampledColor.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));


    if (luminance > thresholdValue) {
        let bloomFactor = max(0.0, luminance - thresholdValue); 
        let softFactor = bloomFactor / kneeValue; 
        let squaredFactor = softFactor * softFactor;
        let weight = squaredFactor / (1.0 + squaredFactor); 
        outputColor = sampledColor * weight;
    }
    
    textureStore(outputTexture, outputCoords, outputColor);
}