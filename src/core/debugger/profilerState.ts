let profilerOpen = true;

export const profilerState = {
  get isOpen() {
    return profilerOpen;
  },
  connect() {
    window.API.DEBUG.onProfilerState((isOpen) => (profilerOpen = isOpen));
  },
};
