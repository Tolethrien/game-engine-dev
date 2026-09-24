import { useLocalStorage } from "../../hooks/useLocalStorage";

// soft locks set in the profiler; editable: false from game code is enforced by the game
const [locked, setLocked] = useLocalStorage<string[]>("watch:locked", []);

export const watchLocks = {
  isLocked: (name: string) => locked().includes(name),
  toggle: (name: string) =>
    setLocked((previous) =>
      previous.includes(name)
        ? previous.filter((item) => item !== name)
        : [...previous, name],
    ),
};
