# Aurora V3: TODO

## Pula zasobów

- **Tekstury `fixed`** nie są nigdy czyszczone poza `clearAll`. Na przykład po zamknięciu minimapy jej tekstura zostaje w puli. Na razie to akceptowalne.
- **Klucz puli** jest stringiem budowanym przy każdym `acquire`. Optymalizacja później.

## Assety

- **Fonty**: tablica fontów w `AssetManager` jest przewidziana (binding 4 w grupie 1). Do ustalenia przy passach tekstu:
  - gdzie żyją metryki znaków (MSDF JSON) potrzebne do układania tekstu na CPU,
  - jak wygląda domyślny font pod indeksem 0.
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
- **Konwencje** do zapisania przy `CameraData`: position = środek widoku, rotation w radianach (dodatnia zgodnie z zegarem, Y w dół), zoom > 1 przybliża.
- **Później ewentualnie**: gotowa macierz i jej odwrotność, pozycja z poprzedniej klatki (efekty czasowe).

## Shadery

- **Składanie shaderów z kawałków** (odłożone). Dziś powtarzają się:
  - w shaderach świata: `Frame`, `Camera`, transformacja kamery, `inputColor` (sRGB → liniowy),
  - w passach pełnoekranowych: quad.
- **Mapowanie numerów linii** w błędach kompilacji (`watchShader`) po złożeniu shadera.

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
