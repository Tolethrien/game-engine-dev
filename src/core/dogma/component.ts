export interface InternalDCProps {
  ID: Symbol;
  tags: Set<string>;
  componentName: ComponentRegistryKeys;
}
export default abstract class DogmaComponent {
  declare public readonly ID: Symbol;
  declare public readonly componentName: ComponentRegistryKeys;
  private entityTags: Set<string> = new Set();

  public constructor({ ID, tags, componentName }: InternalDCProps) {
    this.ID = ID;
    this.entityTags = tags;
    this.componentName = componentName;
  }
}
