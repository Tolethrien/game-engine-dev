import { assert } from "../../../utils/utils";
import "./auroraDebug.css";
import icon from "../assets/auroraIco128.png";
interface Slider {
  name: string;
  range: {
    min: number;
    max: number;
    step: 1 | 0.1 | 0.01 | 0.001;
    init: number;
  };
  action: (value: number) => void;
}

type ColorProps =
  | {
      mode: "color";
      value: RGB;
    }
  | {
      mode: "alpha";
      value: number;
    };
interface ColorPicer {
  name: string;
  action: (props: ColorProps) => void;
  useAlpha?: boolean;
}
interface SubMenu {
  name: string;
  children: HTMLElement[];
}
interface Input {
  name: string;
}
interface DropDown {
  name: string;
  options: string[];
  selected: string;
  onClick: (value: string) => void;
}
interface Checkbox {
  name: string;
  active: boolean;
  onChange: (active: boolean) => void;
}
function logo() {
  const div = document.createElement("div");
  div.classList.add("logo");
  const logo = document.createElement("img");
  logo.setAttribute("alt", "auroraIco");
  logo.setAttribute("src", icon);
  const name = document.createElement("p");
  name.innerText = "Aurora";
  const span = document.createElement("span");
  span.innerText = "(Debug)";
  div.appendChild(logo);
  div.appendChild(name);
  div.appendChild(span);
  return div;
}
export function createMainMenu(children: HTMLElement[]) {
  const body = document.getElementsByTagName("body")[0];
  assert(body !== undefined, "whoa?! there is no body in HTML file?! HOW!!!!");

  const menu = document.createElement("div");
  const buttons = document.createElement("div");
  buttons.classList.add("menuButtons");
  menu.id = "debugMenu";
  menu.appendChild(logo());
  menu.appendChild(buttons);
  children.forEach((child) => buttons.appendChild(child));
  body.appendChild(menu);
}
export function createSubMenu({ children, name }: SubMenu) {
  //crete div with button and abs bod
  const submenu = document.createElement("div");
  submenu.classList.add("subMenu");
  const subMenuButton = document.createElement("button");
  subMenuButton.classList.add("subMenuButton");
  subMenuButton.innerText = name;
  const menu = document.createElement("div");
  menu.classList.add("hidden");
  menu.classList.add("floatingMenu");
  submenu.appendChild(subMenuButton);
  submenu.appendChild(menu);
  //add event on button
  subMenuButton.addEventListener("click", () => {
    menu.classList.toggle("hidden");
  });

  //add all to floatMenu
  const contentBox = document.createElement("div");
  menu.classList.add("subMenu");
  contentBox.classList.add("subMenuContentBox");

  children.forEach((child) => contentBox.appendChild(child));
  menu.appendChild(contentBox);
  return submenu;
}
export function displayText(text: string) {
  const p = document.createElement("p");
  p.classList.add("titleText");
  p.innerText = text;
  return p;
}
export function createDropDown({ name, options, selected, onClick }: DropDown) {
  const body = document.createElement("div");
  body.classList.add("DropDown");

  const select = document.createElement("select");
  const nameElement = document.createElement("p");
  nameElement.innerText = name;
  options.forEach((option) => {
    const optionElement = document.createElement("option");
    optionElement.value = option;
    optionElement.innerText = option;
    if (option === selected) optionElement.selected = true;
    select.appendChild(optionElement);
  });
  select.addEventListener("change", (event) => {
    const selected = (event.target as HTMLSelectElement).value;
    onClick(selected);
  });
  body.appendChild(nameElement);
  body.appendChild(select);
  return body;
}
export function createCheckbox({ name, active, onChange }: Checkbox) {
  const body = document.createElement("div");
  body.classList.add("checkbox");

  const checkbox = document.createElement("input");
  checkbox.setAttribute("type", "checkbox");
  if (active) checkbox.checked = active;
  checkbox.addEventListener("input", (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    onChange(checked);
  });
  const nameElement = document.createElement("p");
  nameElement.innerText = name;

  body.appendChild(nameElement);
  body.appendChild(checkbox);
  return body;
}
export function createInput({ name }: Input) {
  const body = document.createElement("div");
  const p = document.createElement("p");
  const i = document.createElement("input");
  p.innerText = name;
  body.appendChild(p);
  body.appendChild(i);
  return body;
}

export function createSlider({ name, action, range }: Slider) {
  const div = document.createElement("div");
  div.classList.add("debugSlider");

  const text = document.createElement("p");
  text.innerText = `${name}  (${range.init})`;

  const slider = document.createElement("input");
  slider.setAttribute("type", "range");
  slider.step = String(range.step);
  slider.setAttribute("min", String(range.min));
  slider.setAttribute("max", String(range.max));
  slider.setAttribute("value", String(range.init));
  slider.addEventListener("input", (e) => {
    const target = e.target as HTMLInputElement;
    const value = Number(target.value);
    text.innerText = `${name}  (${value})`;
    action(value);
  });

  div.appendChild(text);
  div.appendChild(slider);
  return div;
}
export function createColorPicker({
  name,
  action,
  useAlpha = true,
}: ColorPicer) {
  const body = document.createElement("div");
  body.classList.add("debugColor");

  const textValue = document.createElement("div");
  textValue.classList.add("debugColorName");
  const colorValue = document.createElement("p");
  colorValue.innerText = useAlpha
    ? `${name} RGBA(0,0,0,`
    : `${name} RGB(0,0,0)`;
  const alphaValue = document.createElement("p");
  alphaValue.innerText = "0)";

  textValue.appendChild(colorValue);
  if (useAlpha) textValue.appendChild(alphaValue);

  const colorMenu = document.createElement("div");
  const colorWheel = document.createElement("input");
  colorWheel.setAttribute("type", "color");
  let alphaSlider;
  if (useAlpha) {
    alphaSlider = document.createElement("input");
    alphaSlider.setAttribute("type", "range");
    alphaSlider.step = "0.01";
    alphaSlider.setAttribute("min", "0");
    alphaSlider.setAttribute("max", "255");
    alphaSlider.setAttribute("value", "0");
  }

  colorMenu.appendChild(colorWheel);
  if (alphaSlider) colorMenu.appendChild(alphaSlider);

  body.appendChild(textValue);
  body.appendChild(colorMenu);

  colorWheel.addEventListener("input", (e) => {
    const target = e.target as HTMLInputElement;
    const value = target.value;
    const r = parseInt(value.slice(1, 3), 16);
    const g = parseInt(value.slice(3, 5), 16);
    const b = parseInt(value.slice(5, 7), 16);
    const displayText = useAlpha
      ? `${name} RGBA(${r},${g},${b},`
      : `${name} RGB(${r},${g},${b})`;
    colorValue.innerText = displayText;
    action({ mode: "color", value: [r, g, b] });
  });
  if (alphaSlider)
    alphaSlider.addEventListener("input", (e) => {
      const target = e.target as HTMLInputElement;
      const value = Number(target.value);
      alphaValue.innerText = `${value})`;
      action({ mode: "alpha", value: value });
    });
  return body;
}
