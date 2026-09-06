# DEBUGGER — dokumentacja dla użytkownika

**DEBUGGER** to warstwa logowania i telemetrii silnika: kolorowany logger, licznik wydajności (FPS/1% low) i raportowanie danych GPU z Aurory. Cała trójka komunikuje się z osobnym oknem **profilera** (Electron + Solid.js) w trybie deweloperskim — i **znika całkowicie** (no-opy + brak okna) w buildzie produkcyjnym.

- **`debug`** — pojedynczy obiekt importowany zawsze spod aliasu `@debug`, z trzema modułami: `debug.log`, `debug.performance`, `debug.aurora`.
- **Eliminacja na prodzie** — dzieje się na dwóch poziomach: alias `@debug` w Vite podmienia całą implementację na no-opy przy buildzie produkcyjnym, a samo okno profilera (i IPC pod nim) w ogóle nie powstaje w spakowanej aplikacji Electrona.
- **Profiler** — osobne okno z panelami (Aurora, Cello, Performance), zasilane danymi wysyłanymi przez moduły dev przez IPC.

---

## Szybki start

```ts
import { debug } from "@debug";

debug.log.log("some data");
debug.log.success("zapisano!");
debug.log.warn("mało HP");
debug.log.error(err);
debug.log.notify("odblokowano osiągnięcie");
```

Nic nie trzeba inicjalizować ręcznie — sam import `@debug` (w trybie dev) uruchamia moduł: łączy się ze stanem profilera i wystawia `window.openProfiler()` do otwarcia okna profilera na żądanie. `debug.performance`/`debug.aurora` są już wołane przez `Engine`/`Aurora` co klatkę (patrz [engine.md](./engine.md)) — nie musisz ich sam odpalać.

---

## `debug.log`

Pięć poziomów, każdy: koloruje wpis w konsoli **i** trzyma historię w pamięci (osobno per poziom):

```ts
debug.log.log(data);
debug.log.success(data);
debug.log.error(data);
debug.log.warn(data);
debug.log.notify(data);
```

> Na prodzie realnie istnieje **tylko** `debug.log.log` (jako no-op) — patrz sekcja deweloperska niżej, to jest miejsce, gdzie łatwo o crash w spakowanej aplikacji.

---

## `debug.performance`

```ts
debug.performance.endFrame(frameTimeMs); // wołane przez Engine co klatkę
debug.performance.get1PercentLow(windowMs?); // 1% low z ostatnich (domyślnie) 30s
```

Zbiera 30-sekundowe rolling window próbek klatek, raz na sekundę wysyła migawkę (`fps`, `cpuTimeMs`, `onePercentLow`) do okna profilera.

---

## `debug.aurora`

```ts
debug.aurora.reportGPUData(snapshot); // wołane przez Engine co klatkę
```

Wysyła dane GPU/renderu do profilera — raz na sekundę i **tylko gdy okno profilera jest otwarte** (`profilerState.isOpen`).

---

## Okno profilera

Osobne okno Electron (Solid.js), tworzone automatycznie przy starcie aplikacji **niespakowanej** (`!app.isPackaged`) albo ręcznie przez `window.openProfiler()`. Zawiera:

- stały panel `PerformancePanel` (zawsze na górze, poza listą przeciąganych paneli),
- listę paneli z `src/profiler/panels/registry.tsx` (dziś: `aurora`, `cello`) — przeciąganą/reorderowalną, kolejność zapisywana w `localStorage`,
- konsolę tekstową (na razie placeholder — wpisane komendy nie trafiają jeszcze do gry).

Przepływ danych: `debug.performance`/`debug.aurora` (w oknie gry) → `window.API.DEBUG.send*Snapshot` (preload) → proces główny Electrona przekazuje kanał (`registerDebugIPC`) → okno profilera nasłuchuje (`onPerformanceSnapshot`/`onAuroraSnapshot`).

---

## Jak to znika na prodzie — dwie warstwy

