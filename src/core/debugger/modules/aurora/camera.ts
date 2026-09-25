import type { CameraData } from "@/core/aurora/sharedBinds";
import type { AuroraDebugData, TweakPanel } from "../../interfaces";
import { formatLiteral } from "../command/parse";
import { auroraPage } from "./pages";

// a game that sets the camera every frame overwrites edits here, the poll shows it
export function cameraPanel(source: () => AuroraDebugData): TweakPanel {
  return {
    title: "Camera",
    ...auroraPage("camera"),
    sections: [
      {
        title: "Camera",
        call: "Aurora.setCamera",
        arg: "object",
        fields: [
          { key: "x", control: { kind: "number", step: 1 } },
          { key: "y", control: { kind: "number", step: 1 } },
          { key: "zoom", control: { kind: "slider", min: 0.1, max: 8, step: 0.01 } },
          { key: "rotation", control: { kind: "angle" } },
        ],
        get() {
          const { position, zoom, rotation } = source().camera();
          return { x: position.x, y: position.y, zoom, rotation };
        },
        set(values) {
          const camera: Partial<CameraData> = {};
          if (values.x !== undefined || values.y !== undefined) {
            const { position } = source().camera();
            camera.position = {
              x: (values.x as number | undefined) ?? position.x,
              y: (values.y as number | undefined) ?? position.y,
            };
          }
          if (values.zoom !== undefined) camera.zoom = values.zoom as number;
          if (values.rotation !== undefined) camera.rotation = values.rotation as number;
          source().setCamera(camera);
        },
        format(values) {
          const camera: Partial<CameraData> = {};
          if (values.x !== undefined || values.y !== undefined)
            camera.position = { x: (values.x as number) ?? 0, y: (values.y as number) ?? 0 };
          if (values.zoom !== undefined) camera.zoom = values.zoom as number;
          if (values.rotation !== undefined) camera.rotation = values.rotation as number;
          return `Aurora.setCamera(${formatLiteral(camera)})`;
        },
      },
    ],
  };
}
