[zrobione]

# Jawne sprawdzanie „czy kształt to glif” w `DrawApi`

**Agent: worker junior.** Zależy od: nic.

## Problem

`todo.md` → Draw: „`isOpaque` zależy od kolejności `SHAPE`”. W `urp/draw.ts` są dwa miejsca, które rozpoznają glify porównaniem `shape < SHAPE.GLYPH`:

- `isOpaque` — glify nigdy nie idą do opaque (wygładzane krawędzie, próg 0,5 by je poszarpał);
- `instance` → `maxOutline` — obrys kształtu jest ograniczony do połowy krótszego boku, obrys glifu nie (rośnie na zewnątrz, limituje go `writeGlyph`).

Oba zakładają, że glify są na końcu `SHAPE`. Nowy kształt nietekstowy dopisany na końcu (np. polygon) po cichu trafiłby zawsze do transparent i miałby nieograniczony obrys. Shader (`draw.wgsl`) tego problemu nie ma — tam każdy kształt jest sprawdzany przez `==`.

## Decyzja

Jedna jawna lista kształtów-glifów zamiast zależności od kolejności numerów:

- Obok `SHAPE` w `urp/draw.ts` dodać maskę bitową glifów, zbudowaną z nazwanych wpisów (`1 << SHAPE.GLYPH | 1 << SHAPE.GLYPH_OUTLINE | 1 << SHAPE.MTSDF | 1 << SHAPE.MTSDF_OUTLINE`) i funkcję `isGlyphShape(shape)` sprawdzającą bit.
- Oba miejsca (`isOpaque`, `maxOutline` w `instance`) używają `isGlyphShape`, żadnego `< SHAPE.GLYPH` w kodzie.

Dlaczego maska, a nie `Set`/tablica cech: `instance` to hot path (per instancja, per glif), maska to jedno przesunięcie i AND, bez alokacji i bez lookupu. Krótki komentarz przy masce, że dodanie nowego kształtu-glifu wymaga dopisania go tutaj (to jedyne miejsce do pilnowania, kolejność `SHAPE` przestaje mieć znaczenie).

Maska mieści 32 kształty — wystarczy na długo, nie assertujemy tego.

## Czego nie robimy

- Nie zmieniamy numerów `SHAPE` ani `SHAPE_*` w `draw.wgsl` (lustro zostaje bez zmian).
- Nie ruszamy logiki „glify zawsze transparent” (wyjątek dla fontów grid to osobny wpis w `todo.md`, zostaje).
- Nie przenosimy decyzji o glifie na wywołującego (np. flaga w argumentach `instance`) — więcej parametrów w hot path, a maska rozwiązuje problem w jednym miejscu.

## Pliki

- `src/core/aurora2/urp/draw.ts` — maska + `isGlyphShape`, dwa miejsca użycia.
- `src/core/aurora2/todo.md` — usunąć wpis „`isOpaque` zależy od kolejności `SHAPE`”.

## Sprawdzenie

`pnpm` typecheck; w sandboxie tekst (mask i mtsdf, z obrysem i bez) i kształty z obrysem wyglądają jak przed zmianą, kształty pełne dalej idą do opaque (licznik w profilerze).
