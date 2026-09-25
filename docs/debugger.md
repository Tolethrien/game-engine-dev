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
debug.aurora.connect(() => AuroraDebugData); // raz, w Aurora.init
debug.aurora.endFrame(); // wołane przez Aurora.endFrame co klatkę
debug.aurora.beginPass(pass); // RenderGraph.execute, przed każdym passem
debug.aurora.watchDevice / watchShader / watchPipeline / watchRender / watchCompute / watchClear
debug.aurora.poolAcquire(texture) / poolRelease(texture); // ResourcePool.acquire/release
```

Aurora niczego nie liczy sama (poza `GpuTimer`, który jest zawsze). Moduł dev (`modules/aurora/`) **pobiera** dane przez `connect` i liczy tylko przy otwartym profilerze (`profilerState.isOpen`); po zamknięciu czyści okna próbek.

- **Źródło** (`AuroraDebugData`): `steps` = `GpuTimer.getSteps` (`times`, `starts`, `span`, `busy`), `activePasses` = obiekty `Pass`, `textures()` = `RenderGraph.describeResources()` (na żądanie).
- **Bufor próbek** (`seriesBuffer.ts`): surowe wartości per klatka pod kluczami z `keys.ts` (`METRIC_KEYS`); gra niczego nie uśrednia.
- **Drzewo GPU** (`gpuTree.ts`): labele kroków dzielone po `:` (`GuiPass:backdrop:mip2` → `GuiPass` → `backdrop` → `mip2`); per węzeł i klatka suma czasów, span i liczba kroków. Węzeł nieobecny w klatce nie dostaje zera — obecność liczona osobno.
- **Timeline klatki** (`timeline.ts`, `GpuTimeline`): kopia kroków (`owner`, `label`, `start`, `time`) klatki o największym `span` od poprzedniego raportu (ostatnia klatka interwału prawie nigdy nie jest spike'iem); kroki bez poprawnych timestampów pomijane. Panel „GPU timeline” rysuje ją jako Gantt (tor = pass, kolor = czas względem mediany węzła z 5 s, tryby last / peak 5 s / freeze, zoom kółkiem, przesuwanie przeciąganiem, dwuklik = reset).
- **Encoder** (`encoderStats.ts`): `debug.aurora.beginPass(pass)` ustawia kategorię (`Pass.category`), owinięte encodery liczą `draws/instances/vertices/triangles/pipelines/steps` per kategoria i w `total`.
- **Statystyki passów**: opcjonalna `Pass.stats?()`, sumowana per kategoria jako `stat:<category>.<key>`.
- **Zdarzenia**: `uncapturederror` (`gpu`), `device.lost` poza `destroyed` (`lost`), błędy i ostrzeżenia kompilacji shaderów (`shader`) → lista `DebugEvent` z licznikiem i klatkami, zbierane zawsze, w konsoli raz na komunikat.
- **Szczyt puli**: `ResourcePool.acquire/release` wołają `debug.aurora.poolAcquire/poolRelease`; moduł zawsze liczy bajty w użyciu, przy zbieraniu wysyła szczyt z klatki (`pool.peak`).
- **Raport** (`AuroraReport`, co 250 ms, kanał `debug:aurora`): `series` (tablice wartości per klucz od poprzedniego raportu), co 1 s `state` (VRAM z `memory.ts`, pula `allocated/free`, tekstury grafu z `bytes`, adapter i `app.getGPUInfo`), `events` gdy się zmieniły (pierwszy raport po otwarciu: stan i wszystkie zdarzenia), `timeline` (najgorsza klatka interwału, `GpuTimelineFrame`).
- **Profiler**: `src/profiler/aurora/store.ts` (`auroraStore`: `values`, `stats` z 5 s, `keys`, `events`, `live`, `latestState`; historia 30 s, czyszczona przy reloadzie gry), statystyki w `stats.ts`.

Na prodzie `prodAurora` ma puste `connect`/`endFrame`, więc gettery Aurory zostają w kodzie, ale nikt ich nie woła.

---

## `debug.tweak` i `aurora.config()`

`debug.tweak.register(name, panel)` rejestruje panel (sekcje pól ze schemą + `get`/`set`) i komendę konsoli o tej samej nazwie; jej wywołanie otwiera w profilerze modal z suwakami i kontrolkami. Zmiany idą do gry na żywo (stosowane w `endFrame`), **Revert** wraca do stanu z chwili otwarcia, **Export** daje kod ze wszystkimi ustawieniami sekcji.

### Grupy paneli i okno ustawień

- `TweakPanel.group` łączy panele w grupę, `order` ustala kolejność stron. Panele z grupą otwierają się w szufladzie (`tweak/groupWindow.tsx`) zamiast bocznego modala: lewa kolumna = strony grupy, szerokość przeciągana lewą krawędzią (min ~420 px), przycisk pełnego okna, ✕ / Escape zamykają. Nadal jeden otwarty panel naraz — strona = otwarty panel.
- `command: false` — rejestracja bez komendy konsoli (panel otwiera kod).
- `debug.tweak.open(name)` otwiera panel (nieznana nazwa → ostrzeżenie), `debug.tweak.openGroup(group)` ostatnio otwartą stronę grupy albo pierwszą wg `order`. Na produkcji puste.
- Kontrolka `{ kind: "info" }`: tylko podgląd (tekst albo obiekt przez `formatLiteral`), pomijana w eksporcie, revercie i presetach.
- Eksport grupy (`Export all` / `Export all changed` w nagłówku okna): eksporty stron po `order`, oddzielone pustą linią, strony `exportable: false` pominięte; czyta `get()`, nie wymaga otwarcia stron.
- Input `TweakInput`: `open`, `openGroup`, `exportGroup`. Przycisk „⚙ Settings” w pasku layoutu zakładki Aurora (`TabDefinition.actions`) woła `openGroup("aurora")`; profiler pamięta ostatnią stronę grupy w `localStorage` (`tweak:group:<group>:page`).

### Sekcje-listy (`arg: "list"`)

Sekcja z tablicą elementów o polach zależnych od elementu (np. warstwy efektów): `TweakListSection` w `interfaces.d.ts`.

- Strona gry: `item.fields(value)` (pola jednego elementu), `item.create()` (nowy element dla „+ add”; `null` = nie ma czego dodać, przycisk wyłączony), `item.label?(value)` (nagłówek karty, bez niego `#i`), `get()` → tablica, `set(items)` dostaje **zawsze całą nową listę** (żadnych łatek na indeksach), `defaults?` (lista równa im jest pomijana w „Export changed”), `format?(items)` (cała linia eksportu, np. `ScreenEffect.get("rain")` zamiast obiektu; bez niego `call(formatLiteral(items))`).
- Do profilera idzie `TweakListSectionInfo`: `itemFields` (schema policzona per bieżący element), `itemLabels`, `addable`. Panel z listą przelicza schemę przy każdym pollu, niezależnie od `live`. Wartości sekcji = `{ items: [...] }`.
- `TweakInput`: `listSet` (index, key, value), `listReset` (wartość klucza z `item.create()`), `listAdd`, `listRemove`, `listMove` (from, to), `listReplace` (cała lista; używa go wczytanie presetu). Każda operacja w grze: `structuredClone(get())` → zmiana → `set(items)`; indeks spoza listy = nic. Operacje strukturalne wymuszają poll w tej samej klatce, żeby profiler dostał nową schemę.
- Kolejka inputów to segmenty: w segmencie zlewanie po `name/section/key` (`listSet` także po indeksie), operacja strukturalna (`add/remove/move/replace`) zamyka segment — nic za nią nie zlewa się z tym, co przed nią.
- Revert i presety działają na całej tablicy. Pola `info` w elementach nie są wycinane (gra dostaje w `set` to, co zwróciła z `get`).
- Profiler (`tweak/section.tsx`): nagłówek sekcji z licznikiem i „+ add”, elementy jako zwijane karty z ↑ ↓ ✕, pola tymi samymi `Control` co zwykłe sekcje; dwuklik w etykietę = `listReset`. Edytowane pole trzymane lokalnie po kluczu `section:index:key`. Zwinięcie kart w `localStorage` (`tweak:<panel>:<section>:<index>`). Dodanie/usunięcie/przesunięcie bez lokalnej zmiany — czeka na odpowiedź gry. Bez list zagnieżdżonych i przeciągania myszą.

