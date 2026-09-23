# Aurora V3: TODO

## Pula zasobów

- **Tekstury `fixed`** nie są nigdy czyszczone poza `clearAll`. Na przykład po zamknięciu minimapy jej tekstura zostaje w puli. Na razie to akceptowalne.
- **Klucz puli** jest stringiem budowanym przy każdym `acquire`. Optymalizacja później.

## Assety

- **Fonty**: tablica fontów w `AssetManager` (binding 4 w grupie 1), metryki w `FontData`.
  - **Dynamiczny atlas ma stałą liczbę stron** (`fontAtlas.pages` w configu), po zapełnieniu tylko ostrzeżenie i znak zastępczy. Do zrobienia:
    - Po zapełnieniu `DynamicFont` zapisuje `fallback` pod brakującym kodem, więc szerokość litery zmienia się z prawdziwej (`measure`) na szerokość `*`. `TextBox` zawija po prawdziwej, a układa po zastępczej, więc wyrównanie i wielokropek mogą się lekko rozjechać. Poprawka: zapisywać kopię fallbacku z `advance` z `measure(code)`.

  - **Szerokość obrysu tekstu** jest ograniczona zasięgiem pola (`writeGlyph` przycina do `glyph.range × px na teksel − 1`). Szerszy obrys: MTSDF z większym `-pxrange` (np. 24 → 12 tekseli zasięgu), dla masek większy `fontAtlas.spread`. Oba zwiększają margines glifów w atlasie.
  - **Kerning MTSDF** (świat): odłożony, na razie niepotrzebny (fonty dynamic kerning mają, `text/kerning.ts`). Jeśli kiedyś: msdf-atlas-gen czyta tylko tabelę `kern`, a Lato i BlackOps mają pary w `GPOS`. Najtańsza droga: opcjonalny `url` do TTF w `MtsdfFontSource`, `FontCanvas.load` + ta sama `KerningTable`, `fromMTSDF` ustawia `FontData.kerning` (skala `atlas.size / referenceSize`). Alternatywa: `fontgen` (`C:\coding\tools\fontgen`) dopisuje pary z `GPOS` do `json.kerning` przez `opentype.js`.
  - Wszystkie warstwy tablicy mają ten sam rozmiar, więc strony fontów bitmapowych rosną do rozmiaru strony dynamicznej.

- **`devicePixelRatio`**: canvas dostaje rozmiar okna z Electrona, najpewniej w pikselach logicznych. Przy skalowaniu Windowsa (125%, 150%) przeglądarka rozciąga cały obraz i wszystko jest lekko miękkie, także GUI i dynamiczny tekst, które nie będą ostrzejsze niż canvas. Do ustalenia na poziomie silnika: canvas w pikselach fizycznych (`size * devicePixelRatio`), co z `renderRes`, skalą NAVI i współrzędnymi myszy.

- Warstwa 0 fontów jest niespójna z konwencją albedo. EMPTY_GLYPH używa jej jako sentinela dla pustych glifów (page: 0, uv: [0,0,0,0]) — to jedyne jej zastosowanie. Fallback nieznanej nazwy fontu (AssetManager.getFont) nie korzysta z warstwy 0 wcale, tylko zwraca defaultFont, którego glify leżą na zwykłej stronie (layer 1+), tak jak każdy inny font. W albedo/normal/height warstwa 0 pełni jedną, spójną rolę (neutralny fallback nieznanej nazwy); w fontach role są rozjechane między dwa niezależne mechanizmy na różnych poziomach (per-glif vs per-font). Do ustalenia: zostawić jak jest (i dopisać komentarz w assetManager.ts:294, że warstwa 0 to tylko sentinel dla EMPTY_GLYPH, nie fallback fontu) albo ujednolicić, np. spakować domyślny font tak, by faktycznie zaczynał się od warstwy 0.

## Kamera

Obecnie jedna, globalna: `Aurora.setCamera` → binding 1 w grupie 0 (position, zoom, rotation).

- **Wiele kamer** (minimapa, split screen, podgląd w edytorze): osobny bufor na kamerę i osobny wariant bind groupy grupy 0, pass wybiera kamerę w `resources` (np. `res.camera("minimap")`), system ustawia właściwą grupę 0.
- **Kamera a render target**: minimapa ma zwykle własną teksturę `fixed`, więc `renderSize` z `Frame` nie pasuje. Rozmiar widoku musi iść razem z kamerą.

- **Kto przekazuje dane**: engine sam pcha aktywne kamery przed `endFrame` czy gra woła `setCamera` ręcznie.

- **Konwencje** do zapisania przy `CameraData`: position = lewy górny róg widoku (kamera w 0,0 pokazuje świat od 0,0, bez ruchomej kamery współrzędne świata to piksele renderu), rotation w radianach (dodatnia zgodnie z zegarem, Y w dół), zoom > 1 przybliża.
- **Później ewentualnie**: gotowa macierz i jej odwrotność, pozycja z poprzedniej klatki (efekty czasowe).

## Shadery

- **Składanie shaderów z kawałków** (odłożone). Dziś powtarzają się:
  - w shaderach świata: `Frame`, `Camera`, transformacja kamery, `inputColor` (sRGB → liniowy),
  - w passach pełnoekranowych: quad.
