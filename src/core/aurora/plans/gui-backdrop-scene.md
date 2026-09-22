# Backdrop GUI: automatyczna piramida sceny + bitmapa zajętości

**Agent: worker senior — w trybie prowadzącego** (kod pisze użytkownik, zasady jak w `urp-rewrite.md` → „Jak prowadzić”). Zależy od: `urp-rewrite.md` (robimy na nowym `GuiPass`/`GuiDraw`). Po nim: nic.

Źródło: `urp/todo.md` → „Backdrop blur — ustalony kierunek”.

## Cel

Panele ze szkłem leżące bezpośrednio nad grą nie przerywają kroku GUI. Czytają z jednej piramidy sceny budowanej raz na klatkę. Dzisiejszy mechanizm grup (przerwanie → zrzut gui-over-scene → piramida) zostaje tylko dla paneli, pod którymi jest już GUI. Semantyka („rozmywa wszystko pod spodem”) i API (`backdrop: { blur }`) bez zmian — pass sam wybiera ścieżkę, gdy wynik jest identyczny.

## Decyzje

### Wybór ścieżki

- Backdrop jest **sceniczny**, jeśli pod jego AABB + `BACKDROP.reach·σ` nie ma żadnego GUI narysowanego wcześniej w tej klatce. Wtedy „wszystko pod spodem” == `offscreenCanvas`.
- Decyzja zapada **na CPU w `GuiDraw` w momencie zapisu backdropu** (wtedy wiadomo, co narysowano wcześniej), a nie w `execute`. Wynik: kształt `GUI_SHAPE.BACKDROP_SCENE` albo `GUI_SHAPE.BACKDROP`.
- Różne σ nie mają znaczenia: piramida nie jest liczona pod σ, każdy panel próbkuje swój poziom (`backdropLevel`, bicubic między mipami).

### Bitmapa zajętości (`guiDraw.ts` albo mały moduł obok)

- Siatka komórek po 32×32 px canvasa (stała w obiekcie konfiguracyjnym, nie gołe consty), bitset w `Uint32Array`. Rozmiar przeliczany przy zmianie rozmiaru canvasa (`frame.canvasSize` znany z `Aurora`), bez alokacji w klatce.
- Dwie bitmapy:
  - `frame` — wszystko GUI od początku klatki; czyszczona w `beginFrame`. Pytanie: sceniczny czy nie.
  - `group` — GUI od zrzutu ostatniej grupy „pod spodem”; czyszczona przy otwarciu nowej grupy. Zastępuje dzisiejsze `drawnBounds` (suma AABB) w grupowaniu.
- Każda instancja GUI przy `emit` zaznacza komórki swojego AABB w obu bitmapach (AABB i tak jest już policzone do culla). Instancje odrzucone przez clip nie zaznaczają. Sam backdrop też zaznacza (jego tint box i tak zaraz tam będzie).
- Test = czy któraś komórka pod rozszerzonym AABB jest zajęta. Niedokładność tylko do rozmiaru komórki, zawsze w bezpieczną stronę (najwyżej wolna ścieżka).
- Hot path: pętle po komórkach inline na intach, bez obiektów (komentarz „dlaczego nie Axiom”).

### Grupowanie przenosi się na CPU w trakcie zapisu

- Dziś `groupBackdrops` w `execute` odtwarza AABB każdej instancji z bufora (`instanceBounds` — trzecia kopia geometrii). Skoro `GuiDraw` zna AABB przy zapisie, grupy budujemy od razu: backdrop „pod spodem” dołącza do otwartej grupy, jeśli bitmapa `group` jest pusta pod nim, w przeciwnym razie otwiera nową grupę (start = indeks instancji) i czyści `group`.
- `instanceBounds` i `scratchBounds` znikają. `GuiPass` dostaje gotową listę grup (start, region, top) przez metody wołane z `GuiDraw` (jak dziś `markBackdrop`).

### Piramida sceny

- Nowa tekstura `temp` w `GuiPass` (`backdropScene`, te same parametry co `backdrop`: pół canvasa, `rgba16float`, `BACKDROP.levels` mipów). Dwie tekstury, nie jedna: sceniczny panel narysowany po zrzucie grupy czytałby nadpisane dane.
- Budowana na początku `execute`, **przed pierwszym krokiem `draw`**, tylko gdy w klatce jest ≥1 sceniczny backdrop. Poziomy do `max(top)` scenicznych paneli, scissor do sumy ich regionów + margines (region i `top` zbierane w `GuiDraw` jak dla grupy).
- Mip 0 kopiuje/downsampluje **samo** `offscreenCanvas` — `backdrop.wgsl` dostaje wariant bez kompozycji z GUI (override albo osobny pipeline, np. `compose: false` + trzeci pipeline `sceneCopy`; do decyzji przy implementacji, bez zmiany rdzenia).
- Bind group 2 GUI: `0` clips, `1` backdrop, `2` backdropScene. Gdy którejś piramidy w klatce nie ma, bindujemy widok tej tekstury i tak (graf ją deklaruje) — shader jej wtedy nie czyta.

### Shader

- `GUI_SHAPE.BACKDROP_SCENE` → `backdropColor` z tekstury sceny, `GUI_SHAPE.BACKDROP` → z dzisiejszej. `backdropSample` bierze teksturę jako parametr (WGSL pozwala przekazać `texture_2d<f32>` do funkcji), jedna implementacja.
- `BACKDROP_SIGMA` / `backdropLevel` bez zmian.

## Kroki

1. Bitmapa zajętości (struktura, zaznaczanie, test) + wpięcie zaznaczania w `emit` GUI. Kontrola: debug-licznik zajętych komórek w `counters()`.
2. Grupowanie przy zapisie w `GuiDraw`, usunięcie `groupBackdrops`/`instanceBounds` z `GuiPass`. Kontrola: `guiBackdrop` wygląda jak przed, `backdrop groups` ≤ dotychczasowe.
3. `GUI_SHAPE.BACKDROP_SCENE` + decyzja scena/pod spodem w `GuiDraw`.
4. Tekstura i budowa piramidy sceny w `GuiPass`, wariant `backdrop.wgsl`, trzeci wpis bind groupy, shader.
5. Liczniki: `backdrop groups` (pod spodem) i `backdrop scene` (0/1 + liczba paneli).
6. Kontrola w sandboxie: test z panelami nad grą (oczekiwane 0 grup, 1 piramida sceny) i z modalem nad UI (1 grupa). Porównanie czasu GPU przed/po w profilerze (kroki `backdrop:mip*`).
7. Aktualizacja `plans/CLAUDE.md` (sekcja Backdrop) i `urp/todo.md` (backdrop zrealizowany, zostaje zanotowane ryzyko pełnoekranowego overlayu).

## Czego wprost nie robimy

- Żadnego pola `source` w API — decyzja zawsze automatyczna.
- Nie zmieniamy algorytmu blura (piramida 13-tap + bicubic zostaje), bez rozmycia separowalnego.
- Nie korzystamy z drzewa Navi.
- Pełnoekranowe GUI pod panelami (winieta, overlay) spycha je na wolną ścieżkę — świadomie bez obejścia, wrócić jeśli wyjdzie w praktyce.
