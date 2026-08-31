@group(0) @binding(0) var fontSampler: sampler;
@group(0) @binding(1) var fontsTexture: texture_2d_array<f32>;


struct VertexInput {
     @builtin(vertex_index) vi: u32,
    @location(0) pos: vec2<f32>, // x,y
    @location(1) size: vec2<f32>, // w,h
    @location(2) crop: vec4<f32>,    // crop
    @location(3) textureIndex: f32,    //texture index
    @location(4) rounder: f32,    // round
    @location(5) color: vec4<f32>,    // rgba
}

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) crop: vec2<f32>,       // współrzędne jednostkowe [0..1]
    @location(1) @interpolate(flat) textureIndex: f32,
    @location(2) @interpolate(flat) color: vec4<f32>,


};



const quad = array(vec2f(-1,-1), vec2f(1,-1), vec2f(-1, 1), vec2f(1, 1));
const textureQuad = array(vec2f(0,1), vec2f(1,1), vec2f(0,0), vec2f(1,0));

@vertex
fn vertexMain(props : VertexInput) -> VertexOutput {
    let halfSize = props.size * 0.5;
    let localPos = quad[props.vi] * halfSize;
    let worldPos = props.pos + localPos;
    
    
    let uvScale = textureQuad[props.vi] * props.crop.zw;
    let uv = props.crop.xy + uvScale;      



    var out: VertexOutput;
    out.crop = uv;
    out.color = props.color;
    out.textureIndex = props.textureIndex;
    out.position = vec4<f32>(worldPos, 1, 1);

    
    return out;

}

@fragment
fn fragmentMain(props : VertexOutput) -> @location(0) vec4<f32> {
  // pxRange (AKA distanceRange) comes from the msdfgen tool. Don McCurdy's tool
  // uses the default which is 4.
  let color = props.color/255;
  let index = u32(props.textureIndex);
  
  let pxRange = 4.0;
  let sz = vec2f(textureDimensions(fontsTexture, 0));
  let dx = sz.x*length(vec2f(dpdxFine(props.crop.x), dpdyFine(props.crop.x)));
  let dy = sz.y*length(vec2f(dpdxFine(props.crop.y), dpdyFine(props.crop.y)));
  let toPixels = pxRange * inverseSqrt(dx * dx + dy * dy);
  let sigDist = sampleMsdf(props.crop,index) - 0.5;
  let pxDist = sigDist * toPixels;

  let edgeWidth = 0.5;

  var alpha = smoothstep(-edgeWidth, edgeWidth, pxDist);

  if (alpha < 0.001) {
    discard;
  }

  alpha = pow(color.a * alpha, 0.4); // korekta gamma

  return vec4<f32>(color.rgb,alpha);

}


fn sampleMsdf(texcoord: vec2f,index:u32) -> f32 {
  let c = textureSample(fontsTexture, fontSampler, texcoord,index);
  return max(min(c.r, c.g), min(max(c.r, c.g), c.b));
}
