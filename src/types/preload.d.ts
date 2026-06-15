import { API } from "../preload/preload";
declare global {
  interface Window {
    API: typeof API;
  }
}
