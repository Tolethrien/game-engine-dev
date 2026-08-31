@group(0) @binding(0) var textureSampler: sampler;
@group(0) @binding(1) var textureView: texture_2d<f32>;
@group(0) @binding(2) var<uniform> options:Options;

struct VertexInput {
  @builtin(vertex_index) vi: u32,
};
struct VertexOutput {
  @builtin(position) pos: vec4f,
  @location(1)  coords: vec2f,
  
};
struct Options{
    isDepth:u32,
    isToneMapped:u32
}

const quad = array(vec2f(-1,-1), vec2f(1,-1), vec2f(-1, 1), vec2f(1, 1));
const textureQuad = array(vec2f(0,1), vec2f(1,1), vec2f(0,0), vec2f(1,0));

@vertex
fn vertexMain(props: VertexInput) -> VertexOutput {
    var out:VertexOutput;
    out.pos = vec4<f32>(quad[props.vi],1.0,1.0);
    out.coords = textureQuad[props.vi];
    return out;
}

@fragment
fn fragmentMain(props:VertexOutput) -> @location(0) vec4f{
   let texture = textureSampleLevel(textureView,textureSampler,props.coords,0);
   var finalRgb = select(vec3<f32>(texture.r),texture.rgb,options.isDepth == 0);
    if(options.isToneMapped == 1){
        finalRgb = reinhard_tone_map(finalRgb);
    }
    else if(options.isToneMapped == 2){
        finalRgb = aces_tone_map(finalRgb);
    }
    else if(options.isToneMapped == 3){
        finalRgb = filmic_tone_map(finalRgb);
    }
    
   
   return vec4<f32>(finalRgb.rgb,1);
}

fn reinhard_tone_map(x: vec3f) -> vec3f {
    return x / (x + vec3<f32>(1.0));
}

fn aces_tone_map(x: vec3f) -> vec3f {
    let a = 2.51;
    let b = 0.03;
    let c = 2.43;
    let d = 0.59;
    let e = 0.14;
    return (x * (a * x + b)) / (x * (c * x + d) + e);
}

fn filmic_tone_map(x: vec3f) -> vec3f {
    let val = max(vec3<f32>(0.0), x - 0.004);
    let result = (val * (6.2 * x + 0.5)) / (val * (6.2 * x + 1.7) + 0.06);
    return result;
}
