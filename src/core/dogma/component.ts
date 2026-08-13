export interface InternalDCProps {
  ID: Symbol;
  tags: Set<string>;
  componentName: DogmaComponentRegistryKeys;
  marker: [string];
}
export default abstract class DogmaComponent {
  private readonly entityID: Symbol;
  public readonly componentName: DogmaComponentRegistryKeys;
  private readonly entityTags: Set<string> = new Set();
  private readonly entityMarker: [string];
  public constructor({ ID, tags, componentName, marker }: InternalDCProps) {
    this.entityID = ID;
    this.entityTags = tags;
    this.componentName = componentName;
    this.entityMarker = marker;
  }
  public get marker() {
    return this.entityMarker[0];
  }
  public get ID() {
    return this.entityID;
  }
  public get tags() {
    return this.entityTags;
  }
}
