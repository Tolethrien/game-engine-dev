# Esencja obecnego `urp`/draw — co realnie potrafi

Punkt odniesienia przed przepisaniem: lista tego, co musi dalej działać w nowej wersji, żeby nic nie zgubić.

## Prymitywy (`Draw`/`DrawGui`)

- `rect` (rounded, per-róg promienie), `circle`, `ellipse`, `line` (butt/round/square cap)
- `sprite` (tekstura z world/ui atlasu, crop, flipX/flipY, rounded corners, skalowanie niezależne od tekstury)
- `quad` (4 dowolne punkty, invBilinear UV, ignoruje obrys — bo brak czystego SDF dla dowolnego czworokąta)
- `text` / `textBox` (przez `TextBox` — layout z zawijaniem) / `glyph` (pojedynczy znak, zwraca advance)

## Styl wspólny (`DrawStyle`)

- `color` (RGBA 0–255, premultiplied w shaderze)
- `outline` (kolor+szerokość; dla kształtów do środka, dla tekstu na zewnątrz, przycinane do zasięgu pola SDF)
- `material` + `params` (do 4 floatów, nazwane sloty przez `Material.create({params})`)
- `sort` (jawny punkt sortowania nadpisujący automatyczny)

## Materiały

- Rejestr globalny, własny fragment shader wstrzykiwany do wspólnego `draw.wgsl`
- `blend: "normal" | "additive"` (additive wymusza transparent)
- Wejście materiału: `uv`, `local`, `size`, `color`, `outlineColor`, `texel`, `ring` (maska obrysu), `dist`/`reach` (SDF), `params`, plus globalne `frame`/`camera`
- Dodanie materiału w locie → rebuild grafu (buduje pipeline'y dla wszystkich passów)

## Sortowanie / warstwy

- Tryby: `none` (kolejność wywołań, GUI), `y`, `layer`, `y+x`, `y+x+z`, `gx+gy+z` (izometria, wymaga jawnego `sort` w koordynatach siatki)
- `anchor: top|center|bottom` — punkt zaczepienia bounding-boxa do klucza sortu
- Opaque (alpha=255, nie-transparent materiał, nie glif) idzie osobną ścieżką: depth-test, jeden draw call per materiał, bez sortowania CPU
- Transparent: sort CPU stabilny po kluczu, batchowany po ciągłych przebiegach tego samego materiału

## Efekty (tylko `DrawGui`)

- Cień boxa (`shadow`, CSS box-shadow: `color, offset, blur, spread, inset`), lista cieni (pierwszy na wierzchu), zewnętrzne + wewnętrzne
- Cień tekstu (ten sam `DrawShadow`, bez `inset`)
- Backdrop blur (CSS backdrop-filter: `blur` w px canvasa) — rozmywa wszystko narysowane pod spodem (scena + wcześniejsze GUI), grupowanie sąsiednich backdropów w jedną klatkę blur-pyramidy dla wydajności

## Clipping (`Draw` i `DrawGui`)

- `pushClip`/`popClip`, stos zagnieżdżony (max 8), przecinanie z rodzicem
- `inset` jak CSS padding-box (zwęża prostokąt i promienie razem)
- Cull na CPU (nie wysyła instancji całkowicie poza clipem) + maska w shaderze dla brzegów

## Tekstury / atlasy

- Dwa światy: `world` (albedo/normal/height/UI wielowarstwowe tablice) i `ui` (osobna tablica, dekodowana inaczej w shaderze)
- Crop + flip niezależnie od rozmiaru rysowania

## Tekst

- Trzy typy fontów: `grid` (bitmapowy), `dynamic` (TTF/OTF, rasteryzacja per-rozmiar), `mtsdf` (skalowalny, z msdf-atlas-gen)
- `TextBox`: `direction row|col`, `width/height`, `align` (start/center/end/justify), `alignCross`, `overflow` (visible/ellipsis/fit/tail), `wrap`, `letterSpacing`, `lineGap`, leniwe przeliczanie
- Brak kerningu (świadomie pominięte, jest todo)
- UV scope `glyph`/`text` — dla materiałów chcących UV po całym napisie, nie po literze

## Cechy architektoniczne

Nie feature'y usera, ale część "co działa" i musi zostać zachowane:

- Zero alokacji w hot-path (writer bezpośrednio do GPU-mapowanego bufora, `GrowingBuffer` rośnie/kurczy się)
- CPU i GPU liczą sort key identycznie (muszą być ręcznie zsynchronizowane)
- Snap do tekseli renderu (kotwica), kamera z zoom/rotation
- Wszystko asertowane (`@axiom/utils`), ostrzeżenia raz na typ błędu, nigdy throw w hot-path poza asercjami dev

## Ustalenia do przepisania (na razie w rozmowie)

- **Ograniczenie: rdzeń Aurory (`core.ts`, `renderGraph.ts`, `pass.ts`, `resourcePool.ts`, `sharedBinds.ts`, `passBinds.ts`, `assetManager.ts`, `material.ts`, `timer.ts`, `config.ts`, `utils/`) się nie rusza.** Cały redesign draw zamyka się w `urp/` (`passes/draw.ts`, `drawApi.ts`, `draw.ts`, `urpTypes.d.ts`, shadery). `Aurora.createRenderPipeline` już dziś przyjmuje dowolny `buffers: [...]` — różne vertex layouty (gdyby były potrzebne) buduje sam `DrawPass`, nie wymaga to nic nowego od rdzenia.

- **Rozdział świat/GUI**: dziś jeden `DrawPass`/`DrawApi`/`draw.wgsl` obsługuje oba przez flagi (`space`, `guiEffects`). Nowa wersja ma to rozdzielić na dwa niezależne komplety, dzielące tylko wspólną geometrię kształtów (`roundedBox`, `ellipse`, `invBilinear`, prymitywy rect/circle/ellipse/quad/sprite/text/glyph).
  - **Świat** zatrzymuje: pełne sortowanie (wszystkie tryby + iso), kamerę (`worldToPixel` z zoom/rotation), opaque/depth batching. Traci: shadow/inner shadow/backdrop (kształty, bindy, cały blok blura Evana Wallace'a i próbkowania piramidy).
  - **GUI** traci sortowanie **całkowicie** (nie tylko tryb `none`) — `SortParams`, `sortKey`/`sortDepth`, opaque/depth batching padają w całości, bo kolejność = kolejność wywołań i o to dba wołający `Draw`, nie silnik. Traci też kamerę (`worldToPixel`/`snapAnchor` upraszczają się do `floor(anchor + 0.5) + offset`). Zatrzymuje wszystkie efekty (shadow, backdrop, text-shadow) i clip.
  - Zauważone: `GUI_SORT.mode` już dziś jest `"none"` (`urp.ts`), więc depth/opaque batching już teraz nigdy się nie uruchamia dla GUI — to czyszczenie martwego kodu, nie zmiana zachowania.
  - `clip` (`pushClip`/`popClip`) jest wspólny dla świata i GUI — zostaje w obu.
  - **Dwa osobne shadery** (`.wgsl`), jeden dla świata, jeden dla GUI — nie jeden `draw.wgsl` z flagami (`screenSpace`, `opaquePass` itd.). Każdy niesie tylko gałęzie `shade()` i binды, których faktycznie używa.

- **API (`drawApi.ts`/`draw.ts`/`urpTypes.d.ts`) przepisujemy od zera**, nie tylko pass. Dziś jedna generyczna klasa `DrawApi<Extra>` (`guiEffects: boolean` + rzutowania `props as DrawGuiExtra`) obsługuje oba światy, i ma **trzy osobne, ręcznie synchronizowane ścieżki zapisu instancji** zamiast jednej: `instance()` (rect/circle/ellipse/sprite/line), `quad()` (własna kopia cull/sort/write), `writeGlyph()` (też własna, pomija `instance()`). Do tego `boxEffects` liczy geometrię boxa, a `instance()` zaraz potem liczy ją drugi raz od zera dla tego samego kształtu. Cel nowego API:
  - Osobne, niegeneryczne `WorldDraw`/`GuiDraw` (odpowiednik podziału passów/shaderów), bez `Extra`/rzutowań na typy GUI-only.
  - Jedna wspólna ścieżka zapisu instancji zamiast trzech równoległych — quad i glyph mają dziś inną geometrię, ale cull/sort-point/zapis-stylu powinny przechodzić przez to samo miejsce, nie przez kopie.
  - Box (rect/circle/sprite) liczy swoją geometrię raz, współdzieloną między efektami (cień/backdrop) i zapisem instancji — nie dwa razy.
  - Jeden `warnOnce(key, msg)` zamiast sześciu osobnych flag `warned.*`.
  - `drawApi.ts` zostaje domem **tylko** dla prawdziwie wspólnej części (nie osobnym plikiem per świat/GUI od zera): geometria boxa liczona raz, clip stack + cull, `writeStyle`/`writeCorners`/`writeTexture`/`page()`, `warnOnce`, wspólna ścieżka zapisu instancji. `WorldDraw`/`GuiDraw` (własne pliki albo klasy) dokładają tylko to co faktycznie różne: `boxEffects`/`writeShadows`/`writeBackdrop`/`effectStyle` (tylko GUI), automatyczny sort point (tylko świat — GUI nie sortuje w ogóle, patrz wyżej).

- **Pakowanie instancji (104B, pola znaczące co innego per kształt)**: `radius` to dziś promienie rogów (box/ellipse), punkty C/D (quad) i zasięg pola + pozycja/rozmiar w bloku tekstu (glyph) — jedno pole, trzy niepowiązane znaczenia.
  - **Odrzucone**: fizyczny podział na osobne bufory/vertex layouty per rodzina kształtów (box-like / quad / glyph / effect). Sprawdzone w `src/sandbox/tests` (np. `textGui.ts:264` — `DrawGui.rect` tła + `DrawGui.textBox` etykiety, ten sam materiał) — GUI stale przeplata rect i text w obrębie jednego widgetu. Osobne bufory złamałyby dzisiejsze grupowanie ciągłych przebiegów tego samego materiału (jeden draw call na widget → dwa), podobnie w świecie sortowanie po pozycji miesza kształty spatialnie niezależnie od kolejności wywołań. Fizyczny podział = realna regresja wydajności, nie tylko kosmetyka.
  - **Kierunek**: zostaje jeden fizyczny layout (bo to on daje batching niezależny od typu kształtu), ale writer dostaje **nazwane metody per kształt** zamiast generycznych (`vert.quadPoints(c, d)`, `vert.glyphField(range, u, v, size)`, `vert.corners(...)`) zamiast dzisiejszego `vert.radius(...)` z komentarzem tłumaczącym co tak naprawdę zapisuje. Ta sama pamięć, ten sam bajt-za-bajt layout — poprawia się tylko czytelność strony CPU/zapisu.
  - **Wyjątek: opaque w świecie.** Ogólny fizyczny podział odrzucony wyżej dotyczy transparentów/GUI, bo tam kolejność wywołań ma znaczenie (blending nie jest przemienny). Opaque **nie zależy od kolejności** — dziś to i tak jeden draw call na cały bufor danego materiału (`step.draw(6, batch.buffer.getCount)`), niezależnie kiedy w klatce co zostało napisane. Dlatego tu podział fizyczny jest bezpieczny: osobny, chudszy layout dla `sprite` (bez `radius`/`outlineWidth` — plain sprite ich nie używa, ~76B: `position`+`size`+`rotation`+`color`+`uvRect`+`layer`+`sortPoint`+`params`+`clip`) i osobny dla `shape`/`quad` (pełny, z `radius`/`outlineWidth`) w świecie. Deterministycznie do 2 draw calli na materiał zamiast 1, nigdy nie psuje batchingu przez interleaving. Zastrzeżenia: zysk dotyczy tylko instancji faktycznie opaque (`alpha === 255`, materiał nietransparentny) — sceny z dużą ilością półprzezroczystych sprite'ów (fade, mgła wojny) i tak wpadają do wspólnego transparentnego bufora; `quad` (rzadki) zostaje w koszyku `shape`, nie dostaje trzeciego layoutu.

- **`materialClip` (material id + clip id w jednym `u32`) — zostaje, tylko kosmetyka.** Material id jest CPU-only (shader go nie czyta, materiał jest już wypieczony w pipeline przez `// MATERIAL`; CPU potrzebuje go w `drawTransparent` do znalezienia granic przebiegów po sorcie), clip id jest GPU-only (`clipCoverage` w shaderze). Sortowanie fizycznie przestawia całe rekordy instancji, więc material id musi jechać razem z rekordem przez permutację — upakowanie z clip id w jednym `u32` (16+16 bit) unika dodatkowego pola, które i tak byłoby martwymi danymi dla GPU. Do zrobienia: mały nazwany helper pack/unpack zamiast gołych `<< 16`/`>> 16u`/`& mask` w dwóch miejscach — bez zmiany podejścia.

- **Backdrop blur — problem nierozwiązany, kierunek jeszcze nieustalony.** Dziś to dwa sprzężone podsystemy wciśnięte w metody `DrawPass` (`passes/draw.ts`): grupowanie (`groupBackdrops`, `instanceBounds`, `nextGroup`, `scratchBounds`/`drawnBounds`) i rysowanie piramidy blura (`blurBackdrop`, `backdropPipelines`, `backdropBinds`), sprzężone ze sobą (grupowanie decyduje które wywołania blura się dzieją i z jakim scissorem) i rozciągnięte przez cały cykl życia passa (`resources`/`setup`/`execute`/`beginFrame`/`destroy`). Do tego `instanceBounds` to trzecia, ręcznie pisana wersja geometrii kształtu (obok `DrawApi.instance()` i `vertexMain` w shaderze), a sama heurystyka grupowania po AABB jest już znana jako niedoskonała (`aurora/todo.md:103` — może dawać więcej grup niż trzeba, a koszt jest per grupa, nie per piksel). Musi zostać w jednym passie GUI (nie da się z tego zrobić osobnego passa w `RenderGraph`, bo backdrop przerywa i wznawia rysowanie GUI w połowie klatki, w tym samym encoderze — stąd `MultiPass`). Do przemyślenia, jeszcze bez decyzji.
  - **Priorytet #1 — prawdopodobnie główne źródło liczby draw calli.** Cały system dziś wykonuje ~50 draw calli łącznie; jedna grupa backdropu to ~7 zależnych kroków GPU (koniec kroku `draw` → zrzut sceny+GUI → downsample przez do 5 poziomów mip → wznowienie), więc już kilka paneli ze szkłem w GUI może odpowiadać za większość tej liczby. Clip **nie** ma na to wpływu — nie dzieli draw calli, tylko testowany per-piksel w shaderze (`drawTransparent` grupuje batch wyłącznie po materiale, `& CLIP.materialMask`, clip id ignorowany).
  - Kierunki redukcji już zanotowane w `aurora/todo.md:102-103`, nie nowe: **rozmycie separowalne** (2 kroki: poziomy+pionowy) zamiast piramidy mipmap; **lepsze grupowanie** (lista prostokątów zamiast sumy AABB, dziś może tworzyć więcej grup niż trzeba przy siatce szkieł).
  - Fundamentalne ograniczenie niezależne od podejścia: każda grupa musi widzieć inny, progresywny stan tego co narysowano do tej pory w klatce — nie da się zrobić jednego globalnego blura całej klatki bez zmiany semantyki efektu (różne panele widzą różną ilość zawartości pod sobą w momencie swojego rysowania).
  - Przed optymalizacją: dodać realny licznik draw calli (dziś `counters()` liczy `total`/`opaque`/`transparent`/`clips`/`backdrop groups`, ale nie liczbę faktycznych `draw()`) i zmierzyć na prawdziwej scenie, nie zgadywać skąd bierze się 50.

- **Backdrop blur — ustalony kierunek: automatyczny wybór źródła (scena / to co pod spodem).** Założenie z praktyki: blur prawie zawsze leży albo bezpośrednio nad grą (panele HUD), albo nad całym UI (modal, menu kontekstowe). Szkło nad innym GUI jest rzadkie, ale ma dalej działać poprawnie. Semantyka się nie zmienia (dalej „wszystko pod spodem” jak CSS), API się nie zmienia (żadnego `source` w `backdrop`) — pass sam wybiera tańszą ścieżkę, gdy wynik jest identyczny.
  - **Obserwacja**: jeśli pod backdropem (AABB + zasięg blura) nie ma jeszcze żadnego GUI narysowanego w tej klatce, to „wszystko pod spodem” == „sama scena”. Taki panel może czytać z piramidy zbudowanej raz z `offscreenCanvas`.
  - **Różne σ nie są problemem**: piramida nie jest liczona pod konkretne σ, każdy panel próbkuje swój poziom (`backdropLevel`, bicubic między sąsiednimi mipami) — już dziś jedna grupa miesza różne σ i buduje piramidę do `max(group.top)`. Jedna piramida sceny obsługuje wszystkie sceniczne panele w klatce.
  - **Dwie ścieżki**:
    - **Piramida sceny** (`backdropScene`): raz na klatkę, przed krokami GUI, tylko gdy w klatce jest choć jeden sceniczny backdrop; do najwyższego poziomu σ scenicznych paneli, scissor do sumy ich regionów; źródło prosto `offscreenCanvas` (bez kroku kompozycji gui-over-scene). Zero przerwań kroku GUI.
    - **Piramida „pod spodem”** (`backdrop`, dzisiejszy mechanizm grup): tylko dla paneli, pod którymi leży już GUI — przerwanie kroku, zrzut, downsample, grupowanie jak dziś.
  - **Dwie osobne tekstury w bind groupie GUI**, nie jedna — sceniczny panel narysowany po zrzucie grupy „pod spodem” czytałby nadpisane dane. Shader wybiera teksturę po wariancie kształtu (`SHAPE_BACKDROP` / `SHAPE_BACKDROP_SCENE`), bez nowego pola instancji.
  - **Śledzenie narysowanego GUI: bitmapa zajętości ekranu w `GuiDraw`**, nie Navi i nie suma AABB. Komórki np. 32×32 px canvasa, bitset w stałym `Uint32Array`, bez alokacji. Każda instancja GUI przy zapisie zaznacza komórki pokryte swoim AABB (AABB i tak jest liczone do culla clipu). Dwie bitmapy: „od początku klatki” (test scena vs pod spodem, czyszczona w `beginFrame`) i „od ostatniego zrzutu grupy” (zastępuje `drawnBounds`/sumę AABB w grupowaniu, czyszczona przy zrzucie). Koszt stały per instancja, niezależny od liczby narysowanych rzeczy; niedokładność tylko do rozmiaru komórki i zawsze w bezpieczną stronę (najwyżej wolna ścieżka, nigdy zły obraz). Rozwiązuje też znaną słabość grupowania z `aurora/todo.md:103`.
  - **Dlaczego nie drzewo Navi**: odwrócona zależność (Navi stoi na `DrawGui`, nie odwrotnie), nie całe GUI idzie przez Navi (sandbox, testy, przyszły debug overlay), a `pixelBox` ≠ to co narysowane (zewnętrzne cienie, `overflow: visible`, własne `draw()`, tweeny `scale`/`nudge`). Pass zna prawdziwe AABB każdej instancji w momencie zapisu.
  - **Ryzyko**: pełnoekranowe GUI pod panelami (winieta, overlay rysowany przez `DrawGui`) zajmuje wszystkie komórki i spycha każdy backdrop na wolną ścieżkę. Świadomie bez furtki w API na teraz — wrócić do tematu, jeśli to wyjdzie w praktyce.
  - **Kolejność**: najpierw pomiar (czas GPU per grupa z `GpuTimer.getSteps` + licznik `draw()`), potem ten plan — już na rozdzielonym passie GUI z przepisania (świat/GUI), nie na obecnym `DrawPass`.
