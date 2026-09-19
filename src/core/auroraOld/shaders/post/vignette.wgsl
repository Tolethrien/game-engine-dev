
@group(0) @binding(0) var linear: sampler;
@group(0) @binding(1) var offscreen: texture_2d<f32>;
@group(0) @binding(2) var<uniform> vignette: Vignette;

struct VertexInput {
  @builtin(vertex_index) vi: u32,
};
struct VertexOutput {
  @builtin(position) pos: vec4f,
  @location(1)  coords: vec2f,
};

struct Vignette {
  color: vec4f, 
  offset: vec2<f32>, 
  r: f32, 
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
    
    let center = vec2<f32>(0.5, 0.5) + vignette.offset;
    let maxDist = 0.5;
    let dist = distance(uv, center) / maxDist;
    
    let vig = 1.0 - smoothstep(vignette.r, vignette.r + 0.5 * vignette.r, dist);
    
    let finalVignette = min(vig, 1.0);
    
    let baseColor = textureSample(offscreen, linear, uv);
    let outputColor = baseColor.rgb * finalVignette;
    let vignetteStrength = vignette.color.a;
    let vignetteColor = vignette.color.rgb / 255;
    let blendedVignetteColor = mix(baseColor.rgb, vignetteColor, vignetteStrength);
    let outputColorRgb = mix(baseColor.rgb, blendedVignetteColor, 1.0 - finalVignette);
    
    return vec4<f32>(outputColorRgb, baseColor.a);
}