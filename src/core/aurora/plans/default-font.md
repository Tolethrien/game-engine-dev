[zrobione]

# Wbudowany font domyślny

**Agent: worker junior.** Zależy od: nic.

Źródło: `todo.md` → Fonty: „Domyślny font pod indeksem 0: nieustalone”.

## Stan

- Asset już jest: `src/core/aurora2/assets/fallbackFont.png`. To bajt w bajt ten sam plik co `src/sandbox/assets/fonts/testGrid/testGrid.png`: font `grid`, 16 kolumn komórek 16×30, znaki ASCII 32..126, potem `ąćęłńóśźżĄĆĘŁŃÓŚŹŻ`, baseline 25 (jak w `src/sandbox/index.ts`, `GRID_CHARS`/`GRID_CELL`).
- Dziś bez fontów w configu nie ma atlasu glifów (`pages = sources.length > 0 ? atlas.pages : 0`), a `getFont` z nieznaną nazwą rzuca assertem.

## Decyzja

Aurora zawsze wczytuje wbudowany font `grid` jako pierwszy, pod zarezerwowaną nazwą `"default"`, niezależnie od `config.fonts`. Działa to analogicznie do warstwy 0 tekstur: zawsze jest, czego użyć.

- **Zawsze wczytany:** `AssetManager.setFonts` dokłada źródło wbudowanego fontu **na początek** listy (pierwsze w atlasie glifów). Definicja (url z importu `./assets/fallbackFont.png`, `cell`, `chars`, `baseline`) jako jeden obiekt w `assetManager.ts` albo w `text/font.ts`, obok `DEFAULT_FALLBACK`. Bez luźnych stałych.
- **Nazwa zarezerwowana:** assert, gdy font użytkownika nazywa się `"default"`.
- **Atlas zawsze istnieje:** `pages` zawsze `atlas.pages`, `glyphAtlas` przestaje być nullowalny (usunąć `| null` i `!`).
- **Brakująca nazwa → font domyślny:** `getFont` z nieznaną nazwą zamiast assertu robi ostrzeżenie raz (zbiór `warned`, jak `getTexture`) i zwraca font domyślny. Literówka w nazwie fontu nie wywala gry, tekst dalej widać.
- **`font` opcjonalny:** w `DrawText`/`glyph` (`urp/draw.ts`) i `TextBoxOptions` (`text/textBox.ts`) pole `font?: string`, domyślnie `"default"`. Konstruktor `TextBox` przestaje wymagać `font`.

Koszt: gra bez własnych fontów i tak alokuje `fontAtlas.pages` stron (domyślnie 4 × 1024² RGBA = 16 MB). Tego nie optymalizujemy, gra bez tekstu może zmniejszyć `fontAtlas.pages` w configu. Font domyślny zajmuje ułamek jednej strony.

## Sandbox

- `src/sandbox/index.ts`: usunąć wpis `testGrid` z `fonts` oraz `GRID_CHARS`, `GRID_CELL` i import `testGrid.png` (duplikat fontu domyślnego).
- `src/sandbox/tests/textGui.ts` (i inne użycia `"testGrid"`): przejść na `"default"` albo pominąć `font`. W jednym miejscu zostawić wywołanie bez `font`, żeby test pokrywał wartość domyślną.
- Pliku `src/sandbox/assets/fonts/testGrid/testGrid.png` nie usuwać, decyzja użytkownika.

## Czego nie robimy

- Font domyślny nie jest fallbackiem **znaków** innych fontów (brakujący znak w `lato` dalej daje `*` z `lato`, nie literę z fontu domyślnego). Wymagałoby to mieszania metryk dwóch fontów w jednym `TextRun`. Dopisać do `todo.md` jako pomysł.
- Brak wczytywania fontu przed `Aurora.config` (atlas potrzebuje `fontAtlas` z configu, a przed configiem i tak nic się nie rysuje).

## Pliki

- `src/core/aurora2/assetManager.ts`: źródło wbudowane, zawsze atlas, `getFont` z fallbackiem.
- `src/core/aurora2/text/font.ts`: ewentualnie definicja fontu domyślnego obok `DEFAULT_FALLBACK`.
- `src/core/aurora2/urp/draw.ts`, `src/core/aurora2/text/textBox.ts`: `font` opcjonalny.
- Sandbox jak wyżej.
- `todo.md`: usunąć „Domyślny font pod indeksem 0”, dopisać pomysł z fallbackiem znaków.
- `plans/CLAUDE.md` → Tekst / Assety: font `"default"` (grid, zawsze wczytany, cel fallbacku nazwy), `font` opcjonalny.

## Sprawdzenie

Typecheck. Sandbox z `fonts: []` w configu: `Draw.text({ text: ... })` bez `font` rysuje tekst. Nieznana nazwa fontu daje jedno ostrzeżenie i tekst fontem domyślnym. `textGui` wygląda jak przed zmianą. Font o nazwie `"default"` w configu kończy się czytelnym assertem.
