import { dogmaConfig } from "@sandbox/configs";
import DogmaComponent, { InternalDCProps } from "@dogma/component";
import { assert, createUUID } from "@/utils/utils";

export default abstract class DogmaEntity {
  declare public readonly ID: Symbol;
  private readonly tags: Set<string> = new Set();
  private components = new Map<string, DogmaComponent>();
  public constructor() {
    this.ID = Symbol(createUUID());
  }
  public addComponent<T extends keyof ComponentRegistry>(
    name: T,
    ...args: DropFirst<ConstructorParameters<ComponentRegistry[T]>>
  ) {
    assert(
      !this.components.has(name),
      `Trying to add multiple instance of Component: ${name} to Entity: ${this.constructor.name}, ID:${this.ID.description}`,
    );
    const internal: InternalDCProps = {
      ID: this.ID,
      tags: this.tags,
      componentName: name,
    };

    const instance = new (dogmaConfig.components[name] as new (
      ...args: unknown[]
    ) => DogmaComponent)(internal, ...args);
    this.components.set(name, instance);
  }
  public addTag(tag: string) {
    this.tags.add(tag);
  }
  public getComponents() {
    return this.components;
  }
  //   public getTags() {
  //     return this.tags;
  //   }
}
