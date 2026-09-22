# Przepisanie draw URP: rozdział świat / GUI, nowe API

**Agent: worker senior — w trybie prowadzącego.** Kod pisze **użytkownik**, nie agent (patrz „Jak prowadzić”). Zależy od: nic. Po nim: `gui-backdrop-scene.md`.

Źródło: `urp/todo.md` → „Ustalenia do przepisania”. Ten plan realizuje punkty: rozdział świat/GUI, nowe API z jedną ścieżką zapisu, nazwane zapisy pól instancji, helper `materialClip`. **Nie** realizuje: chudego layoutu opaque (odrzucone), pomiaru draw calli (osobno), nowego backdropu (osobny plan — tu backdrop jest tylko przeniesiony 1:1).

## Jak prowadzić (instrukcja dla agenta)

Użytkownik chce zrozumieć, jak to działa, więc **sam pisze kod**. Rola agenta:

- Prowadzi **po jednym kroku** z listy niżej. Przed krokiem: krótko wyjaśnia co i po co (odsyłając do starego kodu jako referencji: `urp/drawApi.ts`, `urp/passes/draw.ts`, `urp/shaders/draw.wgsl`), podaje pliki, sygnatury i kształt danych. Nie wkleja gotowej implementacji całych plików. Na prośbę użytkownika może pokazać fragment, szkielet albo rozwiązać konkretny problem.
- Po każdym kroku robi review tego, co użytkownik napisał (poprawność, hot path bez alokacji, zgodność CPU↔WGSL, konwencje z `CLAUDE.md`), i dopiero potem idzie dalej.
- Na końcu każdego **etapu** jest punkt kontrolny w sandboxie. Nie przechodzić dalej, dopóki obraz nie zgadza się z zrzutami z etapu 0.
- Przy niejasności w planie pyta użytkownika, nie zgaduje.
- Stary kod jest **referencją do czytania**, nie do kopiowania całymi blokami. Kawałki, które są dobre i się nie zmieniają (np. `invBilinear`, `blurredBox`, sortowanie kluczem `Float64`), wolno przenieść — wtedy agent mówi wprost „to przenosimy bez zmian” i tłumaczy, co robi.

## Zasada przejścia: nowy folder `urp2`, na koniec podmiana nazwy

Piszemy od zera w **osobnym, nowym folderze `src/core/aurora/urp2/`**, sąsiadującym z `urp/`. `urp/` nie jest modyfikowany (poza jednym wyjątkiem niżej) — cały nowy kod, łącznie z materiałami, ląduje w `urp2/`. Przełączenie na czas przejścia odbywa się w dwóch miejscach naraz: slot passa w `urp.ts` i eksport w `urp/draw.ts` (te dwa pliki na razie zostają w `urp/` i importują z `urp2/`). Świat przełączamy przed GUI, więc przez etap 2 działa mieszanka: nowy świat (z `urp2/`) + stary GUI (z `urp/`).

W **etapie 4** cały stary `urp/` znika: `urp.ts` i `draw.ts` przenoszą się (już bez potrzeby importu z dwóch miejsc) do `urp2/`, folder `urp/` kasujemy w całości, a `urp2/` zmienia nazwę na `urp/` (`git mv`). Dlatego już teraz wszystko, czego nowy kod potrzebuje — łącznie z `shaders/materials/*.wgsl` — musi mieć swoją kopię/wersję docelową w `urp2/`, nie zostawać tylko w starym `urp/`.

Jedyna zmiana w starym kodzie przed etapem 4: `DEFAULT_MATERIAL` wyjeżdża do `urp2/defaultMaterial.ts` (krok 0.2), a stary `urp/drawApi.ts` zaczyna go stamtąd importować (import przez granicę folderów, tymczasowo) — bo `Material.create` assertuje unikalną nazwę i nowy kod nie może stworzyć go drugi raz.

## Docelowy układ plików (`src/core/aurora/urp2/`)

