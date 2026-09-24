export default class Blend {
  public static readonly replace: GPUBlendState = {
    color: { srcFactor: "one", dstFactor: "zero", operation: "add" },
    alpha: { srcFactor: "one", dstFactor: "zero", operation: "add" },
  };

  public static readonly alpha: GPUBlendState = {
    color: {
      srcFactor: "src-alpha",
      dstFactor: "one-minus-src-alpha",
      operation: "add",
    },
    alpha: {
      srcFactor: "one",
      dstFactor: "one-minus-src-alpha",
      operation: "add",
    },
  };

  public static readonly premultiplied: GPUBlendState = {
    color: {
      srcFactor: "one",
      dstFactor: "one-minus-src-alpha",
      operation: "add",
    },
    alpha: {
      srcFactor: "one",
      dstFactor: "one-minus-src-alpha",
      operation: "add",
    },
  };

  public static readonly behind: GPUBlendState = {
    color: {
      srcFactor: "one-minus-dst-alpha",
      dstFactor: "one",
      operation: "add",
    },
    alpha: {
      srcFactor: "one-minus-dst-alpha",
      dstFactor: "one",
      operation: "add",
    },
  };

  public static readonly additive: GPUBlendState = {
    color: { srcFactor: "src-alpha", dstFactor: "one", operation: "add" },
    alpha: { srcFactor: "zero", dstFactor: "one", operation: "add" },
  };

  public static readonly additivePremultiplied: GPUBlendState = {
    color: { srcFactor: "one", dstFactor: "one", operation: "add" },
    alpha: { srcFactor: "zero", dstFactor: "one", operation: "add" },
  };

  // lerp(target, source, constant), the pass sets it with setBlendConstant
  public static readonly lerpConstant: GPUBlendState = {
    color: {
      srcFactor: "constant",
      dstFactor: "one-minus-constant",
      operation: "add",
    },
    alpha: { srcFactor: "zero", dstFactor: "one", operation: "add" },
  };

  public static readonly screen: GPUBlendState = {
    color: { srcFactor: "one", dstFactor: "one-minus-src", operation: "add" },
    alpha: {
      srcFactor: "one",
      dstFactor: "one-minus-src-alpha",
      operation: "add",
    },
  };

  public static readonly lighten: GPUBlendState = {
    color: { srcFactor: "one", dstFactor: "one", operation: "max" },
    alpha: { srcFactor: "one", dstFactor: "one", operation: "max" },
  };

  public static readonly multiply: GPUBlendState = {
    color: {
      srcFactor: "dst",
      dstFactor: "one-minus-src-alpha",
      operation: "add",
    },
    alpha: { srcFactor: "zero", dstFactor: "one", operation: "add" },
  };

  public static readonly subtract: GPUBlendState = {
    color: {
      srcFactor: "src-alpha",
      dstFactor: "one",
      operation: "reverse-subtract",
    },
    alpha: { srcFactor: "zero", dstFactor: "one", operation: "add" },
  };

  public static readonly darken: GPUBlendState = {
    color: { srcFactor: "one", dstFactor: "one", operation: "min" },
    alpha: { srcFactor: "one", dstFactor: "one", operation: "max" },
  };

  public static readonly erase: GPUBlendState = {
    color: {
      srcFactor: "zero",
      dstFactor: "one-minus-src-alpha",
      operation: "add",
    },
    alpha: {
      srcFactor: "zero",
      dstFactor: "one-minus-src-alpha",
      operation: "add",
    },
  };

  public static readonly mask: GPUBlendState = {
    color: { srcFactor: "zero", dstFactor: "src-alpha", operation: "add" },
    alpha: { srcFactor: "zero", dstFactor: "src-alpha", operation: "add" },
  };
}
