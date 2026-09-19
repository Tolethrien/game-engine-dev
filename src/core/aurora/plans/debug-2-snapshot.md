[zrobione]

# Debugger 2: nowe dane Aurory dla profilera (kolektor, liczniki, zasoby, błędy)

**Agent: worker senior.** Zależy od: `debug-1-gpu-timer.md`. Następne: `debug-3-profiler-panel.md` (UI na tych danych).

Źródło: `todo.md` → Debugger (profilowanie, błędy GPU w panelu).

## Zasada nadrzędna

Poza GPU Time (plan 1) nic nie jest liczone samo z siebie. Wszystko inne liczy debugger, **pobierając** dane przez kolektor, i tylko gdy profiler jest otwarty. Na produkcji funkcje udostępniające dane mogą zostać w kodzie Aurory (gettery, `counters()`), ale nic ich nie woła, bo `prodAurora` ma puste `connect`/`endFrame`. Żadnych `if (dev)`.

## `AuroraSnapshot` od nowa

Stary typ (w `src/types/preload.d.ts`) był robiony pod starą Aurorę, więc piszemy go od zera. Kierunek (nazwy do dopracowania, grupować w obiekty zamiast płaskiej listy):

- `gpu`: `time`, `timeMax` (średnia i maksimum z okna raportu, ms), `passes: {name, time, max}[]` (suma kroków każdego passa grafu, w kolejności wykonania; clear passy i kroki `MultiPass` doliczone do właściciela), `steps: {owner, label, time}[]` (średnie per label, **wysyłane, ale nie wyświetlane**).
- `calls`: `draw`, `compute`. `passes`: `render`, `compute`, `clear`. `geometry`: `instances`, `vertices`, `triangles`. Liczone jak dziś przez `watchRender`/`watchCompute`/`watchClear` (tylko przy otwartym profilerze), wysyłana ostatnia klatka.
- `counters: Record<passName, Record<string, number>>`.
- `resources`:
  - `activePasses: string[]` (przeniesione tutaj z osobnej sekcji),
  - `textures: {name, kind: "graph"|"temp"|"asset", format, width, height, mips, layers, createdBy, usedBy: string[]}[]`: tekstury użyte w bieżącej klatce, po nazwach z grafu,
  - `pool: {total}`: liczba tekstur w `ResourcePool`.
- `errors: {type: "gpu"|"lost"|"shader", message, count}[]`: **wysyłane, na razie niewyświetlane** (poczekają na konsolę profilera).

Stare pola `CPUTime`, `GPUSpan`, `textures: number`, `pipelineInUse`, `totalCalls` znikają. Czy `total` liczyć w UI, decyduje plan 3.

## Przepływ

- `debug.aurora.connect(source)` zostaje. `source` zwraca **tanie referencje** (bez kopiowania): `GpuTimer.getSteps`, `GpuTimer.getTime`, aktywne passy grafu (obiekty `Pass`, bez `map`). Cięższe rzeczy (opis zasobów) jako funkcja w danych, wołana tylko w chwili raportu.
- `AuroraDevModule.endFrame()`: przy otwartym profilerze co klatkę pobiera `getSteps`. Jeśli `frame` jest nowy, dodaje czasy do akumulatorów per owner i per label (suma, liczba próbek, max). Przy raporcie (co `REPORT_INTERVAL_MS`) liczy średnie, buduje snapshot i zeruje akumulatory. Mapy akumulatorów reużywane, bez alokacji per klatka.
- Przy zamkniętym profilerze dev module nie robi nic poza sprawdzeniem `profilerState.isOpen`.

## Liczniki passów

- `Pass` dostaje opcjonalną metodę `counters?(): Record<string, number>`.
- Debugger woła ją przy raporcie na aktywnych passach i zapisuje pod `pass.name`.
- `connectCounters`/`disconnectCounters` usunąć z `IAuroraModule`, `AuroraDevModule`, `prodAurora` i `DrawPass` (`setup`/`destroy`). Pole ze strzałką w `DrawPass` zamienić na zwykłą metodę `counters()`; `DrawPass` przestaje importować cokolwiek do liczników.

## Zasoby klatki

- `RenderGraph` udostępnia metodę opisującą zasoby **bieżącej klatki** (wołaną tylko przez debugger przy raporcie).
- Wszystko da się wyprowadzić z deklaracji aktywnych passów (`this.resources` + `activePasses`), bez zapisywania czegokolwiek w `execute`:
  - `create` → wpis `graph` z `createdBy`,
  - `write`/`read`/`modify` → dopisanie do `usedBy`,
  - `temps` → wpis `temp` z nazwą `pass:temp`,
  - `readAsset` → wpis `asset` (rozmiar i warstwy z `AssetManager`, wystarczy to, co już jest w `AtlasPage` / widokach).
- Rozmiar tekstur grafu liczyć przez `ResourcePool`: upublicznić rozwiązywanie rozmiaru z deskryptora (dziś prywatne `resolveSize`).
- `ResourcePool.getTextureCount` → `pool.total`.
- Fizyczne aliasowanie tekstur z puli (która nazwa dostała który `GPUTexture`) **pomijamy**: wymagałoby zapisu w każdej klatce.

## Błędy

- `watchDevice` / `watchShader` zapisują do jednej mapy błędów (klucz: typ + komunikat, wartość: licznik).
- Konsola zostaje jak dziś (raz na komunikat).
- Błędy kompilacji shaderów: komunikat z labelem i linią, jak dziś w konsoli.
- `device.lost` (poza `destroyed`) jako typ `lost`.
- Wszystko trafia do `errors` w snapshocie.

## Pliki

- `src/types/preload.d.ts`: nowy `AuroraSnapshot` (typy pól do UI w planie 3).
- `src/core/debugger/interfaces.d.ts`: nowy `AuroraDebugData` (typy `Pass` importować tylko jako `import type`), `IAuroraModule` bez `connectCounters`/`disconnectCounters`.
- `src/core/debugger/modules/gpu.ts`: akumulacja, raport, błędy, `prodAurora`.
- `src/core/aurora2/core.ts`: nowe `connect`.
- `src/core/aurora2/pass.ts`: `counters?()`.
- `src/core/aurora2/renderGraph.ts`: getter aktywnych passów (bez `map`), opis zasobów.
- `src/core/aurora2/resourcePool.ts`: publiczny rozmiar z deskryptora.
- `src/core/aurora2/urp/passes/draw.ts`: `counters()` jako metoda.
- `src/profiler/panels/aurora.tsx`, `performance.tsx`: **tylko tyle, żeby się kompilowało** (np. tymczasowo odwołania do nowych pól). Właściwy UI robi plan 3.
- Dokumentacja: `docs/debugger.md`, sekcja „Debug / profilowanie” w `aurora2/plans/CLAUDE.md`, a w `todo.md` odhaczyć punkt o profilowaniu i o błędach GPU w panelu.

## Czego nie robimy

- Wyświetlania błędów ani kroków w profilerze.
- Kanału profiler → gra.
- Podglądu tekstur (plan 4).