| plik | co |
|---|---|
| `defaultMaterial.ts` | `DEFAULT_MATERIAL` (wyjęte z `urp/drawApi.ts`, stary kod go stamtąd importuje do etapu 4) |
| `drawTypes.d.ts` | nowe typy publiczne; w etapie 4 zmienia nazwę na `urpTypes.d.ts` |
| `instance.ts` | pola instancji (wspólne + świat), `SHAPE`, `GUI_SHAPE`, `CLIP`, pack/unpack `materialClip`, nazwane zapisy pól |
| `drawCore.ts` | wspólna część API: clip stack + cull, jedna ścieżka zapisu, geometria boxa, tekst, `warnOnce` |
| `worldDraw.ts` | `WorldDraw extends DrawCore`: sort point, opaque |
| `guiDraw.ts` | `GuiDraw extends DrawCore`: shadow, backdrop, text shadow |
| `passes/clipBuffer.ts` | bufor clipów (wspólny dla obu passów) |
| `passes/world.ts` | `WorldPass` |
| `passes/gui.ts` | `GuiPass` (z backdropem przeniesionym 1:1) |
| `shaders/shapes.wgsl` | wspólny WGSL: bindy grup 0/1, `InstanceIn`, `VertexOut`, `MaterialInput`, geometria kształtów, clip, powierzchnia kształtu |
| `shaders/world.wgsl` | `vertexMain`/`fragmentMain` świata, kamera, sort depth, opaque |
| `shaders/gui.wgsl` | `vertexMain`/`fragmentMain` GUI, cienie, backdrop |
| `shaders/materials/*.wgsl` | fragmenty materiałów, **przeniesione 1:1** ze starego `urp/shaders/materials/` (krok 0.2), treść i kontrakt `MaterialInput` bez zmian |

Shader passa = `shapes.wgsl + world.wgsl` (albo `+ gui.wgsl`) sklejone stringiem, potem `// MATERIAL` → fragment materiału. WGSL pozwala wołać funkcje zadeklarowane później w module, więc `shapes.wgsl` może wołać np. `snapAnchor`, które każdy pass definiuje po swojemu.

## Decyzje

### Instancja

- **Dwa layouty, wspólna baza.** `INSTANCE_FIELDS` (baza, oba passy): `position, size, rotation, shapeData, outlineWidth, color, outlineColor, shape, uvRect, layer, params, materialClip` = 92 B. Świat: `{ ...INSTANCE_FIELDS, sortPoint }` = 104 B, `sortPoint` **ostatni**. GUI nie sortuje, więc `sortPoint` nie ma (−12 B na instancję GUI).
- Dzięki `sortPoint` na końcu lokacje 0–11 są identyczne w obu passach. `shapes.wgsl` deklaruje jeden `InstanceIn` (lokacje 0–11), a `vertexMain` świata dostaje `sortPoint` jako osobny parametr `@location(12)`. Nie ma dwóch struktur do synchronizacji.
- **`radius` → `shapeData`.** Pole ma trzy znaczenia (rogi / punkty C,D quada / pole glifu), więc dostaje neutralną nazwę i **nikt nie pisze go bezpośrednio**. Zapis tylko przez nazwane funkcje w `instance.ts`: `writeCorners(vert, rounded, maxRadius)`, `writeQuadPoints(vert, a, b, c, d)` (pisze też `position`/`size`), `writeGlyphField(vert, range, u, v, packedSize)`. W WGSL odpowiednio małe funkcje-akcesory (`quadPoints`, `glyphReach`, `glyphUvBlock`) zamiast gołego `in.shapeData.yz` w środku `shade`.
- Funkcje zapisu przyjmują writer bazowego layoutu. Writer świata ma te same metody plus `sortPoint`, więc strukturalnie pasuje (`VertexWriter` to zwykły obiekt z metodami).
- **`materialClip`**: bez zmiany podejścia (materiał dolne 16 bitów, clip górne 16). W `instance.ts` `packMaterialClip(material, clip)`, `materialOf(word)`; w `shapes.wgsl` `fn clipOf(word: u32) -> u32`. Nigdzie gołych `<< 16` / `& 0xffff`.
- **`SHAPE` rozdzielone**: `SHAPE` (wspólne: BOX, ELLIPSE, QUAD, GLYPH, GLYPH_OUTLINE, MTSDF, MTSDF_OUTLINE) i `GUI_SHAPE` (SHADOW, INNER_SHADOW, GLYPH_SHADOW, MTSDF_SHADOW, BACKDROP) z numerami nienachodzącymi na `SHAPE`. Świat nigdy nie zapisuje `GUI_SHAPE`, `world.wgsl` ich nie zna.

