
@group(0) @binding(0) var linear: sampler;
@group(0) @binding(1) var offscreen: texture_2d<f32>;
@group(0) @binding(2) var<uniform> chroma: Chroma;

struct VertexInput {
  @builtin(vertex_index) vi: u32,
};
struct VertexOutput {
  @builtin(position) pos: vec4f,
  @location(1)  coords: vec2f,
};

struct Chroma {
    str: f32,
};


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
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    let uv = input.coords;
    let center = vec2<f32>(0.5, 0.5);
    let delta = uv - center;
    let offset = delta * chroma.str * 0.05;

    let rUv = clamp(uv - offset, vec2<f32>(0.0), vec2<f32>(1.0));
    let gUv = uv; //center
    let bUv = clamp(uv + offset, vec2<f32>(0.0), vec2<f32>(1.0));

    let colorR = textureSample(offscreen, linear, rUv);
    let colorG = textureSample(offscreen, linear, gUv);
    let colorB = textureSample(offscreen, linear, bUv);

    let finalColor = vec4<f32>(colorR.r, colorG.g, colorB.b, 1.0);

    return finalColor;
    
}