- **Mapowanie numerów linii** w błędach kompilacji (`watchShader`) po złożeniu shadera.

## Debugger

- **Kwantyzacja timestampów** (Dawn/Chromium domyślnie ok. 100 µs): dodano `app.commandLine.appendSwitch("disable-dawn-features", "timestamp_quantization")` w `src/backend/main.ts` przed `app.on("ready")`. Nie zmierzono jeszcze realnego wpływu na krótkie kroki (pojedyncze clear passy) — sprawdzić na czasach passów / `gpu.steps` ze snapshotu (od planu 2), czy suma kroków dalej wygląda zawyżona/zaniżona.

- **Błędy GPU i kroki GPU w profilerze**: `errors` i `gpu.steps` są już w `AuroraSnapshot`, ale nic ich nie wyświetla — czekają na konsolę profilera.

## Sortowanie

- **Izometria: duże obiekty i podłoga**, tryb sortowania `"gx+gy+z"` już gotowy (`plans/sort-iso.md`).
  - Duże obiekty na kilku kafelkach (ściany, budynki) nie sortują się jednym punktem: cięcie na kawałki po kafelku albo punkt w kafelku najbliższym kamerze, z akceptacją drobnych błędów.
  - Podłoga niczego nie zasłania, więc nie musi być sortowana: niższe `z` albo osobny pass jednym wywołaniem (jak dawny `IsoChunkPass`).
  - Przypadki, których jeden punkt na obiekt nie obejmie (postać pod łukiem), rozwiązuje heightmapa z głębią per piksel.
- **Heightmapa (głębia per piksel)**, do zrobienia razem z izometrią albo przy pierwszym sprite'cie z mapą wysokości.
  - Cel: jeden punkt sortowania na obiekt nie wystarcza, gdy część sprite'a ma być za innym obiektem, a część przed nim (podstawa kolumny za postacią, jej szczyt przed nią, postać pod łukiem).
  - Assety już są: `AssetManager` buduje tablicę `height` (`r8unorm`, binding 2 w grupie 1) przy `heightMaps: true` w configu, a `TextureSource` ma pole `height`. Warstwa 0 jest neutralna (wysokość 0).
  - Mechanizm: w passie opaque fragment shader czyta wysokość z tekstury sprite'a (te same UV i warstwa co albedo) i zapisuje `frag_depth` jako głębię z punktu sortowania przesuniętą o wysokość. Wyższy piksel sprite'a jest bliżej kamery.
  - Tylko opaque. Transparenty dalej sortują się jednym punktem na CPU, więc przezroczyste sprite'y nie korzystają z heightmapy.
  - `frag_depth` wyłącza wczesny test głębi dla tego pipeline'u, więc sprite'y z heightmapą powinny mieć osobny pipeline albo stałą `override`, żeby zwykłe kształty go nie płaciły.
  - Do ustalenia: skala przesunięcia. Ile kroków klucza sortowania odpowiada pełnej wysokości z tekstury (1,0), jednostki różnią się między trybami (`y` w jednostkach świata, `iso` w sumie `gx + gy + z`). Prawdopodobnie parametr w configu sortowania albo per sprite.
  - Do ustalenia: czy przesunięcie może przekroczyć sąsiedni krok klucza (obiekt wyższy niż jego strefa sortowania) i jak to ograniczyć, żeby nie przebijał obiektów stojących wyraźnie przed nim.

## Draw

- **Pola instancji są upakowane, nie dokładać ich bezmyślnie.** Instancja ma dziś 104 bajty i każde nowe pole kosztuje na wszystkim, co rysujemy, nie tylko na tekście. Dlatego glify korzystają z pól, których nie używają:
  - `radius.x` = zasięg pola odległości glifu w tekselach (`spread` albo połowa `distanceRange`),
  - `radius.y`, `radius.z` = początek litery w układzie całego napisu (0–1),
  - `radius.w` = rozmiar litery w tym układzie, dwie wartości spakowane po 12 bitów (0–4095 każda),
  - `rotation` zostaje wolne, pod obracany tekst.
  - Wolne miejsce się kończy. Przy kolejnych polach (emisja pod bloom, heightmapa, warstwa świateł) trzeba **przepakować wszystko naraz**: policzyć, co jest potrzebne per kształt, i rozłożyć na nowo, zamiast dokładać kolejne wyjątki.

- **Cień tekstu w GUI: znane ograniczenia** (zaakceptowane):
  - `spread + blur` sięga najwyżej tyle, co pole odległości (maski: `fontAtlas.spread`, MTSDF: połowa `distanceRange`), dalej przycinane z ostrzeżeniem. Szerszy cień/poświata: większe pole albo efekt warstwy GUI (osobny pass).
  - Cienie sąsiednich liter składane przez „over” odbiegają lekko od rozmycia całego napisu tam, gdzie pola się stykają, a przy półprzezroczystym kolorze robi się tam ciemniej. Przy małym blurze niewidoczne.
  - Przez półprzezroczysty tekst prześwituje jego cień (brak przycięcia pod literą, TextMeshPro też go nie robi).

