import type { Pass } from "./pass";

export abstract class RenderPreset<Config extends object = object> {
  abstract readonly name: string;
  protected readonly config: Config;

  constructor(config: Config) {
    this.config = config;
  }
  public get getConfig(): Readonly<Config> {
    return this.config;
  }
  abstract passes(): Pass[];
  // derived facts worth showing next to the config, e.g. which URP paths are on
  info?(): Record<string, string>;
}
