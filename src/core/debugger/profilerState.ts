let profilerOpen = false;

export const profilerState = {
  get isOpen() {
    return profilerOpen;
  },
  connect() {
    window.API.DEBUG.onProfilerState((isOpen) => (profilerOpen = isOpen));
    window.API.DEBUG.getProfilerState().then((isOpen) => (profilerOpen = isOpen));
  },
};
