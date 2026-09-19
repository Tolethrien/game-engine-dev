[zrobione]

# Cień boxa w GUI (`shadow`, zwykły i `inset`)

**Agent: worker mid.** Zależy od: nic. Po nim: `text-shadow.md` (korzysta z typu `DrawShadow`, ścieżki „cień pomija materiał” i przełącznika GUI).

Źródło: `todo.md` → URP TODO → „gui pass pelny czyli shadowbox na elementach innershadow...” oraz Draw → „Cień tekstu i kształtów” (część o kształtach).

## Cel

`DrawGui.rect/circle/sprite` dostają `shadow`, który działa jak `box-shadow` z CSS: kolor, przesunięcie, rozmycie, spread oraz wariant wewnętrzny (`inset`). Bez nowych pól instancji, bez nowego passa i bez przerywania batchy.

## Decyzje

### Tylko GUI

`shadow` nie trafia do wspólnego `DrawStyle`. Świat ma sortowanie i ścieżkę opaque. Cień by tam działał (transparent, ten sam punkt sortowania, stabilny sort trzyma go przed boxem), ale nie jest potrzebny, a nie chcemy utrzymywać tej kombinacji.

- `DrawApi` staje się generyczne po dodatkowych propsach: `DrawApi<Extra = {}>`, a metody przyjmują np. `DrawRect & Extra`. `Draw = new DrawApi<{}>(...)`, `DrawGui = new DrawApi<DrawGuiExtra>(..., { shadows: true })`, gdzie `DrawGuiExtra = { shadow?: DrawShadow | DrawShadow[] }`.
- W runtime `shadow` jest czytany tylko przy `shadows: true`. To opcja konstruktora, nie `if (dev)`, więc zgodne z zasadami.
- Odrzucone: podklasa `GuiDrawApi` nadpisująca każdą metodę. Duplikuje sygnatury, a text (plan 2) i tak potrzebuje wejścia do środka `drawRun`.

### Typ

```ts
interface DrawShadow { color: RGBA; offset?: Position2D; blur?: number; spread?: number; inset?: boolean }
```

Semantyka jak w CSS: `blur` = 2σ gaussa, `spread` powiększa albo pomniejsza kształt cienia (ujemny dozwolony), a promienie rogów rosną i maleją razem ze spreadem (clamp do 0). Przy liście **pierwszy cień jest na wierzchu**, jak w CSS, więc rysujemy je od końca.

### Cień = osobna instancja z nowym kształtem

Nowe kształty `SHAPE_SHADOW` i `SHAPE_INNER_SHADOW` dopisujemy **na końcu** `SHAPE` (`draw.ts` i `draw.wgsl` razem). Dzięki temu `isOpaque` (`shape < SHAPE.GLYPH`) traktuje je jako transparent. W GUI i tak wszystko jest transparent, ale kolejność nie może tego zepsuć. Plan 2 dopisze za nimi kształty glifów, więc je zostawić wolne.

Kolejność wywołań w `rect/circle/sprite`:

```
cienie zewnętrzne (od końca listy) → box → cienie wewnętrzne (od końca listy)
```

### Pakowanie (bez nowych pól)

| pole | wartość dla cienia |
|---|---|
| `position/size/rotation/radius` | geometria **boxa**, ta sama co w boxie (po `writeCorners`) |
| `color` | kolor cienia |
| `outlineWidth` | `blur` |
| `params` | `offset.x, offset.y, spread, inset` (inset = szerokość outline boxa, tylko przy `inset: true`) |
| `uvRect/layer` | domyślne z `writeStyle`, nieużywane |

`params` są wolne, bo cień nie woła `material()`. Tekstury ani uvRect nie są potrzebne. Cień sprite'a to cień jego boxa (z `rounded`), nie alfy tekstury, jak w CSS.

`instance()` zapisuje kolor i clampuje outline dla kształtów `< GLYPH`. Dla cienia wystarczy wywołać go z kolorem cienia i bez outline, a potem nadpisać `outlineWidth` i `params` na zwróconym writerze. Można też wydzielić mały `writeShadow`, do decyzji przy implementacji. Box z alfą 0 (sam cień, np. pod obrazkiem rysowanym osobno) musi dalej rysować cienie, więc cienie nie mogą zależeć od tego, czy `instance()` boxa zwrócił `null`.

### Materiał i batch

Instancja cienia dostaje **ten sam `material` co box**, więc wpada w ten sam ciąg w `execute` i batch się nie łamie. Wyjątek: materiał z `blend: "additive"`. Pipeline tego materiału dodawałby cień, więc wtedy cień idzie na `DEFAULT_MATERIAL` (świadomy, rzadki break).

### Shader