## Pomysly

- Jesli wiem ze w sumie gra glownie u mnie bedzie w swiecie miala sprity! to moze warto by bylo miec wersje draw ktora nie ma zasranego 104 bajty na kazda instancje bo i tka nie uzyje rzeycz jak rounding czy outline (nie dotyczy gui)
  Sprite-only pass (bez rounding/outline) → inny, chudszy MaterialInput niż w draw/gui. To realny powód na podział rejestru materiałów per pass (patrz sekcja „Materiały" wyżej) — w GUI nie ma sensu, bo tam MaterialInput jest identyczny jak w draw.

## URP TODO

- hight i normal map
- point lights(oraz wlasne shapy swiatla)
- dynamiczne oswietlenie
- LUTy
- colorCorrectionPass(tylko do zabawy scena w devie, potem do przeniesienia ustaiwenia na LUT)
  -efekty: bloom, film grain, grayscale, winieta,
- full screen quad dla wlasnych shaderow
- build in togglowana kamere podstawowa
- draw Origin: topLeft, center
- tone mappinng: rainhard,aces, filmic,none
- co z kamera? jak ja robimy
- on/off ficzery jak bloom,lighting itp

- gui pass pelny: outliny i takie tam... (shadowbox i innershadow sa w `DrawGui.shadow`)
- **Efekty warstwy GUI** (osobny pass): drop-shadow/glow calego poddrzewa GUI, cien z alfy tekstury sprite'a. Blur tla jest w `DrawGui.backdrop`.
- **Backdrop: inne filtry** (`brightness`, `contrast`, `saturate`, `hue-rotate`, `invert`, `sepia`) — ta sama gałąź shadera, parametry mieszczą się w wolnych polach instancji (`uvRect`, `outlineWidth`, reszta `params`). Kolejność filtrów byłaby stała, nie jak w CSS.
- **Backdrop: koszt** rośnie z liczbą grup, nie pikseli: grupa to ~7 zależnych, małych kroków GPU (koniec `draw`, zrzut, do 5 mipów, wznowienie) + przejście `gui` z render targetu na teksturę. Test w sandboxie: 5 grup ≈ +0,7–2,4 ms, przy `blur: 3` (mniej poziomów) wyraźnie taniej. Do zrobienia przy konsolidacji: rozmycie separowalne (2 kroki zamiast piramidy), lepsze grupowanie (niżej), timestampy per krok tylko przy otwartym profilerze.
- **Backdrop: grupowanie** po sumie AABB. Siatka szkieł z zawartością może dawać więcej grup niż trzeba (licznik `backdrop groups`); ewentualnie lista prostokątów zamiast sumy.
- **Clip maską (stencil)**: prostokątny/zaokrąglony clip jest (`pushClip`), dowolny kształt / alfa tekstury jeszcze nie.
- drawBatch: przyklad z kulek, caly chunk w sumie to praktycznie ledwo zmienione dane w liscie, rownie dobrze moge przekazac cala ta liste, a nie robic 622 razy Draw.sprite... mega dobre dla procesora

## Moze kiedys (do zapamietania)

- **Quad bez marginesu AA.** Inne kształty dostają `pad` (jeden teksel renderu) rozsuwający wierzchołki na zewnątrz, więc krawędź ma pełne wygładzenie. `Draw.quad` rysuje dokładnie po punktach `a, b, c, d` — rasteryzacja kończy się na krawędzi, więc łagodne opadanie z `dist`/`aa` nigdy się nie renderuje poza nią i krawędź wychodzi twarda. Rozwiązanie wymaga rozsunięcia wierzchołków o teksel na zewnątrz od środka (per róg, wzdłuż dwusiecznej), co komplikuje `invBilinear` (musiałby dalej liczyć UV względem oryginalnego, nierozsuniętego czworokąta) — do zrobienia przy najbliższej okazji dotykania `quad`.

- **Polygon** (dowolny kształt z punktów), odłożony. `Draw.quad` pokrywa czworokąty do morfowania tekstur, polygon ma być ogólnym kształtem z N punktów.
  - Nie mieści się w instancji: zmienna liczba wierzchołków, więc osobny bufor i osobne wywołanie rysujące (pęka batch).
  - Dwie drogi do wyboru:
    - triangulacja na CPU (ear clipping, obsługuje kształty wklęsłe) do zwykłego bufora wierzchołków, bez instancingu; tanie w shaderze, ale bez wygładzania krawędzi i obrysu z SDF,
    - punkty w storage bufferze i odległość do wielokąta liczona w fragmencie; daje wygładzanie i obrys jak w innych kształtach, ale koszt rośnie z liczbą punktów na piksel.
  - UV dla tekstur i materiałów: planarne z prostokąta otaczającego (`uv` 0..1 w AABB), żeby `MaterialInput` działał jak w innych kształtach.
  - Sortowanie: jeden punkt na polygon (np. najniższy punkt przy `anchor: "bottom"`), jak w quadzie.
  - Do ustalenia przy implementacji: czy potrzebny obrys i wygładzanie, od tego zależy wybór drogi.
