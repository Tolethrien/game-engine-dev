# Aurora V3: TODO

## Pula zasobów

- **Tekstury `fixed`** nie są nigdy czyszczone poza `clearAll`. Na przykład po zamknięciu minimapy jej tekstura zostaje w puli. Na razie to akceptowalne.
- **Klucz puli** jest stringiem budowanym przy każdym `acquire`. Optymalizacja później.

## Assety

- **Fonty**: tablica fontów w `AssetManager` (binding 4 w grupie 1), metryki w `FontData`.
  - Domyślny font pod indeksem 0: nieustalone.
  - **Dynamiczny atlas ma stałą liczbę stron** (`fontAtlas.pages` w configu), po zapełnieniu tylko ostrzeżenie i znak zastępczy. Do zrobienia:
    - powiększanie tablicy w locie (nowa tekstura, kopia stron, przebudowa grupy 1 i grafu, bez gubienia klatki),
    - usuwanie nieużywanych liter (licznik użycia per glif, zwalnianie półek, unieważnienie `TextBox` przez `getFontsVersion`).
  - **Kerning** w dynamicznym atlasie: brak. Pary z `measureText` z cache'em albo odczyt z TTF.
  - Wszystkie warstwy tablicy mają ten sam rozmiar, więc strony fontów bitmapowych rosną do rozmiaru strony dynamicznej.
- **`devicePixelRatio`**: canvas dostaje rozmiar okna z Electrona, najpewniej w pikselach logicznych. Przy skalowaniu Windowsa (125%, 150%) przeglądarka rozciąga cały obraz i wszystko jest lekko miękkie, także GUI i dynamiczny tekst, które nie będą ostrzejsze niż canvas. Do ustalenia na poziomie silnika: canvas w pikselach fizycznych (`size * devicePixelRatio`), co z `renderRes`, skalą NAVI i współrzędnymi myszy.
- **Podmiana zestawu tekstur w trakcie gry** (świat i UI). Obecnie zestaw wczytywany raz w `config`.
  - Już działa: stary zestaw rysuje się do końca wczytywania, podmiana wypada między klatkami, dane sprite'ów po nazwie aktualizują się same.
  - Przebudowa grupy 1 (`SharedBinds.buildAssets`) i passów (`RenderGraph.rebuild`), bo zmienia się layout assetów.
  - Passy z assetami w grupie 2: `PassBinds` z cache'em sam przebuduje bind groupę po zmianie view'a.
  - Dwie podmiany naraz: numer wywołania, wygrywa najnowsza, starsze wczytanie jest wyrzucane.
  - Błąd wczytywania: stary zestaw zostaje, błąd do konsoli.
  - Publiczne API: `Aurora.setTextures(...)` i `Aurora.setUITextures(...)`, `normalMaps`/`heightMaps` brane z configu.

## Kamera

Obecnie jedna, globalna: `Aurora.setCamera` → binding 1 w grupie 0 (position, zoom, rotation).

- **Wiele kamer** (minimapa, split screen, podgląd w edytorze): osobny bufor na kamerę i osobny wariant bind groupy grupy 0, pass wybiera kamerę w `resources` (np. `res.camera("minimap")`), system ustawia właściwą grupę 0.
- **Kamera a render target**: minimapa ma zwykle własną teksturę `fixed`, więc `renderSize` z `Frame` nie pasuje. Rozmiar widoku musi iść razem z kamerą.
- **Obiekt kamery po stronie silnika** (śledzenie, shake, granice mapy, płynny zoom, pixel snapping) budowany w engine, nie w Aurorze. Aurora dostaje tylko gotowe dane raz na klatkę.
- **Kto przekazuje dane**: engine sam pcha aktywne kamery przed `endFrame` czy gra woła `setCamera` ręcznie.
- **Konwencje** do zapisania przy `CameraData`: position = lewy górny róg widoku (kamera w 0,0 pokazuje świat od 0,0, bez ruchomej kamery współrzędne świata to piksele renderu), rotation w radianach (dodatnia zgodnie z zegarem, Y w dół), zoom > 1 przybliża.
- **Później ewentualnie**: gotowa macierz i jej odwrotność, pozycja z poprzedniej klatki (efekty czasowe).

