import { useLocalStorage } from "../../hooks/useLocalStorage";

const HISTORY = {
  max: 100,
};

const [items, setItems] = useLocalStorage<string[]>("console:history", []);

// index === items.length means the draft line below the history
const navigation = {
  index: -1,
  draft: "",
};

function push(text: string) {
  setItems((previous) =>
    previous.at(-1) === text
      ? previous
      : [...previous, text].slice(-HISTORY.max),
  );
  reset();
}

function reset() {
  navigation.index = -1;
}

function previous(current: string) {
  const list = items();
  if (list.length === 0) return null;
  if (navigation.index < 0 || navigation.index >= list.length) {
    navigation.draft = current;
    navigation.index = list.length;
  }
  if (navigation.index === 0) return null;
  navigation.index--;
  return list[navigation.index];
}

function next() {
  const list = items();
  if (navigation.index < 0 || navigation.index >= list.length) return null;
  navigation.index++;
  return navigation.index === list.length ? navigation.draft : list[navigation.index];
}

export const commandHistory = { push, reset, previous, next };
