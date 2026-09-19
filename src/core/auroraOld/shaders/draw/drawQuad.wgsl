@group(0) @binding(0) var<uniform> camera: mat4x4<f32>;
@group(1) @binding(0) var universalSampler: sampler;
@group(1) @binding(1) var userTextures: texture_2d_array<f32>;

struct VertexInput {
    @builtin(vertex_index) vi: u32,
    @location(0) pos: vec3<f32>,
    @location(1) size: vec2<f32>,
    @location(2) crop: vec4<f32>,
    @location(3) textureIndex: f32,
    @location(4) color: vec4<f32>,
    @location(5) emissive: f32,
    @location(6) round: f32,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) crop: vec2<f32>,
    @location(1) @interpolate(flat) textureIndex: f32,
    @location(2) @interpolate(flat) color: vec4<f32>,
    @location(3) z: f32,
    @location(4) @interpolate(flat) emissive: f32,
    @location(5) localUV: vec2<f32>,
    @location(6) @interpolate(flat) round: f32,
};

struct FragmentOutput {
    @location(0) primary: vec4<f32>,
    @location(1) depth: vec4<f32>,
};

const quad = array(vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0), vec2f(1.0, 1.0));
const textureQuad = array(vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0), vec2f(1.0, 1.0));

@vertex
fn vertexMain(props: VertexInput) -> VertexOutput {
    let worldPos = props.pos.xy + (quad[props.vi] * props.size);
    let snappedWorldPos = floor(worldPos);
    let translatePosition = camera * vec4<f32>(worldPos, props.pos.z, 1.0);

    let textureSize = textureDimensions(userTextures, 0);
    let textureSizeFloat = vec2<f32>(f32(textureSize.x), f32(textureSize.y));
    let normalizeCrop = vec4<f32>(props.crop.xy / textureSizeFloat, props.crop.zw / textureSizeFloat);

    var out: VertexOutput;
    out.crop = normalizeCrop.xy + textureQuad[props.vi] * normalizeCrop.zw;
    out.textureIndex = props.textureIndex;
    out.color = props.color;
    out.emissive = props.emissive;
    out.z = props.pos.z;
    out.position = vec4<f32>(translatePosition.xy, props.pos.z, 1.0);
    out.localUV = quad[props.vi];
    out.round = props.round;
    return out;
}

@fragment
fn fragmentMain(props: VertexOutput) -> FragmentOutput {
    var out: FragmentOutput;
    out.depth = vec4<f32>(props.z, 0.0, 0.0, 0.0);
    if (props.round > 0.5) {
    let centered = (props.localUV - vec2<f32>(0.5, 0.5)) * 2.0;
    if (dot(centered, centered) > 1.0) {
        discard;
    }
}
    let texture = textureSampleLevel(userTextures, universalSampler, props.crop, u32(props.textureIndex), 0);
    
    if (texture.a < 0.001) {
        discard;
    }
    
    let color = props.color / 255.0;
    let finalRgb = texture.rgb * color.rgb * props.emissive;
    
    out.primary = vec4<f32>(finalRgb, texture.a * color.a);
    return out;
}