## Shadery

- **Składanie shaderów z kawałków** (odłożone). Dziś powtarzają się:
  - w shaderach świata: `Frame`, `Camera`, transformacja kamery, `inputColor` (sRGB → liniowy),
  - w passach pełnoekranowych: quad.
- **Mapowanie numerów linii** w błędach kompilacji (`watchShader`) po złożeniu shadera.

## Materiały

- **Podział materiałów między passy** (np. Draw i GUI). Dziś `Material` ma jeden wspólny rejestr, a `DrawPass.setup` buduje pipeline'y dla wszystkich materiałów z `Material.getAll` i sprawdza, czy fragment definiuje `fn material(in: MaterialInput)`. Materiał GUI z innym wejściem shadera przerwałby budowanie grafu.
  - Rozróżnienie w opcjach, np. `pass: "draw" | "gui"`, a każdy pass filtruje `getAll` po swoim typie.
  - `id` jest dziś indeksem w globalnym rejestrze, a DrawPass używa go wprost jako indeksu pipeline'ów i buforów opaque. Po podziale każdy pass potrzebuje własnej numeracji albo mapy `id → indeks`.
  - Pliki materiałów per pass: `urp/shaders/materials/` dla Draw, osobny katalog dla GUI.
  - Edytor nie zna `MaterialInput` ani `frame` w plikach materiałów (są w shaderze passa), do rozwiązania razem ze składaniem shaderów.

## Debugger

- **Błędy GPU w panelu**: wysyłka `gpuErrors` (komunikat + liczba wystąpień) do profilera.
- **Podgląd tekstur** po nazwie z grafu (np. `scene`, `depth`, lightmapa). Do ustalenia:
  - gdzie wyświetlać: w grze (present pokazuje wybraną teksturę zamiast sceny) czy w oknie profilera (odczyt przez `mapAsync`, wolne, raczej miniatury co X ms),
  - czas życia: tekstura wraca do puli po ostatnim użyciu (`lastUse`), więc podglądaną trzeba trzymać do końca klatki albo kopiować,
  - wersje przy `modify`: którą pokazywać (ostatnią w klatce czy po konkretnym passie),
  - formaty: depth i r8 wymagają osobnego shadera (skala szarości, linearyzacja depth), `rgba16float` wymaga tonemapu albo clampa,
  - wybór z listy zasobów aktualnego grafu (dane przez `connect`, jak `activePasses`).

## Sortowanie

- **Sprite'y z miękką alfą**: dziś sprite trafia do opaque po samej alfie koloru, więc półprzezroczyste piksele tekstury (miękkie cienie, szkło, wygładzone krawędzie) są w passie opaque cięte progiem 0,5. Obejście: kolor z alfą 254 wymusza transparent.
  - Automatycznie: `AssetManager` przy wczytywaniu skanuje alfę albedo (`OffscreenCanvas` + `getImageData` z `willReadFrequently`, szukanie pierwszego piksela z alfą w (13, 242), wiersz po wierszu), wynik jako `opaque` w `AtlasPage`, sprite przekazuje `page.opaque`.
  - Koszt szacunkowo 5–15 ms na teksturę 1024x1024 w najgorszym przypadku (obraz bez miękkiej alfy), raz przy wczytaniu. Zmierzyć przed optymalizacją.
  - Jeśli za wolno: skan co drugi wiersz i kolumnę, worker albo liczenie flagi podczas builda (wtyczka Vite).
  - Przy atlasach flaga na cały obraz jest zbyt zgrubna: siatka kratek (np. 32x32 px) i sprawdzanie kratek pokrytych przez `crop`.

