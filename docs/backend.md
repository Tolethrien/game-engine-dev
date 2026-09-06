# BACKEND & PRELOAD — jak silnik rozmawia z systemem

Aplikacja to Electron — czyli **trzy oddzielne procesy JS**, które nie widzą się nawzajem bezpośrednio:

- **main** (`src/backend`) — proces Node.js/Electron. Ma pełny dostęp do systemu (pliki, okna, IPC), ale **nie** widzi DOM-u ani WebGPU.
- **renderer okna gry** (`src/sandbox` + cały `src/core`) — zwykła strona web w Chromium. Ma DOM/WebGPU/Web Audio, ale **nie** ma dostępu do Node/systemu plików — to tu żyje cała gra.
- **renderer okna profilera** (`src/profiler`) — druga, osobna strona web (Solid.js), tylko w trybie dev (patrz [debugger.md](./debugger.md)).
- **preload** (`src/preload/preload.ts`) — jedyny most między main a każdym rendererem. Ma dostęp do Electrona (`ipcRenderer`) i jest jedynym miejscem, które może bezpiecznie wystawić coś rendererowi przez `window.API`.

Renderer gry **nigdy** nie importuje `electron`/`fs`/`path` bezpośrednio — jedyna droga do systemu to `window.API.*`, zdefiniowane w preloadzie i zasilane z procesu main przez IPC.

---

## Skąd biorą się te procesy

`forge.config.ts` buduje osobno main, preload i renderery:

```ts
plugins: [
  new VitePlugin({
    build: [
      { entry: "src/backend/main.ts", config: "configs/vite.main.config.mts" },
      { entry: "src/preload/preload.ts", config: "configs/vite.preload.config.mts" },
    ],
    renderer: [
      { name: "main_window", config: "configs/vite.renderer.config.mts" },
      // profiler_window renderer istnieje TYLKO w buildzie odpalonym przez `pnpm dev`
      ...(isDev ? [{ name: "profiler_window", config: "configs/vite.profiler.config.mts" }] : []),
    ],
  }),
],
```

`isDev = process.env.npm_lifecycle_event === "dev"` — to znaczy, że okno profilera nie jest tylko ukryte na prodzie (patrz `!app.isPackaged` w `main.ts`), tylko **w ogóle nie jest budowane** przez `pnpm package`/`pnpm make`.

`main.ts` (`app.on("ready", ...)`) tworzy okno gry zawsze, a okno profilera + jego IPC tylko gdy `!app.isPackaged`:

```ts
app.on("ready", () => {
  createGameWindow();
  if (!app.isPackaged) {
    registerDebugIPC();
    ipcMain.on("openProfiler", openProfilerWindow);
    createProfilerWindow();
  }
});
```

Oba okna (`createGameWindow`/`createProfilerWindow`, w `src/backend/windows/`) używają **tego samego** skompilowanego `preload.js` — obie strony (gra i profiler) widzą identyczny `window.API`.

---

## `window.API` — co jest dziś wystawione

Zdefiniowane w `src/preload/preload.ts`, dwie grupy:

```ts
window.API.WINDOW.getWindowSize();              // Promise<Size2D> — request/response
window.API.WINDOW.onWindowResize(cb);           // subskrypcja — main wysyła, gdy okno zmienia rozmiar
window.API.WINDOW.onFocusChanged(cb);           // subskrypcja focus/blur okna
window.API.WINDOW.setFullScreen(bool);          // fire-and-forget
window.API.WINDOW.getRefreshRate();             // Promise<number>

window.API.DEBUG.sendPerformanceSnapshot(data); // fire-and-forget, renderer -> main -> profiler
window.API.DEBUG.onPerformanceSnapshot(cb);     // subskrypcja (w oknie profilera)
window.API.DEBUG.sendAuroraSnapshot(data);
window.API.DEBUG.onAuroraSnapshot(cb);
window.API.DEBUG.onGameReloaded(cb);
window.API.DEBUG.onProfilerState(cb);
window.API.DEBUG.openProfiler();
```

Dwa wzorce komunikacji, oba oparte o `ipcRenderer`/`ipcMain`:

| Wzorzec | Renderer → main | Main → renderer |
|---|---|---|
| **Jednorazowe zapytanie z odpowiedzią** | `ipcRenderer.invoke("kanał")` | `ipcMain.handle("kanał", async (_, args) => wynik)` |
| **Zdarzenie bez odpowiedzi** | `ipcRenderer.send("kanał", dane)` | `ipcMain.on("kanał", (_, dane) => ...)` |
| **Subskrypcja (main wysyła, kiedy chce)** | `ipcRenderer.on("kanał", cb)` (opakowane w preloadzie w helper `on(...)`) | `webContents.send("kanał", dane)` |

`getWindowSize`/`getRefreshRate` to pierwszy wzorzec (`invoke`/`handle`) — bo renderer **czeka** na wynik. `setFullScreen`/`sendPerformanceSnapshot` to drugi (`send`/`on`) — fire-and-forget. `onWindowResize`/`onFocusChanged`/`onProfilerState`/... to trzeci — main inicjuje wysyłkę, gdy coś się zdarzy (zmiana rozmiaru okna, focus, itp.).

## Jak to jest wystawione bezpiecznie

```ts
export const API = { WINDOW, DEBUG };
if (process.contextIsolated) {
  contextBridge.exposeInMainWorld("API", API);
}
```

