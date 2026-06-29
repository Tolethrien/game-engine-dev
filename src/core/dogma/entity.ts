import { dogmaConfig } from "@sandbox/configs";
import DogmaComponent, { InternalDCProps } from "@dogma/component";
import { assert, createUUID } from "@/utils/utils";

export default abstract class DogmaEntity {
  declare public readonly ID: Symbol;
  private readonly tags: Set<string> = new Set();
  private marker: [string];
  private components = new Map<string, DogmaComponent>();
  public constructor() {
    this.ID = Symbol(createUUID());
    this.marker = [""];
  }
  public addComponent<T extends keyof ComponentRegistry>(
    name: T,
    ...args: DropFirst<ConstructorParameters<ComponentRegistry[T]>>
  ) {
    assert(
      !this.components.has(name),
      `Trying to add multiple instance of Component: ${name} to Entity: ${this.constructor.name}, ID:${this.ID.description}`,
    );
    const internalProps: InternalDCProps = {
      ID: this.ID,
      tags: this.tags,
      componentName: name,
      marker: this.marker,
    };

    const component = new (dogmaConfig.components[name] as new (
      ...args: unknown[]
    ) => DogmaComponent)(internalProps, ...args);
    this.components.set(name, component);
  }
  public getComponents() {
    return this.components;
  }
  public addTag(tag: string) {
    this.tags.add(tag);
  }
  public getTags() {
    return this.tags;
  }
  public setMarker(marker: string) {
    this.marker[0] = marker;
  }
  public getMarker() {
    return this.marker[0];
  }
}
