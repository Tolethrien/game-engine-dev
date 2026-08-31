import { KEY_GROUP, type KeyCode } from "./keys";
import Time from "./time";

interface MouseEvents {
  mousePos: Position2D;
  buttons: Set<number>;
  wheel: Position2D;
}

enum MouseKey {
  LEFT,
  MIDDLE,
  RIGHT,
  BUTTON4,
  BUTTON5,
  BUTTON6,
}

const MODS = ["shift", "ctrl", "alt"] as const;
type ModKey = (typeof MODS)[number];

type Action = {
  name: string;
  mods: ModKey[] | "NoMod";
} & (
  | { key: KeyCode; mouse?: never }
  | { mouse: keyof typeof MouseKey; key?: never }
);
const WHEEL_GESTURE_GAP = 150;
export default class InputManager {
  private static readonly NO_SCROLL: Position2D = { x: 0, y: 0 };
  private static mousePreviousFrame: MouseEvents = this.generateMouseManifold();
  private static mouseCurrentFrame: MouseEvents = this.generateMouseManifold();
  private static mouseInputBuffer: MouseEvents = this.generateMouseManifold();
  private static keyPreviousFrame = new Set<string>();
  private static keyCurrentFrame = new Set<string>();
  private static keyInputBuffer = new Set<string>();
  private static textBuffer = "";
  private static textFrame = "";
  private static editBuffer: string[] = [];
  private static editFrame: string[] = [];
  private static actionMap: Map<string, Action> = new Map();
  private static lastWheelTime = 0;
  private static mouseClaimed = false;
  private static claimSuspended = false;
  private static claimLatch: Map<number, boolean> = new Map();
  private static wheelLatch: boolean | undefined;
  private static keyboardClaimed = false;
  private static keyboardClaimSuspended = false;
  private static keyClaimLatch: Map<string, boolean> = new Map();

  public static registerEvents() {
    window.addEventListener("mousedown", (e) => this.mouseEvents(e, "down"));
    window.addEventListener("mouseup", (e) => this.mouseEvents(e, "up"));
    window.addEventListener("mousemove", (e) => this.mouseMove(e));
    window.addEventListener("wheel", (e) => this.wheelEvent(e), {
      passive: false,
    });
    window.addEventListener("keydown", (e) => this.keyEvents(e, "down"));
    window.addEventListener("keyup", (e) => this.keyEvents(e, "up"));

    window.addEventListener("blur", () => {
      this.keyInputBuffer.clear();
      this.mouseInputBuffer.buttons.clear();
      this.claimLatch.clear();
      this.keyClaimLatch.clear();
      this.textBuffer = "";
      this.editBuffer.length = 0;
    });
  }

  public static updateInputs() {
    this.keyPreviousFrame = new Set(this.keyCurrentFrame);
    this.keyCurrentFrame = new Set(this.keyInputBuffer);
    this.mousePreviousFrame = {
      buttons: new Set(this.mouseCurrentFrame.buttons),
      mousePos: { ...this.mouseCurrentFrame.mousePos },
      wheel: { ...this.mouseCurrentFrame.wheel },
    };
    this.mouseCurrentFrame = {
      buttons: new Set(this.mouseInputBuffer.buttons),
      mousePos: { ...this.mouseInputBuffer.mousePos },
      wheel: { ...this.mouseInputBuffer.wheel },
    };
    this.mouseInputBuffer.wheel.x = 0;
    this.mouseInputBuffer.wheel.y = 0;
    for (const btn of this.claimLatch.keys()) {
      if (this.mouseCurrentFrame.buttons.has(btn)) continue;
      if (this.mousePreviousFrame.buttons.has(btn)) continue;
      this.claimLatch.delete(btn);
    }
    this.textFrame = this.textBuffer;
    this.textBuffer = "";
    const swap = this.editFrame;
    this.editFrame = this.editBuffer;
    this.editBuffer = swap;
    this.editBuffer.length = 0;
  }

  //MOUSE
  public static isMouseClicked(button: keyof typeof MouseKey) {
    const btn = MouseKey[button];
    if (this.isClaimed(btn)) return false;
    return (
      this.mouseCurrentFrame.buttons.has(btn) &&
      !this.mousePreviousFrame.buttons.has(btn)
    );
  }
  public static isMouseHold(button: keyof typeof MouseKey) {
    const btn = MouseKey[button];
    if (this.isClaimed(btn)) return false;
    return this.mouseCurrentFrame.buttons.has(btn);
  }
  public static isMouseReleased(button: keyof typeof MouseKey) {
    const btn = MouseKey[button];
    if (this.isClaimed(btn)) return false;
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
    if (this.isWheelClaimed()) return false;
    const wheel = this.mouseCurrentFrame.wheel;
    return wheel.x !== 0 || wheel.y !== 0;
  }
  public static getMousePos() {
    return this.mouseCurrentFrame.mousePos;
  }
  public static getMouseScroll() {
    if (this.isWheelClaimed()) return this.NO_SCROLL;
    return this.mouseCurrentFrame.wheel;
  }