1. **Bundler**: alias `@debug` (w `configs/vite.renderer.config.mts`) wskazuje na `debug.prod.ts` zamiast `debug.ts`, gdy `mode === "production"` — cała implementacja (historia logów, liczenie 1% low, wysyłka do IPC) znika, zostają puste funkcje.
2. **Proces główny**: tworzenie okna profilera i rejestracja jego kanałów IPC (`registerDebugIPC`, handler `openProfiler`) dzieje się tylko, gdy `!app.isPackaged` (`src/backend/main.ts`) — w spakowanej aplikacji nie ma nawet z czym rozmawiać, gdyby coś jednak spróbowało.

---

## Ściąga (cheat sheet)

```ts
import { debug } from "@debug";

debug.log.log("startup ok");
debug.log.error(someError);

window.openProfiler?.(); // otwiera okno profilera (dev only)
```

---

# DEBUGGER — notatki developerskie (jak to działa od środka)

Pliki:

| Plik | Rola |
|------|------|
| [`debug.ts`](../src/core/debugger/debug.ts) | Implementacja deweloperska — `class Debug`, side-effecty przy imporcie |
| [`debug.prod.ts`](../src/core/debugger/debug.prod.ts) | Implementacja produkcyjna — płaski obiekt no-opów |
| [`interfaces.d.ts`](../src/core/debugger/interfaces.d.ts) | Kontrakt (`ILogger`, `IPerformanceModule`, `IAuroraModule`, `IDebug`), który **powinny** spełniać obie strony |
| [`profilerState.ts`](../src/core/debugger/profilerState.ts) | Śledzi, czy okno profilera jest aktualnie otwarte |
| [`modules/log.ts`](../src/core/debugger/modules/log.ts) | `DevLogger` (real) + `prodLogger` (no-op) |
| [`modules/performance.ts`](../src/core/debugger/modules/performance.ts) | `DevPerformance` (real) + `prodPerformance` (no-op) |
| [`modules/gpu.ts`](../src/core/debugger/modules/gpu.ts) | `AuroraDevModule` (real) + `prodAurora` (no-op) |

Wybór implementacji dzieje się **wyłącznie** przez alias `@debug` w Vite (patrz sekcja wyżej) — `debug.ts`/`debug.prod.ts` nie importują się nawzajem ani nie sprawdzają trybu w runtime.

## `Debug` — side-effecty przy imporcie

```ts
export class Debug {
  public performance = new DevPerformance();
  public aurora = new AuroraDevModule();
  public log = new DevLogger();
  constructor() {
    profilerState.connect();
    console.log("Dev debug active");
    window.openProfiler = () => { window.API.DEBUG.openProfiler(); ... };
  }
}
export const debug = new Debug();
```

`new Debug()` woła się **raz, przy pierwszym imporcie** modułu (na poziomie pliku) — więc `profilerState.connect()` i przypięcie `window.openProfiler` dzieją się natychmiast, zanim cokolwiek innego w aplikacji zdąży wystartować, o ile tylko coś zaimportuje `@debug` wystarczająco wcześnie (co i tak dzieje się w `engine.ts`).

## Niespójność typów dev/prod dla `debug.log` — realne ryzyko crasha na prodzie

`ILogger` w `interfaces.d.ts` deklaruje **tylko** `log`:

```ts
export interface ILogger {
  log: (data: unknown) => void;
}
```

ale `DevLogger` (dev) implementuje pięć metod (`log`/`success`/`error`/`warn`/`notify`), a `prodLogger` (prod) implementuje **tylko** `log`:

```ts
export const prodLogger: ILogger = { log: () => {} };
```

Kod w `src/sandbox/index.ts` swobodnie woła `debug.log.success(...)`, `.error(...)`, `.warn(...)`, `.notify(...)`. To **kompiluje się bez błędu**, bo `tsconfig.json` mapuje alias `@debug` **na sztywno** na `./src/core/debugger/debug.ts` (czyli zawsze na wersję deweloperską, z pełnym `DevLogger`) — `tsc` nigdy nie widzi węższego kształtu `debug.prod.ts`. Realny wybór modułu (`debug.ts` vs `debug.prod.ts`) dzieje się dopiero w Vite, poza zasięgiem sprawdzania typów.

