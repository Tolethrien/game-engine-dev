# Kerning, etap 2/3: TextLayout i Draw.text

**Agent: worker junior.** Wymaga: `text-kerning-1-source.md` zrobionego i po review. Następny etap: `text-kerning-3-textbox.md`.

## Wspólne dla etapów kerningu

- Kontekst: `todo.md` → Tekst: „Kerning w dynamicznym atlasie: brak. Pary z `measureText` z cache'em albo odczyt z TTF.”
  - Zakres: tylko fonty `dynamic` (GUI), pary z `measureText` z cache'em (etap 1).
  - MTSDF i grid zostają bez kerningu. Nie mają `FontData.kerning`, więc layout nic nie dolicza.
- Zasady kodu z głównego `CLAUDE.md`:
  - bez opisowych komentarzy i opisów w interfejsach;
  - stałe należące do jednej rzeczy zebrać w obiekt, a nie jako luźne `const` na górze pliku;
  - nazwy bez jednoliterowych skrótów.
- Sandbox i testy: zmieniać tylko tam, gdzie zmienia się API. Nie dodajemy nowych scen testowych.

## Cel

`Draw.text` i `TextLayout.measure` stosują kerning z etapu 1 (`FontData.kerning?(left, right)`, wartość w jednostkach fontu, jak `advance`).

## Decyzje

- **Kerning tylko wewnątrz słowa**: między dwoma sąsiednimi znakami, z których żaden nie jest spacją ani `\n`. Dzięki temu etap 3 nie musi ruszać logiki spacji i justify.
- **Opcja `kerning: boolean`** (domyślnie `true`) w propsach `Draw.text`, obok `letterSpacing`. Wyłączenie przydaje się w licznikach i timerach, które nie powinny „skakać” przy zmianie cyfr.
- **Kolejność na piórze**:
  1. `advance` poprzedniego znaku,
  2. `+ kerning(poprzedni, obecny) * scale`,
  3. `+ letterSpacing`,
  4. `place`.

## Kroki

1. **`text/textLayout.ts`**:
   - Statyczny helper `kerning(font, left, right)`. Zwraca 0, gdy font nie ma `kerning`, gdy któryś kod to spacja albo `\n` i gdy nie ma poprzedniego znaku. Użyje go też etap 3.
   - `walk`: zapamiętuje poprzedni kod i zeruje go na `\n` i na spacji. Kerning dodaje przed `place` oraz przy liczeniu szerokości.
   - `layout` i `measure` dostają parametr `kerning` (domyślnie `true`). `measure` musi zwracać dokładnie tę szerokość, którą zajmie narysowany tekst.
2. **`urp/draw.ts`**: dodać `kerning?` do typu `DrawText` i przekazać do `TextLayout.layout`. `glyph` (pojedynczy znak) zostaje bez zmian.

Sandbox bez zmian, bo nowa opcja ma wartość domyślną.

## Weryfikacja

- Typecheck przechodzi.
- `textWorld.ts` / `textGui.ts`: pary typu „To”, „Wa” są wizualnie ciaśniejsze. Centrowanie po `TextLayout.measure` w `textWorld.ts` nadal trzyma środek.
- `TextBox` jeszcze się nie zmienia, więc ten sam tekst może wyglądać inaczej niż w `Draw.text`. Tak ma być aż do etapu 3.

## Czego nie robimy

- `TextBox`.
- Kerningu w `Draw.glyph`.
- Nowych scen testowych.
