[zrobione]

# Debugger 3: panele profilera pod nowy `AuroraSnapshot`

**Agent: worker junior.** Zależy od: `debug-2-snapshot.md` (typ `AuroraSnapshot` w `src/types/preload.d.ts` musi już istnieć).

Samo UI w Solid. Żadnych zmian w Aurorze ani w debuggerze. Jeśli czegoś brakuje w snapshocie, zapytaj, zamiast dopisywać pola po stronie gry.

## `panels/performance.tsx`

- Slot `gpu`: GPU Time = `gpu.time` (średnia), obok GPU Max = `gpu.timeMax`. GPU Span usunąć.
- Tabela „Pipeline times” → „Pass times”: kolumny Pass / Avg / Max z `gpu.passes`, wartości `toFixed(3)` ms (zaokrąglanie po stronie UI, nie w grze).
- `gpu.steps` nie wyświetlać.

## `panels/aurora.tsx`

- Sekcje Calls / Passes / Geometry na nowych grupach pól. Total calls liczyć w UI (`draw + compute`).
- Counters bez zmian w wyglądzie, nowe źródło `counters`.
- **Resources** (przebudowa):
  - Stat „Pool textures” = `resources.pool.total`.
  - Tabela „Textures” z `resources.textures`, kolumny: Name, Kind, Format, Size (`w×h`), Mips/Layers (tylko gdy > 1, inaczej puste), Created by, Used by (nazwy po przecinku).
  - Tabela „Active passes” z `resources.activePasses` (przeniesiona z osobnej sekcji „Passes in use”, która znika).
- `errors` nie wyświetlać.
- Istniejące komponenty: `components/table.tsx`, `stat.tsx`, `panel.tsx` (`Slot`, `SlotGroup`, `Section`). Tabele jako `Slot pinnable={false}` jak dotychczasowa „Passes in use”. Id slotów zmienionych pól zaktualizować, a `defaultPinned` ma wskazywać istniejące id.

## Sprawdzenie

Uruchomić sandbox, otworzyć profiler (`window.openProfiler()`):
- GPU Time jest stabilny,
- tabela passów pokazuje `draw`, `gui`, `present`,
- tabela tekstur pokazuje co najmniej `offscreenCanvas`, `gui` i depth draw passa oraz assety.
