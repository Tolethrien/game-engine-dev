import { createSignal } from "solid-js";

// only for visual hints: a click reads `event.ctrlKey` itself
const [ctrlHeld, setCtrlHeld] = createSignal(false);

window.addEventListener("keydown", (event) => setCtrlHeld(event.ctrlKey));
window.addEventListener("keyup", (event) => setCtrlHeld(event.ctrlKey));
// Alt+Tab with Ctrl held never delivers the keyup
window.addEventListener("blur", () => setCtrlHeld(false));

export { ctrlHeld };
