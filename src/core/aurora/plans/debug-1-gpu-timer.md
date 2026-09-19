[zrobione]

# Debugger 1: `GpuTimer` — czas każdego kroku, GPU Time bez czekania

**Agent: worker mid.** Zależy od: nic. Następne: `debug-2-snapshot.md`.

Źródło: `todo.md` → Debugger → „Przemyśleć, gdzie leży i jak działa całe profilowanie Aurory”.

## Problem

- Przy zamkniętym profilerze timer mierzy od początku pierwszego passa do końca ostatniego (`writesBegin`/`writesEnd`) i wpisuje to samo do `time` i `span`. GPU Time zawiera więc czekanie między passami, a `FPSOverlay` pokazuje ten czas.
- Otwarcie profilera przełącza tryb na per pass (`setPerPass`), więc wartość skacze zależnie od tego, czy profiler jest otwarty.
- Jeden slot na pass: `MultiPass` i clear passy piszą początek w pierwszym kroku, a koniec w ostatnim, więc przerwy między krokami wchodzą do czasu passa.
- Na zewnątrz wychodzi pojedynczy, przypadkowy odczyt (readback jest async i pomija klatki).

## Decyzje

- **Jeden tryb, zawsze.** Każde otwarcie passa na GPU (render, compute, każdy clear, każdy krok `MultiPass` przez `ctx.beginRender`/`beginCompute`) dostaje własną parę timestampów begin/end. Tryb całej klatki, `perPass`, `setPerPass`, `span`, `getSpan`, `Aurora.getGpuSpan` usuwamy.
- **GPU Time = suma czasów wszystkich kroków** (bez przerw między nimi). To jedyna rzecz liczona zawsze, także na produkcji. `GpuTimer` zostaje więc w Aurorze.
- **`timestamp-query` zostaje wymagany zawsze** (`core.ts` bez zmian w tej kwestii).
- **Średnia:** `getTime` zwraca średnią z odczytów z ostatniego okna czasu (ok. 1000 ms, stała w obiekcie konfiguracyjnym timera). Bufor pierścieniowy, bez alokacji. Z tego korzysta `FPSOverlay` (`engine.ts` bez zmian, tylko wartość jest teraz średnią).
- **Kroki zapisane pod maską:** każdy krok ma `owner` (nazwa passa z grafu, ustawiana w `beginPass`) i `label` (label GPU passa, np. `bloom:down0`, `draw:clear:scene`). Timer nie agreguje po passach, bo to robi debugger (plan 2) tylko przy otwartym profilerze. Timer udostępnia surowe dane ostatniego odczytanego frame'a przez getter, np. `getSteps` → `{ frame, count, owners, labels, times }` (tablice reużywane, `frame` rosnący numer, żeby debugger nie liczył tej samej klatki dwa razy).
- Klatka, w której zabrakło slotów (więcej kroków niż `capacity`), nie trafia do średniej. Pojemność rośnie jak dziś (`lastSlotCount * 2`, gdy readbacki wolne).
- Bez alokacji per klatka: tablice `owners`/`labels` w każdym readbacku i w `steps` czyścić przez `length = 0` i `push`, nie `slice()`.

## API (kierunek, nazwy do dopasowania)

- `GpuTimer.beginPass(owner)`: ustawia bieżącego właściciela.
- `GpuTimer.stepWrites(label)`: nowy slot na każdy krok, zwraca `{querySet, beginningOfPassWriteIndex, endOfPassWriteIndex}` albo `undefined` przy braku miejsca. Wszystkie 6 wywołań (`pass.ts` ×2, `renderGraph.ts` ×4) przekazuje label, który i tak już budują dla `beginRenderPass`/`beginComputePass`.
- `resolve`/`read` jak dziś, ale zawsze resolve `slotCount * 2`.
- `getTime` (średnia), `getSteps` (ostatni odczyt).

## Sprawdzić przy wdrożeniu

- Chrome/Dawn domyślnie kwantyzuje timestampy (ok. 100 µs). Przy wielu krótkich krokach (clear passy) suma może być mocno zawyżona albo zaniżona. Sprawdzić w `src/backend/main.ts`, czy da się wyłączyć kwantyzację przełącznikiem Chromium (np. `app.commandLine.appendSwitch("disable-dawn-features", "timestamp_quantization")` przed `app.ready`). Jeśli działa, dodać; jeśli nie, zostawić krótką notkę w `todo.md` i nie kombinować dalej.
- Porównać GPU Time w sandboxie przed i po zmianie: nie powinien już skakać przy otwieraniu i zamykaniu profilera.

## Pliki

- `src/core/aurora2/timer.ts`: przepisanie.
- `src/core/aurora2/pass.ts`, `renderGraph.ts`: label do `stepWrites`.
- `src/core/aurora2/core.ts`: usunąć `getGpuSpan` i `onCollectingChange(... setPerPass)`. Wywołanie `debug.aurora.connect(...)` na razie tylko dostosować do nowych getterów (`gpuSpan`/`passTimes` wypadają). Pełna przebudowa danych jest w planie 2, więc na razie wystarczy, żeby się kompilowało; `passTimes` może chwilowo zwracać pustą tablicę.
- `src/core/debugger/interfaces.d.ts`, `modules/gpu.ts`: usunąć `onCollectingChange` z interfejsu i obu implementacji, jeśli nic poza timerem go nie używa.

## Czego nie robimy

- Agregacji po passach, nowego snapshotu i zmian w profilerze (plany 2 i 3).
- Przenoszenia timera do debuggera.
