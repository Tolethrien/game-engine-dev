import Mat2 from "@/core/axiom/mat2";
import Vec2 from "@/core/axiom/vec2";
import PragmaComponent from "@/core/pragma/component";
import Pragma from "@/core/pragma/pragma";

export default class Transform extends PragmaComponent {
  private position: Vec2 = Vec2.Zero;
  private z: number = 0;
  private rotation: number = 0; // radian
  private scale: Vec2 = Vec2.One;

  private parent: Transform | null = null;
  private readonly children: Set<Transform> = new Set();

  private worldMatrixCache: Mat2 | null = null;
  private worldPositionCache: Vec2 | null = null;
  private worldRotationCache: number | null = null;
  private worldScaleCache: Vec2 | null = null;
  private worldZCache: number | null = null;

  /**DO NOT MUTATE THIS */
  public getPosition(): Vec2 {
    return this.position;
  }
  /**DO NOT MUTATE THIS */
  public getScale(): Vec2 {
    return this.scale;
  }
  /**DO NOT MUTATE THIS */
  public getWorldPosition(): Vec2 {
    if (!this.worldPositionCache)
      this.worldPositionCache = this.getWorldMatrix().getPosition();
    return this.worldPositionCache;
  }
  /**DO NOT MUTATE THIS */
  public getWorldScale(): Vec2 {
    if (!this.worldScaleCache)
      this.worldScaleCache = this.getWorldMatrix().getScale();
    return this.worldScaleCache;
  }

  public setPosition(x: number, y: number) {
    this.position.set(x, y);
    this.markDirty();
  }
  public translate(dx: number, dy: number) {
    this.position.add(dx, dy);
    this.markDirty();
  }
  public setZ(z: number) {
    this.z = z;
    this.markDirty();
  }
  public setRotation(radians: number) {
    this.rotation = radians;
    this.markDirty();
  }
  public rotateBy(deltaRadians: number) {
    this.rotation += deltaRadians;
    this.markDirty();
  }
  public setScale(x: number, y: number) {
    this.scale.set(x, y);
    this.markDirty();
  }

  public setParent(parent: Transform | null) {
    this.parent?.children.delete(this);
    this.parent = parent;
    parent?.children.add(this);
    this.markDirty();
  }
  public getParent() {
    return this.parent;
  }
  public getChildren(): ReadonlySet<Transform> {
    return this.children;
  }

  private markDirty() {
    this.worldMatrixCache = null;
    this.worldPositionCache = null;
    this.worldRotationCache = null;
    this.worldScaleCache = null;
    this.worldZCache = null;
    this.children.forEach((child) => child.markDirty());
  }

  public getWorldMatrix(): Mat2 {
    if (this.worldMatrixCache) return this.worldMatrixCache;
    const local = Mat2.fromTRS(this.position, this.rotation, this.scale);
    this.worldMatrixCache = this.parent
      ? this.parent.getWorldMatrix().clone().multiply(local)
      : local;
    return this.worldMatrixCache;
  }

  public getWorldRotation(): number {
    if (this.worldRotationCache === null)
      this.worldRotationCache = this.getWorldMatrix().getRotation();
    return this.worldRotationCache;
  }

  public getWorldZ(): number {
    if (this.worldZCache === null) {
      this.worldZCache = this.parent
        ? this.parent.getWorldZ() + this.z
        : this.z;
    }
    return this.worldZCache;
  }

  destroy() {
    for (const child of this.children) {
      Pragma.deleteActor(child.actor, child.actor.scene.getName);
    }
    this.parent?.children.delete(this);
  }
}
