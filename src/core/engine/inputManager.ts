interface MouseEvents {
  mousePos: Position2D;
  buttons: Set<number>;
  wheel: number;
}

enum MouseKey {
  LEFT,
  MIDDLE,
  RIGHT,
  BUTTON4,
  BUTTON5,
  BUTTON6,
}

const MODS = ["Shift", "Alt", "Control"] as const;
type Action = {
  name: string;
  mods: (typeof MODS)[number][] | "NoMod";
} & (
  | { key: string; mouse?: never }
  | { mouse: keyof typeof MouseKey; key?: never }
);

export default class InputManager {
  private static mousePreviousFrame: MouseEvents = this.generateMouseManifold();
  private static mouseCurrentFrame: MouseEvents = this.generateMouseManifold();
  private static mouseInputBuffer: MouseEvents = this.generateMouseManifold();
  private static keyPreviousFrame = new Set<string>();
  private static keyCurrentFrame = new Set<string>();
  private static keyInputBuffer = new Set<string>();
  private static actionMap: Map<string, Action> = new Map();
  public static registerEvents(canvas: HTMLCanvasElement) {
    canvas.addEventListener("mousedown", (e) => this.mouseEvents(e, "down"));
    canvas.addEventListener("mouseup", (e) => this.mouseEvents(e, "up"));
    canvas.addEventListener("mousemove", (e) => this.mouseMove(e));
    canvas.addEventListener("wheel", (e) => this.wheelEvent(e));
    //this should be maybe on window? if you want to build UI in html then could be better.
    canvas.addEventListener("keydown", (e) => this.keyEvents(e, "down"));
    canvas.addEventListener("keyup", (e) => this.keyEvents(e, "up"));
  }
  public static updateInputs() {
    this.keyPreviousFrame = new Set(this.keyCurrentFrame);
    this.keyCurrentFrame = new Set(this.keyInputBuffer);
    this.mousePreviousFrame = {
      buttons: new Set(this.mouseCurrentFrame.buttons),
      mousePos: { ...this.mouseCurrentFrame.mousePos },
      wheel: this.mouseCurrentFrame.wheel,
    };
    this.mouseCurrentFrame = {
      buttons: new Set(this.mouseInputBuffer.buttons),
      mousePos: { ...this.mouseInputBuffer.mousePos },
      wheel: this.mouseInputBuffer.wheel,
    };
    this.mouseInputBuffer.wheel = 0;
  }

  public static isMouseClicked(button: keyof typeof MouseKey) {
    const btn = MouseKey[button];
    return (
      this.mouseCurrentFrame.buttons.has(btn) &&
      !this.mousePreviousFrame.buttons.has(btn)
    );
  }
  public static isMouseHold(button: keyof typeof MouseKey) {
    const btn = MouseKey[button];
    return this.mouseCurrentFrame.buttons.has(btn);
  }
  public static isMouseReleased(button: keyof typeof MouseKey) {
    const btn = MouseKey[button];
    return (
      !this.mouseCurrentFrame.buttons.has(btn) &&
      this.mousePreviousFrame.buttons.has(btn)
    );
  }
  public static isMouseMoved() {
    return (
      this.mouseCurrentFrame.mousePos.x !==
        this.mousePreviousFrame.mousePos.x ||
      this.mouseCurrentFrame.mousePos.y !== this.mousePreviousFrame.mousePos.y
    );
  }
  public static isMouseScrolled() {
    return this.mouseCurrentFrame.wheel !== 0;
  }
  public static getMousePos() {
    return this.mouseCurrentFrame.mousePos;
  }
  public static getMouseScroll() {
    return this.mouseCurrentFrame.wheel;
  }
  public static isKeyPressed(char: string) {
    return this.keyCurrentFrame.has(char) && !this.keyPreviousFrame.has(char);
  }
  public static isKeyHold(char: string) {
    return this.keyCurrentFrame.has(char);
  }
  public static isKeyRelease(char: string) {
    return !this.keyCurrentFrame.has(char) && this.keyPreviousFrame.has(char);
  }
  //ACTIONS
  public static bindAction(action: Action) {
    this.actionMap.set(action.name, action);
  }
  public static removeAction(actionName: string) {
    this.actionMap.delete(actionName);
  }
  public static onActionHold(name: string): boolean {
    const action = this.actionMap.get(name);
    if (!action) return false;

    let isButtonPressed = false;
    if (action.key) isButtonPressed = this.isKeyHold(action.key);
    else if (action.mouse) isButtonPressed = this.isMouseHold(action.mouse);
    if (!isButtonPressed) return false;
    return this.checkActionModsPressed(action);
  }

  public static onActionPressed(name: string): boolean {
    const action = this.actionMap.get(name);
    if (!action) return false;

    let isActionTriggered = false;
    if (action.key) isActionTriggered = this.isKeyPressed(action.key);
    else if (action.mouse)
      isActionTriggered = this.isMouseClicked(action.mouse);

    if (!isActionTriggered) return false;
    return this.checkActionModsPressed(action);
  }

  public static onActionReleased(name: string): boolean {
    const action = this.actionMap.get(name);
    if (!action) return false;

    let isActionReleased = false;
    if (action.key) isActionReleased = this.isKeyRelease(action.key);
    else if (action.mouse)
      isActionReleased = this.isMouseReleased(action.mouse);

    if (!isActionReleased) return false;
    return this.checkActionModsPressed(action);
  }

  //helpers
  private static mouseEvents(e: MouseEvent, type: "up" | "down") {
    if (type === "down") this.mouseInputBuffer.buttons.add(e.button);
    else this.mouseInputBuffer.buttons.delete(e.button);
  }
  private static mouseMove(e: MouseEvent) {
    this.mouseInputBuffer.mousePos.x = e.offsetX;
    this.mouseInputBuffer.mousePos.y = e.offsetY;
  }
  private static wheelEvent(e: WheelEvent) {
    this.mouseInputBuffer.wheel = e.deltaY;
  }
  private static keyEvents(e: KeyboardEvent, type: "up" | "down") {
    if (type === "down") this.keyInputBuffer.add(e.key);
    else this.keyInputBuffer.delete(e.key);
  }
  private static generateMouseManifold(): MouseEvents {
    return {
      buttons: new Set(),
      mousePos: { x: -1, y: -1 },
      wheel: 0,
    };
  }
  private static checkActionModsPressed(action: Action) {
    const anyModPressed = MODS.some((mod) => this.keyPreviousFrame.has(mod));
    if (action.mods === "NoMod") return !anyModPressed;
    return action.mods.every((mod) => this.keyPreviousFrame.has(mod));
  }
}
