import Aurora from "./core";
import Aurora2DRenderer from "./renderer/renderer";
import { AuroraConfig } from "./renderer/config";
import Mat4 from "@axiom/mat4";
type CameraZoom = { current: number; max: number; min: number };
type CameraPosition = { x: number; y: number };
const cameraData = {
  keyPressed: new Set(),
};
export default class AuroraCamera {
  private static position: CameraPosition = { x: 0, y: 0 };
  private static speed: number;
  private static zoom: CameraZoom = {
    current: 0,
    max: 0,
    min: 0,
  };
  private static cameraBounds = new Float32Array([0, 0, 0]);
  private static useInputs: boolean = false;
  private static projectionViewMatrix: Mat4;
  private static origin: Position2D;

  public static initialize(config: AuroraConfig["camera"]) {
    const width = Aurora.canvas.width;
    const height = Aurora.canvas.height;
    this.projectionViewMatrix = Mat4.ortho(0, width, height, 0, 0, 1);
    this.origin = { x: width / 2, y: height / 2 };
    this.position = { x: width / 2, y: height / 2 };
    this.speed = config.speed + 100;
    this.zoom = { current: 1, max: config.zoom.max, min: config.zoom.min };

    if (config.builtInCameraInputs) {
      window.onkeydown = (event: KeyboardEvent) => {
        const pressedKey = event.key === " " ? "space" : event.key;
        !event.repeat && cameraData.keyPressed.add(pressedKey);
      };
      window.onkeyup = (event: KeyboardEvent) => {
        const pressedKey = event.key === " " ? "space" : event.key;
        cameraData.keyPressed.has(pressedKey) &&
          cameraData.keyPressed.delete(pressedKey);
      };
      this.useInputs = true;
    }
    const bind = Aurora.createBindGroup({
      label: "cameraBind",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          layout: { buffer: { type: "uniform" } },
          resource: { buffer: Aurora2DRenderer.getBuffer("cameraMatrix") },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          layout: { buffer: { type: "uniform" } },
          resource: { buffer: Aurora2DRenderer.getBuffer("worldBound") },
        },
      ],
    });

    return bind;
    //===========================================
  }

  public static get getPosition() {
    return this.position;
  }
  public static get getZoom() {
    return this.zoom.current;
  }
  public static setMatrix(matrix: Mat4) {
    this.projectionViewMatrix = matrix;
  }
  public static update(buffer: GPUBuffer) {
    Aurora.device.queue.writeBuffer(
      buffer,
      0,
      this.projectionViewMatrix.elements,
    );
  }

  public static updateCameraBound(buffer: GPUBuffer) {
    Aurora.device.queue.writeBuffer(buffer, 0, this.cameraBounds);
  }

  public static setCameraBounds(y: number, h: number) {
    const top = y;
    const bottom = y + h;
    this.cameraBounds[0] = Math.min(this.cameraBounds[0], top);
    this.cameraBounds[1] = Math.max(this.cameraBounds[1], bottom);
  }

  public static get getProjectionViewMatrix() {
    return this.projectionViewMatrix;
  }
  public static getViewBox(): Box {
    const width = Aurora.canvas.width;
    const height = Aurora.canvas.height;
    const zoom = this.zoom.current;
    return {
      x: this.position.x - this.origin.x / zoom,
      y: this.position.y - this.origin.y / zoom,
      w: width / zoom,
      h: height / zoom,
    };
  }
  public static worldToScreen(pos: Position2D): Position2D {
    const zoom = this.zoom.current;
    return {
      x: this.origin.x + (pos.x - this.position.x) * zoom,
      y: this.origin.y + (pos.y - this.position.y) * zoom,
    };
  }
  public static screenToWorld(pos: Position2D): Position2D {
    const zoom = this.zoom.current;
    return {
      x: this.position.x + (pos.x - this.origin.x) / zoom,
      y: this.position.y + (pos.y - this.origin.y) / zoom,
    };
  }
}