`aurora.config()` (konsola; `aurora.config("mood")` otwiera wybraną stronę) otwiera okno ustawień Aurory (grupa `aurora`). Strony w kolejności `AURORA_PAGES` (`modules/aurora/pages.ts`): `mood`, `effects`, `settings` (Rendering: `renderRes`/`canvasColor`/`gamma` przez `Aurora.setParameter`, odroczone do `beginFrame`; Config: podgląd), `camera` (`Aurora.setCamera`, gra ustawiająca kamerę co klatkę nadpisze edycję), `texturePreview`, `urp`, `catalog`. Panele rejestrują się bez komend (`command: false`); sekcja pól może mieć `format` (cała linia eksportu).

Strona `effects` (`modules/aurora/effects.ts`) to trzy listy warstw `Post.setEffects`, po jednej na etap `world`/`hdr`/`screen`; parametry efektu jako pola `param:<nazwa>` (suwak z `ranges` efektu albo zwykła liczba), pola winiety tylko przy `mask: "vignette"`. Zmiana efektu w warstwie wraca do jego `defaults` (znacznik `paramsFor`). Eksport pomija wartości równe domyślnym, pusty etap w „Export all” daje `Post.setEffects("world", [])`. Strona `catalog` to podgląd zarejestrowanych `ScreenEffect` i `Material` (parametry, domyślne, zakresy); materiałów nie edytujemy. Obie rejestruje `debug.aurora.mood` razem z `mood`.