### Shadery

- `shapes.wgsl` niesie wszystko, co dziś jest wspólne: `Frame`/`Camera` + bindy grup 0 i 1, `inputColor`/`premultiply`/`textCoverage`, `roundedBox`, `ellipse`, `invBilinear`/`quadU`/`cross2`, `Clip` + `clipCoverage`, `MaterialInput`, `override linearColors`.
- **Wspólna geometria wierzchołka**: funkcja w `shapes.wgsl` budująca róg quada/boxa (dzisiejsze `if (shape == SHAPE_QUAD) … else …` z `vertexMain`) z parametrem `pad`. World podaje `1 / camera.zoom`, GUI `1` + zasięg cienia. Zamiana na piksele (`worldToPixel` / GUI: `floor(anchor + 0.5) + offset`) jest po stronie passa.
- **Wspólna powierzchnia kształtu**: funkcja w `shapes.wgsl` licząca to, co dziś jest na górze `shade()`: `uv01`, `local`, `dist`, próbkowanie tekstury/glifu, `glyphDist`, pokrycia. Zwraca strukturę (np. `Surface`). Z niej każdy pass składa `MaterialInput` i woła `material()`. GUI przed `material()` ma swoje gałęzie efektów (cień, backdrop, cień tekstu).
- Znikają override'y `screenSpace` (każdy pass wie, czym jest). World zostawia `depthSort`, `opaquePass`, `isoSort`. GUI nie ma żadnego poza `linearColors`.
- GUI `VertexOut`: bez zmian względem dzisiejszego (15/16 lokacji). Świat nie potrzebuje więcej.

### Passy

- **`WorldPass` = `RenderPass`, nie `MultiPass`.** Świat nie ma backdropu, więc nie musi sam otwierać kroków. Target i depth tworzone z `clearValue`/`depthClearValue` w `resources` (graf czyści w loadOp, bez osobnego passa). Znika sztuczka „pierwszy krok czyści”. Sprawdzić przy implementacji, że `RenderPass` dostaje depth z `res.create` tak jak oczekujemy — jeśli nie, zapytać przed zmianą rdzenia (rdzenia nie ruszamy).
- World przejmuje ze starego `DrawPass`: bufory opaque per materiał, bufor transparent + `sorted`, `sortKey`/`updateSort`/`sortTransparent`, `objectSortingRange`, pipeline'y opaque/transparent, licznik `sort depth used %`.
- **`GuiPass` = `MultiPass`** (backdrop przerywa kroki). Jeden bufor transparent, bez sortu, bez depth, bez opaque. Backdrop: `groupBackdrops`, `instanceBounds`, `blurBackdrop`, `backdrop.wgsl` przeniesione **1:1** (poprawki w `gui-backdrop-scene.md`).
- Wspólne dla obu: `ClipBuffer` (dzisiejsze `pushClip`/`resetClips` + `GrowingBuffer` clipów) i rysowanie ciągów tego samego materiału (`drawTransparent` — funkcja w `passes/clipBuffer.ts` albo osobnym małym module, do decyzji przy implementacji).
- Grupa 2: świat `0` SortParams, `1` clips. GUI `0` clips, `1` backdrop. Nie trzymamy już placeholdera 1×1 w świecie.

### API

- **`DrawCore` (abstrakcyjna klasa bazowa)**, `WorldDraw`/`GuiDraw` ją rozszerzają. Bez generyka `Extra`, bez rzutowań na typy GUI.
- **Jedna ścieżka zapisu** — kroki, przez które przechodzi każdy kształt (box, ellipse, line, sprite, quad, glyph, efekty GUI):
  1. kształt liczy swoją geometrię i AABB do scratchowego obiektu (bez alokacji),
  2. `emit(shape, bounds, style)` w `DrawCore`: rozwiązuje kolor/obrys/materiał/params, odrzuca pusty kolor, cull względem clipu,
  3. abstrakcyjne `place(...)` → writer: **świat** liczy sort point z AABB + `z` (albo bierze `style.sort`), decyduje opaque, woła `WorldPass.instance`; **GUI** po prostu `GuiPass.push(material, clip)`,
  4. zapis stylu (`writeStyle`) wspólny; geometria specyficzna przez nazwane funkcje z `instance.ts`.
  Quad i glyph przestają mieć własne kopie cull/sort/zapisu stylu.