- **Izometria (tryb `iso`)**, do zrobienia przy budowie izometrycznej siatki.
  - Obecne tryby liczą punkt sortowania z pozycji na ekranie, a to w izometrii nie działa: obiekt na wyższym `z` gra rysuje wyżej (mniejsze ekranowe `y`), więc przy `y + x + z` trafiłby za to, co jest pod nim. Sortowanie musi iść po współrzędnych siatki.
  - Klucz: `gx + gy + z` jako główna oś (przekątna plus piętro), remis rozstrzyga `z`, potem `gx`. Zgodny z obecnym mechanizmem wag: suma to po prostu wartość pierwszej osi, shader i `sortKey` na CPU zmieniają tylko to, co trafia do tej osi.
  - Kolejność nie zależy od proporcji kafelka, więc jeden tryb obsługuje oba rzuty: spłaszczony 2:1 i idealne romby 1:1. Rzut siatki na ekran (`screenX = (gx - gy) * tileWidth / 2`, `screenY = (gx + gy) * tileHeight / 2 - z * zHeight`) liczy gra.
  - Jawny punkt sortowania w Draw: opcjonalne `sort: Position3D` ze współrzędnymi siatki, które zastępuje punkt liczony z pozycji i zaczepu.
  - `step` w jednostkach siatki, np. `{ y: 0.125, x: 1, z: 1 }` dla sumy z krokiem 1/8 kafelka (postacie między kafelkami mają ułamkowe `gx`, `gy`). Precyzja bez problemu, zakres sumy to kilkadziesiąt kafelków.
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

- **Przemyśleć, gdzie leży i jak działa całe profilowanie Aurory.** Dziś jest rozbite:
  - `GpuTimer` (`aurora2/timer.ts`) leży w Aurorze i jest w buildzie zawsze. `Aurora.init` wymaga `requiredFeatures: ["timestamp-query"]`, więc na urządzeniu bez tej funkcji gra nie wystartuje także na produkcji, choć pomiar czasu GPU jest potrzebny tylko do debugowania.
  - `debug.aurora` (`debugger/modules/gpu.ts`: `watchRender`/`watchCompute`/`watchClear`, liczniki, błędy shaderów) jest na produkcji podmieniany aliasem `@debug` na puste funkcje.
  - Każdy pass z licznikami sam woła `connectCounters` w `setup` i `disconnectCounters` w `destroy` i potrzebuje do tego pola ze strzałką (stała referencja i `this`).
  - Propozycja do rozważenia:
    - timer do modułu debuggera; graf woła `debug.aurora.beginPass(name)` i `debug.aurora.timestampWrites()`, na produkcji puste albo `undefined`; `timestamp-query` wymagany tylko w dev (np. `debug.aurora.requiredFeatures`),
    - liczniki jako opcjonalna metoda `counters?(): Record<string, number>` w `Pass`; podłączanie i odłączanie robi `RenderGraph` przy budowie i niszczeniu passów, passy nie importują debuggera,
    - całe debugowanie GPU (timer, `watch*`, liczniki, błędy) w jednym module, np. `AuroraDevModule` → `GpuDebugger`.
  - Warunek: na produkcji nic z tego nie może się wykonywać ani być wymagane. Rozwiązanie musi iść przez alias `@debug`, a nie runtime'owe `if` w klasie leżącej w Aurorze.

## Draw

- **Pola instancji są upakowane, nie dokładać ich bezmyślnie.** Instancja ma dziś 104 bajty i każde nowe pole kosztuje na wszystkim, co rysujemy, nie tylko na tekście. Dlatego glify korzystają z pól, których nie używają:
  - `radius.x` = zasięg pola odległości glifu w tekselach (`spread` albo połowa `distanceRange`),
  - `radius.y`, `radius.z` = początek litery w układzie całego napisu (0–1),
  - `radius.w` = rozmiar litery w tym układzie, dwie wartości spakowane po 12 bitów (0–4095 każda),
  - `rotation` zostaje wolne, pod obracany tekst.
  - Wolne miejsce się kończy. Przy kolejnych polach (emisja pod bloom, heightmapa, warstwa świateł) trzeba **przepakować wszystko naraz**: policzyć, co jest potrzebne per kształt, i rozłożyć na nowo, zamiast dokładać kolejne wyjątki.

