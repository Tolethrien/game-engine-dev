import { render } from "solid-js/web";
import "./profiler.css";
import TitleBar from "./components/titleBar";
import BottomConsole from "./console/bottomConsole";
import { TabBar, TabContent } from "./tabs";

function App() {
  return (
    <>
      <TitleBar />
      <TabBar />
      <main class="min-h-0 flex-1 overflow-hidden">
        <TabContent />
      </main>
      <BottomConsole />
    </>
  );
}

render(() => <App />, document.getElementById("app")!);
