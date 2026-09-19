[zrobione]

# Tryb sortowania izometrycznego `"gx+gy+z"`

**Agent: worker mid.** Zależy od: nic.

Źródło: `todo.md` → Sortowanie → „Izometria (tryb `iso`)”. Ten plan wdraża sam tryb sortowania. Reszta tamtego wpisu (duże obiekty na wielu kafelkach, podłoga w osobnym passie, heightmapa) zostaje w `todo.md`.

## Dlaczego nowy tryb

Obecne tryby sortują po punkcie ekranowym. W izometrii obiekt na wyższym `z` gra rysuje wyżej na ekranie (mniejsze `y`), więc przy `y+x+z` trafiłby za to, co stoi pod nim. Sortować trzeba po współrzędnych siatki: przekątna `gx + gy` plus piętro `z`.

## Klucz

Znaczenie osi, od najważniejszej:

1. `gx + gy + z`: przekątna plus piętro, dalej = mniejsza suma;
2. `z` przy równej sumie;
3. `gx`: remis przekątnej, żeby kolejność była pełna i nie zależała od kolejności wywołań.

Wystarczy, bo z sumy, `z` i `gx` da się odtworzyć `gy`, więc dwa różne kafelki nigdy nie dostaną tego samego klucza (przy kroku ≤ 1 kafelka).

Klucz nie zależy od proporcji kafelka, więc jeden tryb obsługuje rzut 2:1 i romby 1:1. Rzut siatki na ekran liczy gra, nie Aurora.

## Decyzja: podmiana wartości osi `y`, reszta mechanizmu bez zmian

Obecny mechanizm (siatka osi, `origin`/`step`/`count`/`weight` na 3 sloty, pierwsza oś najważniejsza) zostaje. W trybie `"gx+gy+z"` zmienia się tylko to, co trafia do slotu `y`:

- slot `x` = `gx` (`sortPoint.x`), bez zmian;
- slot `y` = `gx + gy + z` zamiast `sortPoint.y`;
- slot `z` = `z`, bez zmian (dalej `zRange`);
- kolejność osi (`sortAxes`) = `[1, 2, 0]`: suma, `z`, `gx`.

Dzięki temu `step.y` oznacza krok sumy, jak zakłada `todo.md`: np. `{ x: 1, y: 0.125, z: 1 }` daje sumę co 1/8 kafelka, więc postacie między kafelkami mają ułamkowe `gx`/`gy`. `SortParams`, bufor uniformu i licznik „sort depth used %” zostają bez zmian.

Odrzucone: ogólna macierz przekształcenia punktu w uniformie. Daje więcej, niż potrzebujemy, zmienia układ `SortParams` i dokłada mnożenie macierzy do hot pathu na CPU. Jeden tryb wystarczy na przełącznik.

## Kroki

1. **`urp/urp.ts`**: do `SortMode` dopisać `"gx+gy+z"`. Bez spacji, jak pozostałe tryby.
2. **`urp/passes/draw.ts`**:
   - Konstruktor: parsowanie przez `split("+")` + `"xyz".indexOf` nie obsłuży tej nazwy, więc tryb trzeba rozpoznać jawnie i ustawić `sortAxes = [1, 2, 0]` oraz flagę (np. `isoSort`).
   - `instance`: przy flagi zakres `minY/maxY` liczyć z sumy `sortX + sortY + sortZ`, bo `origin[1]`/`count[1]` muszą opisywać sumę. Zakres `x` bez zmian, `z` dalej z `zRange`.
   - `sortKey`: przy flagi wartość slotu 1 to suma trzech składowych punktu. To hot path, więc suma inline, bez helpera. Liczyć ją jak shader w float32: `Math.fround(Math.fround(x + y) + z)`. Inaczej na granicy kroku CPU i GPU mogą dać różne indeksy (zasada: `sortKey` ↔ `sortDepth` zmieniane razem).
   - `createPipelines`: nowa stała `isoSort` w `constants`.
3. **`urp/shaders/draw.wgsl`**: `override isoSort: bool = false;`. W `sortDepth` przed liczeniem indeksu podmienić `y` punktu na `point.x + point.y + point.z` (`select` po `isoSort`). Komentarz przy `sortDepth` dalej odsyła do `sortKey`.
4. **`urp/draw.ts`, jawny punkt**: w izometrii punkt liczony automatycznie (ekranowe `x`/`y` + zaczep) nie ma sensu. `DrawStyle.sort` już istnieje i jest przekazywany do tekstu (`drawRun`, `blockSort`) i quada, więc API się nie zmienia. W `DrawApi.instance` i miejscach, które same liczą punkt (quad, tekst): gdy tryb passa to `"gx+gy+z"`, a `sort` nie podano, **ostrzeżenie raz** (zbiór `warned`) i fallback na obecny punkt. Nie assert: jeden zapomniany element nie może wywalić klatki.
5. **Sandbox**:
   - `src/sandbox/index.ts`: dopisać tryb do `SORT_MODES`. Przy przełączaniu klawiszem `M` na `"gx+gy+z"` podać osobny `step` (`{ x: 1, y: 0.125, z: 1 }`), bo obecny `SORT_CONFIG.step` jest w pikselach ekranu.
   - Nowy test `src/sandbox/tests/iso.ts` (tu wyjątek, bez sceny nie da się sprawdzić trybu): mała siatka kafelków 2:1 z rzutem po stronie testu, na kilku kafelkach słupki różnej wysokości (`z`), jedna postać (prostokąt) chodząca po ułamkowych `gx`/`gy` między nimi, wszystko z jawnym `sort: { x: gx, y: gy, z }`. Rząd opaque i rząd półprzezroczysty, jak w `sort.ts`, oraz rysowanie w odwróconej kolejności co kilka sekund: wynik nie może zależeć od kolejności wywołań. Podpięty zakomentowaną linią jak inne testy.
6. **Dokumentacja**:
   - `plans/CLAUDE.md` → URP → Sortowanie: dopisać tryb i to, że wymaga `DrawStyle.sort` we współrzędnych siatki.
   - `todo.md`: z wpisu „Izometria” usunąć punkty o kluczu, `step` i jawnym punkcie (zrobione). Zostają duże obiekty, podłoga i odesłanie do heightmapy. Usunąć też „sortowanie izo” z listy na końcu.

## Czego nie robimy

- Rzut siatki na ekran (`screenX/screenY` z `gx, gy, z`): to rzecz gry albo przyszłego modułu siatki.
- Obiekty na wielu kafelkach, podłoga jednym wywołaniem, heightmapa: zostają w `todo.md`.
- Liczenie punktu siatki z pozycji ekranowej (odwrotny rzut): Aurora nie zna wymiarów kafelka.
- Zmiany w `SortParams`, `INSTANCE_FIELDS` ani sortowaniu GUI.

## Sprawdzenie

Typecheck. Scena `iso.ts`: postać przechodząca między słupkami chowa się za tymi o większej sumie i jest przed tymi o mniejszej, a wyższy słupek na tym samym kafelku nie znika za niższym. Opaque i transparent zachowują się tak samo, zamiana kolejności wywołań niczego nie zmienia. `sort.ts` w starych trybach wygląda jak przed zmianą. Licznik „sort depth used %” w profilerze pozostaje daleko od 100.
