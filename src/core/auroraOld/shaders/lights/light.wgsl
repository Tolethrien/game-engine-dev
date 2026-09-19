@group(0) @binding(0) var<uniform> camera: mat4x4<f32>;
@group(0) @binding(1) var<uniform> cameraBound: vec2<f32>;
@group(1) @binding(0) var universalSampler: sampler;
@group(1) @binding(1) var userTextures: texture_2d_array<f32>;


struct VertexInput {
    @builtin(vertex_index) vi: u32,
    @location(0) pos: vec2<f32>, // x,y
    @location(1) size: vec2<f32>, // w,h
    @location(3) color: vec4<f32>,    // rgba
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(1) size: vec2<f32>,
    @location(2) centerPos: vec2<f32>,
    @location(5) @interpolate(flat) color: vec4<f32>,

};


const quad = array(vec2f(-1,-1), vec2f(1,-1), vec2f(-1, 1), vec2f(1, 1));


@vertex
fn vertexMain(props: VertexInput) -> VertexOutput {
    let centerPos = quad[props.vi] * (props.size * 0.5);
    let localPos = centerPos;
    let worldPos = props.pos + localPos;
    let translatePosition = camera * vec4<f32>(worldPos.x, worldPos.y, 0.0, 1.0); 

    var out: VertexOutput;
    out.centerPos = centerPos;
    out.size = props.size;
    out.color = props.color;
    out.position = vec4<f32>(translatePosition.xy, 0.0, 1.0);
    
    return out;
}



@fragment
fn fragmentMain(props: VertexOutput) -> @location(0) vec4<f32> {
    const FALLOFF_EXPONENT: f32 = 2.0;
    let color = props.color/255;
    let intensity = color.a;

    let radius = props.size.x * 0.5;
    let distPixels = length(props.centerPos);
    let distNorm = distPixels / radius;

    if (distNorm > 1.0) {
        discard;
    }

    let attenuation = pow(max(0.0, 1.0 - distNorm * distNorm), FALLOFF_EXPONENT);
    let finalRGB = color.rgb * intensity * attenuation;
    
    
    return vec4<f32>(finalRGB, 0);
}


