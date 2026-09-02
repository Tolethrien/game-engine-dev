export function assert(condition: boolean, msg?: string): asserts condition {
  if (!condition) throw new Error(msg ?? "Assertion Failed");
}
export function createUUID() {
  return crypto.randomUUID();
}
export function loadImg(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const image = new Image();
    image.src = src;
    image.onload = () => res(image);
    image.onerror = () => rej(`image with src: ${src} couldn't be loaded`);
  });
}
export function deepMerge<T extends object>(
  target: T,
  source: DeepPartial<T>,
): T {
  const output = { ...target } as T;

  if (
    target &&
    typeof target === "object" &&
    source &&
    typeof source === "object"
  ) {
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        const sourceValue = source[key as keyof DeepPartial<T>];
        const targetValue = target[key as keyof T];

        if (
          sourceValue &&
          typeof sourceValue === "object" &&
          !Array.isArray(sourceValue) &&
          targetValue &&
          typeof targetValue === "object" &&
          !Array.isArray(targetValue)
        ) {
          (output as any)[key] = deepMerge(
            targetValue as object,
            sourceValue as object,
          );
        } else if (Array.isArray(sourceValue) && Array.isArray(targetValue)) {
          (output as any)[key] = sourceValue;
        } else {
          (output as any)[key] = sourceValue;
        }
      }
    }
  }
  return output;
}
export function flatObjectToValues(obj: Object) {
  let values: number[] = [];

  for (const key of Object.keys(obj)) {
    const value = (obj as any)[key];
    if (Array.isArray(value)) {
      values = values.concat(value);
    } else if (typeof value === "object" && value !== null) {
      values = values.concat(flatObjectToValues(value));
    } else {
      values.push(value);
    }
  }
  return values;
}