Strona `urp` (`modules/aurora/urp.ts`) edytuje start configu `URP.init` na żywo: jedna sekcja „Sort” (`sortMode`, `sortAnchor`, `step`, `zRange`; bloom, tone mapping i włączanie światła są na żywo w `mood`), eksport to jedna linia `URP.init({...})`. Każda zmiana to ponowne `URP.init` + rebuild grafu, z bieżącym stanem `toneMapping`/`bloom`/ambientu z `Post`/`Light` (nastrój się nie cofa; te wartości edytuje `mood`). Pola liczbowe mają `apply: "release"` — `TweakField.apply` (`live` domyślnie) wysyła wartość dopiero po puszczeniu suwaka / blurze liczby. `debug.aurora.mood(post, light, urp)` dostaje `UrpDebugData` (`get`/`apply`, rejestr efektów `effects`/`effect`) z `URP.init`. Strony `settings` i `camera` rejestruje `debug.aurora.connect(source)` (edytują przez `source().setParameter`/`setCamera`), bo moduły debuggera nie importują wartości z silnika.

Strona `mood` to pierwszy panel: tone mapping, AgX look, exposure, color, ambient, bloom, diffusion, blur, vignette, grain, chroma, radial blur, posterize. `URP.init` woła `debug.aurora.mood(postDraw, lightDraw)`, które go rejestruje. Wynik eksportu wklejamy **po** `URP.init` — init wpisuje bloom/tone mapping/exposure/look z configu i nadpisałby wcześniejsze wartości. Poza panelem: flash (warstwy `ScreenEffect` edytuje strona `effects`), światła punktowe.

Strona `texturePreview` to drugi panel: wybór tekstury (`off` / grafu / asset / `reserved/…`), warstwy lub plastra 3d i mipa dla `PreviewPass`. Stronę rejestruje `setup` passa, więc istnieje tylko gdy `PreviewPass` jest w presecie. Zamknięcie modalu nie wyłącza podglądu (`off` tak). Panel używa dwóch pól `TweakPanel`: `live` (`sections` jako getter, schema przeliczana przy pollu otwartego modalu i wysyłana ponownie jako `add`, liczba sekcji stała) oraz `exportable: false` i `presets: false` (modal chowa Export, Revert i pasek presetów).

---

## Okno profilera

Osobne okno Electron (Solid.js), tworzone automatycznie przy starcie aplikacji **niespakowanej** (`!app.isPackaged`) albo ręcznie przez `window.openProfiler()`. Zawiera:

- stały panel `PerformancePanel` (zawsze na górze, poza listą przeciąganych paneli),
- listę paneli z `src/profiler/panels/registry.tsx` (dziś: `aurora`, `cello`) — przeciąganą/reorderowalną, kolejność zapisywana w `localStorage`,
- konsolę tekstową (na razie placeholder — wpisane komendy nie trafiają jeszcze do gry).

Przepływ danych: `debug.performance`/`debug.aurora` (w oknie gry) → `window.API.DEBUG.sendPerformanceSnapshot`/`sendAuroraReport` (preload) → proces główny Electrona przekazuje kanał (`registerDebugIPC`) → okno profilera nasłuchuje (`onPerformanceSnapshot`/`onAuroraReport`).

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
| [`modules/aurora/aurora.ts`](../src/core/debugger/modules/aurora/aurora.ts) | `AuroraDevModule` (real) + `prodAurora` (no-op); obok `keys.ts`, `seriesBuffer.ts`, `gpuTree.ts`, `timeline.ts`, `encoderStats.ts`, `memory.ts` |

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

1. **Niespójne bramkowanie przez stan profilera.** `AuroraDevModule.endFrame` zbiera i wysyła tylko, gdy `profilerState.isOpen` — `DevPerformance.endFrame` wysyła swoją migawkę **bezwarunkowo**, raz na sekundę, niezależnie od tego, czy profiler jest w ogóle otwarty. Niegroźne (to i tak tylko dev), ale niespójne między dwoma modułami robiącymi analogiczną rzecz.
2. **Auto-otwieranie profilera jest powiązane z `!app.isPackaged`, nie z osobną flagą.** To rozsądny domyślny wybór, ale warto pamiętać, że "spakowane" i "chcę widzieć profiler" to formalnie dwa różne pojęcia, które tu są utożsamione na sztywno w `src/backend/main.ts`.
3. **Konsola profilera to placeholder.** `runCommand` w `src/profiler/index.tsx` tylko odbija wpisany tekst z powrotem do logu — komendy nie trafiają jeszcze do gry.
4. **Panel Cello (`src/profiler/panels/cello.tsx`) jest statyczny (`live={false}`)** — sam panel istnieje, ale debug audio (widoczne w `todo.md` jako osobny punkt) jeszcze nie jest podłączony.
5. **`PerformancePanel` nie jest częścią rejestru `PANELS`.** Jest importowany i renderowany wprost w `src/profiler/index.tsx`, więc zawsze siedzi na górze, poza przeciąganą/reorderowalną listą pozostałych paneli.
6. **`todo.md` w tym folderze to obszerna lista planowanych modułów** (perf-graf per system/faza, GC spikes, kategoryzowany logger, podgląd tekstur/błędów GPU, inspektor Dogma/Pragma, live inspektor scen/aktorów, generyczny "probe/watch" na dowolną wartość, debug inputu, log sesji, komendy konsoli profilera, tracker assetów, debug Cello/Navi/tweenów, snapshoty/dumpy, I/O dysku, nagrywanie) — żaden z tych modułów jeszcze nie istnieje; dzisiejszy realny zakres to `log`/`performance`/`aurora`.

## Jak rozszerzać

**Nowy moduł debug:** dodaj interfejs `IXModule` w `interfaces.d.ts`, klasę `DevXModule` (prawdziwa logika) w `modules/x.ts` **oraz** `prodX` (no-op) implementujące **dokładnie ten sam** interfejs — nie szerszy, żeby uniknąć pułapki z punktu "Niespójność typów" wyżej. Dopisz instancję do `Debug` (`debug.ts`) i do obiektu w `debug.prod.ts`.

**Nowy panel profilera:** komponent `Component<PanelProps>` w `src/profiler/panels/`, zarejestrowany w `PANELS` (`registry.tsx`) — trafia automatycznie do przeciąganej listy z zapamiętywaną kolejnością.

**Nowy kanał danych silnik → profiler:** wyślij z modułu dev przez `window.API.DEBUG.sendXSnapshot(...)`, dopisz nazwę kanału do `DEBUG_CHANNELS` w `src/backend/IPC/debug.ts` (żeby proces główny go przekazał), i dodaj odpowiadające `onXSnapshot` w `preload.ts` do odczytu po stronie profilera.