**Efekt**: w spakowanej aplikacji (`pnpm make`) wywołanie `debug.log.success(...)`/`.error(...)`/`.warn(...)`/`.notify(...)` rzuci w runtime `TypeError: debug.log.success is not a function` — bo `prodLogger` naprawdę nie ma tej metody. Dopóki to nie zostanie poprawione (dopisanie brakujących metod-no-opów do `prodLogger` **i** do `ILogger`, albo trzymanie się wyłącznie `debug.log.log(...)` w kodzie gry), każde użycie poziomu innego niż `.log` jest cichą miną na build produkcyjny.

## Inne rzeczy warte uwagi

1. **Niespójne bramkowanie przez stan profilera.** `AuroraDevModule.reportGPUData` wysyła tylko, gdy `profilerState.isOpen` — `DevPerformance.endFrame` wysyła swoją migawkę **bezwarunkowo**, raz na sekundę, niezależnie od tego, czy profiler jest w ogóle otwarty. Niegroźne (to i tak tylko dev), ale niespójne między dwoma modułami robiącymi analogiczną rzecz.
2. **Zabłąkany `console.log("sram")`** w `AuroraDevModule.reportGPUData` — wygląda na pozostawiony log z testów, odpala się przy każdej wysłanej migawce GPU (raz na sekundę, gdy profiler otwarty).
3. **Auto-otwieranie profilera jest powiązane z `!app.isPackaged`, nie z osobną flagą.** To rozsądny domyślny wybór, ale warto pamiętać, że "spakowane" i "chcę widzieć profiler" to formalnie dwa różne pojęcia, które tu są utożsamione na sztywno w `src/backend/main.ts`.
4. **Konsola profilera to placeholder.** `runCommand` w `src/profiler/index.tsx` tylko odbija wpisany tekst z powrotem do logu — komendy nie trafiają jeszcze do gry.
5. **Panel Cello (`src/profiler/panels/cello.tsx`) jest statyczny (`live={false}`)** — sam panel istnieje, ale debug audio (widoczne w `todo.md` jako osobny punkt) jeszcze nie jest podłączony.
6. **`PerformancePanel` nie jest częścią rejestru `PANELS`.** Jest importowany i renderowany wprost w `src/profiler/index.tsx`, więc zawsze siedzi na górze, poza przeciąganą/reorderowalną listą pozostałych paneli.
7. **`todo.md` w tym folderze to obszerna lista planowanych modułów** (perf-graf per system/faza, GC spikes, kategoryzowany logger, podgląd tekstur/błędów GPU, inspektor Dogma/Pragma, live inspektor scen/aktorów, generyczny "probe/watch" na dowolną wartość, debug inputu, log sesji, komendy konsoli profilera, tracker assetów, debug Cello/Navi/tweenów, snapshoty/dumpy, I/O dysku, nagrywanie) — żaden z tych modułów jeszcze nie istnieje; dzisiejszy realny zakres to `log`/`performance`/`aurora`.

## Jak rozszerzać

**Nowy moduł debug:** dodaj interfejs `IXModule` w `interfaces.d.ts`, klasę `DevXModule` (prawdziwa logika) w `modules/x.ts` **oraz** `prodX` (no-op) implementujące **dokładnie ten sam** interfejs — nie szerszy, żeby uniknąć pułapki z punktu "Niespójność typów" wyżej. Dopisz instancję do `Debug` (`debug.ts`) i do obiektu w `debug.prod.ts`.

**Nowy panel profilera:** komponent `Component<PanelProps>` w `src/profiler/panels/`, zarejestrowany w `PANELS` (`registry.tsx`) — trafia automatycznie do przeciąganej listy z zapamiętywaną kolejnością.

**Nowy kanał danych silnik → profiler:** wyślij z modułu dev przez `window.API.DEBUG.sendXSnapshot(...)`, dopisz nazwę kanału do `DEBUG_CHANNELS` w `src/backend/IPC/debug.ts` (żeby proces główny go przekazał), i dodaj odpowiadające `onXSnapshot` w `preload.ts` do odczytu po stronie profilera.