- **Cień tekstu i kształtów**, odłożony do czasu `style.shadow` w NAVI, bo to ten sam mechanizm.
  - Trzecia warstwa tekstu, obok obrysu i wypełnienia: najpierw cienie wszystkich liter, potem obrysy, potem wypełnienia, z tym samym punktem sortowania.
  - API: `shadow: { offset, blur, color }` w `Draw.text`, `textBox` i `glyph`, a przy kształtach w `rect` i reszcie.
  - Przesunięcie robi CPU (przesuwa kwadrat), więc może być dowolne. Pokrycie liczy shader z pola odległości, a `blur` niesie wolne przy cieniu pole `outlineWidth`.
  - Ograniczenia: rozmycie sięga tyle, co pole odległości (`spread`, przy MTSDF połowa `distanceRange`), a cienie sąsiednich liter nakładają się na siebie, więc przy półprzezroczystym kolorze robi się w tych miejscach ciemniej. Miękki cień pod całym napisem wymagałby osobnego passa.

- **Polygon** (dowolny kształt z punktów), odłożony. `Draw.quad` pokrywa czworokąty do morfowania tekstur, polygon ma być ogólnym kształtem z N punktów.
  - Nie mieści się w instancji: zmienna liczba wierzchołków, więc osobny bufor i osobne wywołanie rysujące (pęka batch).
  - Dwie drogi do wyboru:
    - triangulacja na CPU (ear clipping, obsługuje kształty wklęsłe) do zwykłego bufora wierzchołków, bez instancingu; tanie w shaderze, ale bez wygładzania krawędzi i obrysu z SDF,
    - punkty w storage bufferze i odległość do wielokąta liczona w fragmencie; daje wygładzanie i obrys jak w innych kształtach, ale koszt rośnie z liczbą punktów na piksel.
  - UV dla tekstur i materiałów: planarne z prostokąta otaczającego (`uv` 0..1 w AABB), żeby `MaterialInput` działał jak w innych kształtach.
  - Sortowanie: jeden punkt na polygon (np. najniższy punkt przy `anchor: "bottom"`), jak w quadzie.
  - Do ustalenia przy implementacji: czy potrzebny obrys i wygładzanie, od tego zależy wybór drogi.

- **Batching GUI (do zrobienia razem z tekstem)**. Dziś pass `gui` ma `mode: "none"`: kolejność wywołań, batch pęka przy każdej zmianie materiału, więc Navi z przeplotem panel/tekst da setki wywołań.
  - GUI w trybie `layer`, `z` = warstwa w drzewie UI, konfigurowalny zakres (np. `zRange: [0, 1023]`, `step: 1`).
  - W transparentach remis klucza rozstrzygany po materiale (`keys[a] - keys[b] || materials[a] - materials[b]`), żeby elementy tej samej warstwy grupowały się po materiale. Do decyzji: dla obu passów czy tylko GUI.
  - Warunek dla Navi: elementy na tej samej warstwie nie mogą się nakładać. Okna, popupy i tooltipy dostają własne zakresy warstw (np. 0–99, 100–199, 200+), `z = baza okna + głębokość w drzewie`.
  - Błąd do poprawy przy włączaniu: tekstura głębi passa jest tworzona w rozmiarze renderu (`size: { scale: 1 }`), a pass `gui` pisze do tekstury w rozmiarze canvasa. Głębia musi dziedziczyć bazę rozmiaru z passa (`base: "canvas"` dla `space: "screen"`), inaczej WebGPU odrzuci pass z załącznikami różnej wielkości.
