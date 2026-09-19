# Kerning, etap 3/3: TextBox + dokumentacja

**Agent: worker senior.** Wymaga: `text-kerning-2-layout.md` zrobionego i po review.

## Wspólne dla etapów kerningu

- Kontekst: `todo.md` → Tekst: „Kerning w dynamicznym atlasie: brak. Pary z `measureText` z cache'em albo odczyt z TTF.”
  - Zakres: tylko fonty `dynamic` (GUI), pary z `measureText` z cache'em (etap 1).
  - MTSDF i grid zostają bez kerningu.
- Zasady kodu z głównego `CLAUDE.md`:
  - bez opisowych komentarzy i opisów w interfejsach;
  - stałe należące do jednej rzeczy zebrać w obiekt, nie jako luźne `const` na górze pliku;
  - nazwy bez jednoliterowych skrótów.
- Sandbox/testy: ruszać tylko tam, gdzie zmienia się API. Nie dodajemy nowych scen testowych.

## Cel

`TextBox` w kierunku `row` stosuje kerning spójnie w czterech miejscach: przy zawijaniu, przycinaniu z wielokropkiem, `fit` i rozmieszczaniu glifów.

## Decyzje

- Zasady jak w etapie 2:
  - kerning tylko wewnątrz słowa;
  - liczony helperem `TextLayout.kerning`;
  - opcja `kerning` w `TextBoxOptions`/`DEFAULTS`, domyślnie `true`. Zmianę opcji łapie istniejące `set` → `dirty`.
- **Kolumny (`col`) bez kerningu**, bo tekst jest pionowy.
- **Wielokropek nie jest kernowany**: ani względem ostatniej litery, ani między własnymi znakami. `limit` liczy go bez kerningu i `placeRows` stawia go tak samo, więc `lineExtent` zgadza się z rozmieszczeniem.
- **Niezmiennik do pilnowania**: suma, którą `wrapWords` i `trimLine` wpisują do `lineExtent`, musi być równa drodze pióra w `placeRows`. Inaczej rozjadą się `align: end/center/justify` i wielokropek.

## Kroki (`text/textBox.ts`)

1. **`wrapWords`**: funkcja `measure` dostaje też poprzedni kod w słowie: `measure(previous, code)`, `previous = -1` na początku słowa. W `row` dolicza kerning, w `col` go ignoruje.
2. **`trimLine`**: przy cofaniu `end` odejmuje advance + spacing znaku **oraz** kerning pary `(codes[end - 1], codes[end])`, jeśli oba znaki są w tym samym słowie.
3. **`limit`**: szerokość wielokropka liczona bez kerningu. `measure` wywołać tak, żeby nie liczył par.
4. **`placeRows`**: `pen += kerning` przed `run.place`. Poprzedni kod zerowany na spacji i przed wielokropkiem.
5. **`fits` / `fitSize`**: bez zmian, działają na `lineExtent`, więc dostosują się same. Sprawdzić tylko, że `fit` przy fontach dynamic (wiele rozmiarów) nie mierzy par od nowa. Tabela jest per rodzina od etapu 1, więc nie powinien.

## Dokumentacja (na koniec całości)

- **`src/core/aurora2/plans/CLAUDE.md`** → sekcja Tekst: zamienić „Brak kerningu.” na krótki opis:
  - tylko fonty dynamic: pomiar przez `measureText` (normal − none), tabela per rodzina przy rozmiarze referencyjnym;
  - MTSDF i grid bez kerningu;
  - tylko wewnątrz słów, bez kolumn i wielokropka;
  - opcja `kerning` w `Draw.text` i `TextBox`.
- **`todo.md`**:
  - zamienić punkt „Kerning w dynamicznym atlasie” na krótką notkę: kerning MTSDF odłożony, bo w świecie niepotrzebny. Jeśli kiedyś będzie potrzebny: msdf-atlas-gen czyta tylko tabelę `kern`, a Lato i BlackOps mają pary w `GPOS`. Droga: `fontgen` (`C:\coding\tools\fontgen`) dopisuje pary z `GPOS` do `json.kerning` przez `opentype.js`, a `fromMTSDF` ustawia z nich `FontData.kerning`;
  - usunąć słowo „kerning” z „plan na teraz”.
- **Pliki `text-kerning-*.md`**: dopisać `[zrobione]` na górze (zgodnie z głównym `CLAUDE.md`).

## Weryfikacja

- Typecheck przechodzi.
- Istniejące TextBoxy w `textGui.ts` i `textWorld.ts`:
  - przy `wrap` linie nie wychodzą poza `width`;
  - przy `align: end` linie kończą się równo na prawej krawędzi;
  - wielokropek (`ellipsis`) mieści się w szerokości;
  - `justify` wyrównuje obie krawędzie;
  - `fit` daje rozmiar, przy którym tekst się mieści.
- Ten sam tekst w `Draw.text` i w `TextBox` bez ograniczeń (`width` undefined, `align: start`) daje identyczne pozycje glifów.

## Czego nie robimy

- Kerningu w kolumnach.
- Kerningu wielokropka i par ze spacją.
- Zmian w `TextRun` i w shaderze.