  //KEYBOARD
  public static isKeyPressed(key: KeyCode) {
    if (this.isKeyClaimed(key)) return false;
    return this.keyCurrentFrame.has(key) && !this.keyPreviousFrame.has(key);
  }
  public static isKeyHold(key: KeyCode) {
    if (this.isKeyClaimed(key)) return false;
    return this.keyCurrentFrame.has(key);
  }
  public static isKeyRelease(key: KeyCode) {
    if (this.isKeyClaimed(key)) return false;
    return !this.keyCurrentFrame.has(key) && this.keyPreviousFrame.has(key);
  }
  public static isAnyKeyHold(keys: readonly KeyCode[]) {
    return keys.some(
      (key) => !this.isKeyClaimed(key) && this.keyCurrentFrame.has(key),
    );
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
    e.preventDefault();
    if (type === "down") this.mouseInputBuffer.buttons.add(e.button);
    else this.mouseInputBuffer.buttons.delete(e.button);
  }
  private static mouseMove(e: MouseEvent) {
    this.mouseInputBuffer.mousePos.x = e.offsetX;
    this.mouseInputBuffer.mousePos.y = e.offsetY;
  }
  private static wheelEvent(e: WheelEvent) {
    e.preventDefault();
    this.mouseInputBuffer.wheel.x += e.deltaX;
    this.mouseInputBuffer.wheel.y += e.deltaY;
  }
  private static keyEvents(e: KeyboardEvent, type: "up" | "down") {
    e.preventDefault();
    if (type !== "down") {
      this.keyInputBuffer.delete(e.code);
      return;
    }
    this.keyInputBuffer.add(e.code);

    // AltGr - Windows ctrl+alt — ąę and shit
    const altGr = e.ctrlKey && e.altKey;
    if (e.key.length === 1) {
      if (altGr || (!e.ctrlKey && !e.metaKey)) this.textBuffer += e.key;
    } else {
      this.editBuffer.push(e.key);
    }
  }
  private static generateMouseManifold(): MouseEvents {
    return {
      buttons: new Set(),
      mousePos: { x: -1, y: -1 },
      wheel: { x: 0, y: 0 },
    };
  }
  private static isModHeld(mod: ModKey) {
    return this.isAnyKeyHold(KEY_GROUP[mod]);
  }
  private static checkActionModsPressed(action: Action) {
    if (action.mods === "NoMod")
      return !MODS.some((mod) => this.isModHeld(mod));
    return action.mods.every((mod) => this.isModHeld(mod));
  }
  //claims (for UI - don't click in game and ui at the same time)
  public static setMouseClaim(claimed: boolean) {
    this.claimSuspended = false;
    this.mouseClaimed = claimed;
    for (const btn of this.mouseCurrentFrame.buttons) {
      if (this.mousePreviousFrame.buttons.has(btn)) continue;
      this.claimLatch.set(btn, claimed);
    }
    const now = Time.getTime();
    const wheel = this.mouseCurrentFrame.wheel;
    if (wheel.x !== 0 || wheel.y !== 0) {
      if (this.wheelLatch === undefined) this.wheelLatch = claimed;
      this.lastWheelTime = now;
    } else if (now - this.lastWheelTime > WHEEL_GESTURE_GAP) {
      this.wheelLatch = undefined;
    }
  }
  private static isClaimed(btn: number) {
    if (this.claimSuspended) return false;
    const latched = this.claimLatch.get(btn);
    if (latched !== undefined) return latched;
    return this.mouseClaimed;
  }
  public static setKeyboardClaim(claimed: boolean) {
    this.keyboardClaimSuspended = false;
    this.keyboardClaimed = claimed;
    for (const key of this.keyCurrentFrame) {
      if (this.keyPreviousFrame.has(key)) continue;
      this.keyClaimLatch.set(key, claimed);
    }
  }

  public static suspendKeyboardClaim() {
    this.keyboardClaimSuspended = true;
  }

  private static isKeyClaimed(key: string) {
    if (this.keyboardClaimSuspended) return false;
    const latched = this.keyClaimLatch.get(key);
    if (latched !== undefined) return latched;
    return this.keyboardClaimed;
  }
  public static suspendClaim() {
    this.claimSuspended = true;
  }
  private static isWheelClaimed() {
    if (this.claimSuspended) return false;
    if (this.wheelLatch !== undefined) return this.wheelLatch;
    return this.mouseClaimed;
  }
  public static getTypedText() {
    return this.textFrame;
  }
  public static getEditKeys(): readonly string[] {
    return this.editFrame;
  }
}
