struct Frame {
  time: f32,
  realTime: f32,
  delta: f32,
  realDelta: f32,
  renderSize: vec2f,
  canvasSize: vec2f,
  frame: u32,
};
struct Params {
  mip: u32,
  layer: u32,
  mode: u32,
  _pad: u32,
};
struct DepthRange {
  low: atomic<u32>,
  high: atomic<u32>,
};

@group(0) @binding(0) var<uniform> frame: Frame;
@group(2) @binding(0) var source: texture_2d_array<f32>;
@group(2) @binding(1) var<uniform> params: Params;
@group(2) @binding(2) var<storage, read_write> range: DepthRange;

override groupSize: u32 = 8u;

const MODE_ENCODE: u32 = 0u;
const MODE_RAW: u32 = 1u;
const MODE_DEPTH: u32 = 2u;
const DEPTH_CLEAR: f32 = 1.0;
const BACKGROUND = vec4f(0.0, 0.0, 0.0, 1.0);

struct VertexOut {
  @builtin(position) position: vec4f,
};

fn level() -> u32 {
  return min(params.mip, textureNumLevels(source) - 1u);
}
fn layer() -> u32 {
  return min(params.layer, textureNumLayers(source) - 1u);
}
fn encodeSrgb(color: vec3f) -> vec3f {
  let low = color * 12.92;
  let high = 1.055 * pow(color, vec3f(1.0 / 2.4)) - 0.055;
  return select(high, low, color <= vec3f(0.0031308));
}

// depth is never negative, so its f32 bits order the same way as u32
@compute @workgroup_size(groupSize, groupSize)
fn computeMain(@builtin(global_invocation_id) id: vec3u) {
  let mip = level();
  if (any(id.xy >= textureDimensions(source, mip))) {
    return;
  }
  let depth = textureLoad(source, id.xy, layer(), mip).r;
  if (depth >= DEPTH_CLEAR) {
    return;
  }
  let bits = bitcast<u32>(max(depth, 0.0));
  atomicMin(&range.low, bits);
  atomicMax(&range.high, bits);
}

@vertex
fn vertexMain(@builtin(vertex_index) index: u32) -> VertexOut {
  var corners = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
  );
  var out: VertexOut;
  out.position = vec4f(corners[index] * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
  return out;
}

@fragment
fn fragmentMain(in: VertexOut) -> @location(0) vec4f {
  let mip = level();
  let size = vec2f(textureDimensions(source, mip));
  let scale = min(frame.canvasSize.x / size.x, frame.canvasSize.y / size.y);
  let offset = (frame.canvasSize - size * scale) * 0.5;
  let coord = (in.position.xy - offset) / scale;
  if (any(coord < vec2f(0.0)) || any(coord >= size)) {
    return BACKGROUND;
  }
  let texel = textureLoad(source, vec2u(coord), layer(), mip);

  if (params.mode == MODE_DEPTH) {
    let low = bitcast<f32>(atomicLoad(&range.low));
    let high = bitcast<f32>(atomicLoad(&range.high));
    if (texel.r >= DEPTH_CLEAR || low > high) {
      return BACKGROUND;
    }
    // near is bright, far fades out but stays above the cleared background
    let t = select(0.0, (texel.r - low) / (high - low), high > low);
    return vec4f(vec3f(mix(1.0, 0.15, t)), 1.0);
  }

  let color = clamp(texel.rgb, vec3f(0.0), vec3f(1.0));
  if (params.mode == MODE_ENCODE) {
    return vec4f(encodeSrgb(color), 1.0);
  }
  return vec4f(color, 1.0);
}