- **Box liczony raz**: `rect`/`circle`/`sprite` wypełniają jeden scratch `BoxGeometry` (x, y, width, height, rotation, rounded, maxRadius, AABB). GUI używa go i dla boxa, i dla cieni/backdropu. Przy okazji zewnętrzny cień dostaje prawdziwy AABB (box + offset + spread + 1.5·blur) zamiast dzisiejszego `reach = Infinity` w cullu.
- **Tekst** (`text`/`textBox`/`glyph`, warstwy, `drawRun`, `uvBlock`, pula `TextLayer`) w `DrawCore`. Warstwy cienia dokłada GUI przez chroniony hook (domyślnie nic nie robi), więc świat nigdy nie produkuje `GUI_SHAPE`.
- **`warnOnce(key, message)`** w `DrawCore` (zbiór kluczy) zamiast sześciu flag.
- `setTarget`/`clearTarget`/`beginFrame` jak dziś. `urp/draw.ts` eksportuje `Draw`/`DrawGui` zawężone przez `Pick` jak dziś.

### Typy publiczne (`drawTypes.d.ts`)

- Świat: jak dziś (`position: Position3D`, `z` w `line`/`quad`, `sort` w stylu).
- **GUI traci `z` i `sort`**: `position: Position2D`, `line`/`quad` bez `z`, styl bez `sort`. GUI rysuje w kolejności wywołań, a te pola byłyby martwe. Konsekwencja: w etapie 4 poprawiamy wywołania `DrawGui` w sandboxie i w `navi/elements` (kompilator je wskaże; literały z `z` dadzą błąd nadmiarowej właściwości).
- Wspólne kawałki (`DrawOutline`, `MaterialParams`, `CornerRadius`, `DrawAtlas`, `UvScope`, `DrawClip`) raz. Propsy GUI-only (`shadow`, `backdrop`) tylko w typach GUI. Konfiguracja URP (`URPConfig`, `URPSortConfig`, `SortMode`, `SortAnchor`) też tutaj.

## Kroki

### Etap 0 — przygotowanie

1. **Zrzuty referencyjne.** Uruchomić każdy test z `src/sandbox/tests` (staticShapes, sort, iso, quad, lasers, pillars, textWorld, textGui, gui, guiShadow, guiBackdrop, clip, naviTest) na starym kodzie i zapisać zrzut ekranu. To nasza regresja wizualna na koniec etapów 2–4.
2. Utworzyć `src/core/aurora/urp2/`. Skopiować `shaders/materials/*.wgsl` ze starego `urp/` do `urp2/shaders/materials/` bez zmian. `urp2/defaultMaterial.ts` z `DEFAULT_MATERIAL` (fragment z `urp2/shaders/materials/default.wgsl`); stary `urp/drawApi.ts` importuje `DEFAULT_MATERIAL` stamtąd i re-eksportuje (jedyna zmiana starego kodu przed etapem 4).
3. `urp2/drawTypes.d.ts` według sekcji „Typy publiczne”.

### Etap 1 — fundamenty (nic jeszcze nie rysuje, sprawdzamy kompilacją)

4. `instance.ts`: pola, layouty (`VertexLayout`), `SHAPE`/`GUI_SHAPE`, `CLIP`, `UI_ATLAS`, pack/unpack `materialClip`, nazwane zapisy (`writeCorners`, `writeQuadPoints`, `writeGlyphField`, `writeTexture`, `writeStyle`) i pakowanie UV bloku tekstu (`packUvSize`).
5. `passes/clipBuffer.ts`: bufor clipów + rysowanie ciągów materiału.
6. `shaders/shapes.wgsl`: wszystko z sekcji „Shadery” oprócz rzeczy per pass. Tu agent szczególnie pilnuje zgodności stałych z `instance.ts`.

### Etap 2 — świat