`contextIsolation` (domyślne w nowym Electronie) oddziela świat JS strony (gdzie żyje cały kod gry, w tym biblioteki third-party) od świata preloadu — strona **nie ma** dostępu do `require`/`ipcRenderer` wprost, tylko do tego, co `contextBridge.exposeInMainWorld` świadomie wystawi jako `window.API`. Dlatego każda nowa możliwość komunikacji z systemem (plik, dialog, powiadomienie systemowe, cokolwiek spoza przeglądarki) **musi** przejść przez ten most — nie da się (i nie powinno się dać) obejść tego z poziomu `src/sandbox`/`src/core`.

Typowanie: `src/types/preload.d.ts` deklaruje `Window.API: typeof API` — import prosto z `preload.ts`, więc typy `window.API.*` w kodzie gry aktualizują się same, gdy dopiszesz coś do `preload.ts`; nie trzeba ręcznie duplikować sygnatur.

---

## Okna: gra vs profiler

| | Okno gry (`windows/game.ts`) | Okno profilera (`windows/profiler.ts`) |
|---|---|---|
| Tworzone | zawsze, przy starcie appki | tylko gdy `!app.isPackaged` (i tylko gdy w ogóle zbudowane — patrz `isDev` wyżej) |
| Ładowany plik | `index.html` → `src/sandbox/index.ts` | `index_profiler.html` → `src/profiler/index.tsx` |
| Devtools | zawsze otwarte (`mode: "detach"`) | tylko przy dev-serwerze |
| IPC specyficzne | `registerWindowEventsIPC()` (rozmiar/focus/fullscreen/refresh rate) | `registerDebugIPC()` (relay `debug:performance`/`debug:aurora` z gry do profilera) |

`loadRenderer()` (`windows/loader.ts`) to wspólna funkcja dla obu okien: w dev ładuje URL z Vite dev-servera, w buildzie — plik z dysku (`../renderer/<viteName>/<htmlFile>`).

---

## Warsztat: dodajemy nową funkcję — zapis mapy do pliku

Załóżmy, że gra chce umieć zapisać stan mapy (JSON) na dysk użytkownika. Renderer nie ma dostępu do `fs`, więc cała operacja musi przejść przez main. Cztery kroki:

### 1. Moduł IPC w main (`src/backend/IPC/mapFile.ts`)

```ts
import { ipcMain, dialog } from "electron";
import { writeFile } from "fs/promises";
import { gameWindow } from "../windows/game";

export function registerMapFileIPC() {
  ipcMain.handle("map:save", async (_, mapData: unknown) => {
    const { canceled, filePath } = await dialog.showSaveDialog(gameWindow, {
      title: "Zapisz mapę",
      defaultPath: "map.json",
      filters: [{ name: "Mapa JSON", extensions: ["json"] }],
    });
    if (canceled || !filePath) return { ok: false as const };

    await writeFile(filePath, JSON.stringify(mapData, null, 2), "utf-8");
    return { ok: true as const, filePath };
  });
}
```

`ipcMain.handle` (nie `.on`) — bo renderer chce dostać z powrotem wynik (czy zapisano, gdzie). Okno dialogowe i zapis pliku mogą się dziać tylko tu, w main.

### 2. Rejestracja w `src/backend/main.ts`

```ts
import { registerMapFileIPC } from "./IPC/mapFile";
// ...
app.on("ready", () => {
  createGameWindow();
  registerMapFileIPC(); // dostępne zawsze — nie tylko w dev, w przeciwieństwie do debug IPC
  if (!app.isPackaged) { /* ...profiler... */ }
});
```

### 3. Wystawienie w preloadzie (`src/preload/preload.ts`)

```ts
const MAP = {
  save: (data: unknown) =>
    ipcRenderer.invoke("map:save", data) as Promise<
      { ok: true; filePath: string } | { ok: false }
    >,
};

export const API = { WINDOW, DEBUG, MAP };
```

### 4. Użycie w kodzie gry

```ts
const result = await window.API.MAP.save({ tiles, width, height });
if (result.ok) {
  debug.log.success(`Mapa zapisana: ${result.filePath}`);
} else {
  debug.log.warn("Zapis anulowany");
}
```

Gotowe — `window.API.MAP.save(...)` jest w pełni otypowane (bez dodatkowej roboty, dzięki `typeof API` w `types/preload.d.ts`), a renderer w żadnym momencie nie dotyka `fs` ani `electron` bezpośrednio.

### Ten sam wzorzec do czegokolwiek innego

1. **Main**: nowy plik w `src/backend/IPC/` z `ipcMain.handle`/`ipcMain.on` — tu i tylko tu wolno używać Node/Electron API (pliki, dialogi, powiadomienia systemowe, itp.).
2. **`main.ts`**: zawołaj funkcję rejestrującą (raz, przy starcie) — pod `if (!app.isPackaged)`, jeśli funkcja ma być tylko na dev (jak debug/profiler), albo bezwarunkowo, jeśli ma działać też w wydanej grze.
3. **Preload**: dopisz metodę do odpowiedniego obiektu (albo nowy obiekt, jak `MAP` wyżej) w `preload.ts`, korzystając z `ipcRenderer.invoke`/`.send`/`.on` zależnie od potrzebnego wzorca (tabela wyżej) — i dodaj go do eksportowanego `API`.
4. **Kod gry**: wołaj `window.API.<Grupa>.<metoda>(...)` — typy przychodzą za darmo.

Jeśli funkcja ma wysyłać dane **z** main do rendererów **bez** proszenia (np. powiadomienie o czymś, co się zdarzyło w systemie), użyj `webContents.send("kanał", dane)` po stronie main i opakuj odbiór w preloadzie tym samym helperem `on(...)`, którego już używa `DEBUG`/`WINDOW` (`ipcRenderer.on` + zwrócenie funkcji odsubskrybowującej).