**Vertex:** dla `SHAPE_SHADOW` pad = `max(|offset.x|, |offset.y|) + max(spread, 0) + 1.5 * blur + 1` zamiast samego teksela. `SHAPE_INNER_SHADOW` ma zwykły pad, bo jest przycięty do boxa. `local` i `halfSize` dalej liczone od boxa, więc `dist` z `roundedBox` jest odległością od boxa także poza nim.

**Fragment:** gałąź cienia **po** wszystkich `fwidth` (`aa` z `dist` już jest), **przed** `material()`, z `return`.

- Rozmyty rounded rect: analitycznie, wzór Evana Wallace'a (https://madebyevan.com/shaders/fast-rounded-rectangle-shadows/). Splot gaussa z prostokątem liczy się dokładnie przez `erf` w jednej osi i ~4 próbkami w drugiej. Odrzucone: `smoothstep` po SDF. Przy blurze większym niż box daje zbyt pełny, ciemny środek, a w UI to częsty przypadek (mały przycisk, duży miękki cień).
  - Wzór ma jeden promień rogu. Nasze rogi są per narożnik, więc bierzemy promień narożnika ćwiartki, w której leży punkt (jak `select` w `roundedBox`). Przy różnych promieniach to przybliżenie, wystarczy.
  - σ = `max(blur / 2, ~0.5)`, żeby `blur: 0` nie dzieliło przez zero i dawało zwykłą twardą krawędź z AA.
- **Zewnętrzny:** kształt cienia = box przesunięty o offset, powiększony o spread. Pokrycie × `(1 − shape)`, gdzie `shape` to pokrycie boxa, które fragment już liczy. **Zawsze przycięty pod boxem**, jak w CSS. Półprzezroczyste panele (szkło, ramki) inaczej pokazywałyby cień przez siebie, a przy nieprzezroczystych przycięcie niczego nie zmienia. Bez opcji wyłączenia.
- **Wewnętrzny:** maska = box pomniejszony o `inset`, czyli `clamp(0.5 - (dist + inset) / aa)`, wystarczy przesunięcie SDF. Pokrycie = maska × `(1 − rozmyty box)`, gdzie rozmyty box to box pomniejszony o `inset`, przesunięty o offset i pomniejszony o spread (promienie też − inset − spread). Cień leży pod outline boxa, nie na nim, jak `inset` w CSS (padding box).
- Wynik: `in.color * coverage` (kolor jest już premultiplied z vertexa).

**Uniformity:** `return` w gałęzi zależnej od kształtu sprawia, że `fwidth`/`dpdx` wywołane w `material()` są dla WGSL w niejednolitym przepływie sterowania, a to błąd kompilacji. Dziś żaden materiał ich nie używa, ale użytkownika może. Dodać na górze `draw.wgsl` `diagnostic(off, derivative_uniformity);` z krótkim komentarzem: kształt jest stały na prymityw, więc piksele jednego quada 2×2 idą tą samą gałęzią.

## Kroki

1. `urp/draw.ts`: `DrawShadow`, `DrawGuiExtra`, generyczne `DrawApi<Extra>`, opcja `shadows`, `SHAPE.SHADOW/INNER_SHADOW`, zapis cieni w `rect/circle/sprite`, zamiana materiału additive na default.
2. `urp/shaders/draw.wgsl`: stałe kształtów, `diagnostic`, pad w vertexie, funkcje rozmytego boxa, gałąź cienia w fragmencie.
3. Sandbox (`src/sandbox/index.ts` albo `src/sandbox/tests/`): panel z cieniem zewnętrznym, wewnętrznym (z outline, żeby było widać, że leży pod nim), duży blur na małym przycisku, półprzezroczysty panel (przycięcie), ujemny spread, lista kilku cieni, przycisk z własnym materiałem (licznik draw calli bez zmian).
4. Dokumentacja: `plans/CLAUDE.md` (URP: kształty, `DrawGui` + `shadow`, pakowanie cienia) i `todo.md`: z „gui pass pelny...” usunąć shadowbox/innershadow, z „Cień tekstu i kształtów” usunąć część o kształtach (tekst robi `text-shadow.md`).

## Czego nie robimy

- Cienia w `Draw` (świat).
- Cienia dla `ellipse`, `line`, `quad`. Wzór jest dla rounded boxa. `circle` działa, bo to box z pełnym promieniem.
- Cienia z alfy tekstury sprite'a, blura tła („frosted glass”) i dużej poświaty całego poddrzewa GUI. Te wymagają osobnego passa (dopisać do `todo.md` jako „efekty warstwy GUI: drop-shadow/glow poddrzewa, blur tła”).
- Tekstu, który jest w `text-shadow.md`.