7. `shaders/world.wgsl`: `SortParams`, `worldToPixel`, `snapAnchor`, `sortDepth` (zgodny z `sortKey`), `vertexMain` (+ `@location(12) sortPoint`), `fragmentMain`/`shade` z opaque.
8. `passes/world.ts`: `WorldPass` (RenderPass), sort, opaque, pipeline'y per materiał, `counters()`.
9. `drawCore.ts`: clip stack + cull, `emit`/`place`, `BoxGeometry`, rect/circle/ellipse/line/sprite/quad, tekst, `warnOnce`. Na tym etapie bez hooka cieni tekstu (dojdzie w etapie 3).
10. `worldDraw.ts`: `WorldDraw` — sort point (anchor, iso ostrzeżenie), opaque.
11. **Przełączenie świata**: stary `urp/urp.ts` slot `"draw"` → `WorldPass` z `urp2/` (nazwa passa i target `offscreenCanvas` bez zmian, bo stary GUI czyta go jako `backdrop`), stary `urp/draw.ts` `Draw` → nowa instancja z `urp2/`, `URP.beginFrame` woła obie. `urp.ts`/`draw.ts` na razie zostają w `urp/` i importują z `urp2/` — przenoszą się dopiero w etapie 4.
12. **Kontrola**: testy świata + świat w `clip` porównane ze zrzutami; profiler: liczniki `WorldPass` sensowne, brak błędów GPU.

### Etap 3 — GUI

13. `shaders/gui.wgsl`: `snapAnchor`/`toPixel` bez kamery, `vertexMain` z padem cienia, `blurredBox`, `shadowCoverage`, `backdropSample`/`backdropColor`, `fragmentMain`/`shade` z gałęziami efektów.
14. `passes/gui.ts`: `GuiPass` (MultiPass), jeden bufor, clipy, backdrop przeniesiony 1:1.
15. `guiDraw.ts`: `GuiDraw` — `place` bez sortu, efekty boxa na wspólnym `BoxGeometry`, backdrop (`markBackdrop`), hook warstw cienia tekstu w `DrawCore`.
16. **Przełączenie GUI**: slot `"gui"` → `GuiPass`, `DrawGui` → nowa instancja.
17. **Kontrola**: testy GUI + `naviTest` + `clip` ze zrzutami; licznik `backdrop groups` taki jak przed zmianą.

### Etap 4 — sprzątanie i podmiana folderu

18. Przenieść `urp/urp.ts` i `urp/draw.ts` do `urp2/` (poprawić importy z `../../urp/...` na lokalne, skoro reszta jest już w `urp2/`).
19. Skasować **cały stary folder `src/core/aurora/urp/`** (już nic z niego nie jest importowane — wszystko, łącznie z `shaders/materials/`, ma swoją wersję w `urp2/`).
20. `git mv src/core/aurora/urp2 src/core/aurora/urp` — `urp2` przestaje istnieć jako nazwa, nowy kod dziedziczy miejsce starego. `git mv drawTypes.d.ts urpTypes.d.ts` przy okazji (albo przed tym krokiem, w `urp2/`).
21. Poprawić wywołania `DrawGui` (usunięte `z`/`sort`) w `src/sandbox` i `src/core/navi/elements`.
22. Zaktualizować `plans/CLAUDE.md` (sekcja URP: dwa passy, dwa layouty, `shapeData`, pliki, lista stałych lustrzanych CPU↔WGSL) i `urp/todo.md` (usunąć zrealizowane ustalenia, zostawić backdrop i odrzucone rzeczy).
23. Ostateczna kontrola wszystkich testów ze zrzutami.

## Czego wprost nie robimy

- Nie ruszamy rdzenia Aurory (`core.ts`, `renderGraph.ts`, `pass.ts`, `resourcePool.ts`, `sharedBinds.ts`, `passBinds.ts`, `assetManager.ts`, `material.ts`, `utils/`).
- Nie zmieniamy działania backdropu, tylko go przenosimy (osobny plan).
- Żadnego chudego layoutu opaque ani podziału buforów per kształt.
- Nie zmieniamy materiałów (`shaders/materials/*.wgsl`) ani kontraktu `MaterialInput` — tylko przenosimy plik do `urp2/`, treść zostaje 1:1. Materiał działa identycznie w świecie i w GUI.
- Nie dokładamy nowych funkcji rysowania — zakres 1:1 z dzisiejszym, poza usunięciem `z`/`sort` z GUI.
