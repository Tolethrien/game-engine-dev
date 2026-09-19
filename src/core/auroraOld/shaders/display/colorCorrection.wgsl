@group(0) @binding(0) var offscreenTexture: texture_2d<f32>;
@group(0) @binding(1) var lightsTexture: texture_2d<f32>;
@group(0) @binding(2) var bloomTexture: texture_2d<f32>;
@group(0) @binding(3) var outputTexture: texture_storage_2d<rgba16float, write>;
@group(1) @binding(0) var<uniform> colorCorrection: ColorCorrection;
@group(2) @binding(0) var<uniform> bloomParams: BloomParams;


override workgroupSize: u32 = 8;
override toneMapping: u32 = 2;

struct BloomParams{
    threshold:f32,
    thresholdSoftness:f32,
    bloomIntense:f32
};

struct ColorCorrection {
    exposure: f32,
    saturation: f32,
    contrast: f32,
    whiteBalance: f32,
    hueShift: f32,
    brightness: f32,
    invert: f32,
    tint: vec4<f32>,
}
@compute @workgroup_size(workgroupSize,workgroupSize) 
fn computeMain(@builtin(global_invocation_id) globalId: vec3<u32>) {

    let dims = textureDimensions(offscreenTexture);
    if (globalId.x >= u32(dims.x) || globalId.y >= u32(dims.y)) {
        return; 
    }
    let texCoords = vec2<i32>(globalId.xy);
    let offscreenPixel = textureLoad(offscreenTexture, texCoords,0);
    let lightPixel = textureLoad(lightsTexture, texCoords,0);
    let bloomPixel = textureLoad(bloomTexture, texCoords,0); 
    var color = vec3<f32>((offscreenPixel.rgb * lightPixel.rgb) + bloomPixel.rgb * bloomParams.bloomIntense);
    
    


    // Exposure
    color *=  exp2(colorCorrection.exposure);

    // White Balance
    let wb = colorCorrection.whiteBalance;
    color.r += wb/10;
    color.b -= wb/10;

 

    //toneMap
    if (toneMapping == 1) {
        color = reinhardToneMap(color);
    } else if (toneMapping == 2) { 
        color = acesToneMap(color);
    } else if (toneMapping == 3) { 
        color = filmicToneMap(color);
    }
    
    // Contrast
    let contrastFactor = (colorCorrection.contrast * 0.5) + 1.0;
    color = ((color - 0.5) * contrastFactor) + 0.5;
    // Saturation
    let luma = dot(color, vec3<f32>(0.2126, 0.7152, 0.0722)); // Rec. 709 luma
    color = mix(vec3<f32>(luma), color, colorCorrection.saturation + 1.0);

    // Hue Shift 
    let angle = radians(colorCorrection.hueShift);
    let cosAngle = cos(angle);
    let sinAngle = sin(angle);
    let k = vec3<f32>(0.57735); 
    let hueRotationMatrix = mat3x3<f32>(
        vec3<f32>(cosAngle + (1.0 - cosAngle) * k.x * k.x, (1.0 - cosAngle) * k.x * k.y - sinAngle * k.z, (1.0 - cosAngle) * k.x * k.z + sinAngle * k.y),
        vec3<f32>((1.0 - cosAngle) * k.y * k.x + sinAngle * k.z, cosAngle + (1.0 - cosAngle) * k.y * k.y, (1.0 - cosAngle) * k.y * k.z - sinAngle * k.x),
        vec3<f32>((1.0 - cosAngle) * k.z * k.x - sinAngle * k.y, (1.0 - cosAngle) * k.z * k.y + sinAngle * k.x, cosAngle + (1.0 - cosAngle) * k.z * k.z)
    );
    color = color * hueRotationMatrix;


   // Brightness
    if (colorCorrection.brightness >= 0.0) {
        color *= (1.0 + colorCorrection.brightness);
    } else {
        color = mix(color, vec3<f32>(0.0), abs(colorCorrection.brightness));
    }

    // Tint 
    color = mix(color, colorCorrection.tint.rgb/255, colorCorrection.tint.a/255);
    
    //invert
    let invertedColor = vec3<f32>(1.0, 1.0, 1.0) - color;
    color = mix(color, invertedColor, colorCorrection.invert);
    
    // Write the processed color to the output texture
    textureStore(outputTexture, texCoords, vec4<f32>(color,offscreenPixel.a));
}

fn reinhardToneMap(x: vec3f) -> vec3f {
    return x / (x + vec3<f32>(1.0));
}

fn acesToneMap(x: vec3f) -> vec3f {
    let a = 2.51;
    let b = 0.03;
    let c = 2.43;
    let d = 0.59;
    let e = 0.14;
    return (x * (a * x + b)) / (x * (c * x + d) + e);
}

fn filmicToneMap(x: vec3f) -> vec3f {
    let val = max(vec3<f32>(0.0), x - 0.004);
    let result = (val * (6.2 * x + 0.5)) / (val * (6.2 * x + 1.7) + 0.06);
    return result;
}