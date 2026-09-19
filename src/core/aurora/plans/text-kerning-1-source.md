# Kerning, etap 1/3: źródło par (fonty dynamic)

**Agent: worker mid.** Zależy od: nic. Następny etap: `text-kerning-2-layout.md` (po review).

## Wspólne dla etapów kerningu

- Kontekst: `todo.md` → Tekst: „Kerning w dynamicznym atlasie: brak. Pary z `measureText` z cache'em albo odczyt z TTF.” Wybieramy `measureText` z cache'em.
- **Zakres: tylko fonty `dynamic`** (GUI). MTSDF (świat gry) i grid zostają bez kerningu.
- Zasady kodu z głównego `CLAUDE.md`:
  - bez opisowych komentarzy i opisów w interfejsach;
  - stałe jednej rzeczy zebrać w obiekt (np. `KERNING = { referenceSize, ... }`), zamiast luźnych `const` na górze pliku;
  - nazwy bez jednoliterowych skrótów.
- Sandbox i testy: ruszać tylko tam, gdzie zmienia się API. Nie dodajemy nowych scen testowych.

## Dlaczego dynamic dziś nie ma kerningu

Przeglądarka zna kerning fontu, ale stosuje go tylko przy układaniu całego napisu. Aurora robi to inaczej:
- `DynamicFont.resolve` rasteryzuje każdą literę osobno;
- `advance` bierze z `measureText` pojedynczego znaku;
- litery rozstawia sama, w `TextLayout` i `TextBox`.

Pary trzeba więc wyciągnąć z przeglądarki i doliczyć w layoucie.

## Cel

Font dynamic umie odpowiedzieć: „o ile przesunąć pióro między znakiem A i B”. W tym etapie layoutu jeszcze nie ruszamy.

## Ustalenia (sprawdzone)

`DynamicFont` ma jeden statyczny scratch `OffscreenCanvas` z `willReadFrequently: true`. Ta flaga jest potrzebna do `getImageData` przy rasteryzacji. `measureText` działa na tym samym kontekście i flaga mu nie przeszkadza. **Nie tworzymy drugiego canvasa.**

## Decyzje

1. **Pomiar pary** = `measureText(ab).width` przy `fontKerning = "normal"` minus to samo przy `fontKerning = "none"`.
   - Nie używamy `w(ab) − w(a) − w(b)`, bo przy ligaturach (np. „fi” w Lato) daje błędne wartości. Przy odejmowaniu ligatura jest w obu pomiarach i się znosi.
   - Kontekst jest współdzielony, więc `fontKerning` ustawiamy **jawnie przy każdym pobraniu kontekstu**. Rasteryzacja glifów dostaje zawsze `"normal"`.
2. **Tabela per rodzina, nie per rozmiar.**
   - Mierzymy przy stałym rozmiarze referencyjnym (np. 100 px), a font skaluje wynik przez `size / referenceSize`.
   - Powód: `DynamicFont` powstaje osobno dla każdego rozmiaru, a `TextBox` z `fit` odpytuje wiele rozmiarów. Bez wspólnej tabeli te same pary byłyby mierzone wielokrotnie.
3. **Leniwie, z cache'em.** Zera też zapisujemy. Klucz liczbowy `left * 0x110000 + right` w `Map<number, number>`. To hot path (layout co klatkę), więc bez stringów i alokacji.
4. `FontData.kerning?(left, right): number` zwraca wartość w jednostkach fontu, tak jak `advance` (przy `font.size`). Mnożenie przez `scale` robi layout. Pole jest opcjonalne: MTSDF i grid go nie mają, a layout wtedy nic nie dolicza.

## Kroki

1. **Nowy `text/fontCanvas.ts`**: wydzielić ze `DynamicFont`
   - współdzielony scratch canvas: `scratch(width, height)` z ustawianiem `font` i `fontKerning`,
   - `load` / `family`, czyli rejestrację `FontFace` pod nazwą `aurora-${name}`.

   `DynamicFont` korzysta z nowego pliku, a jego zachowanie się nie zmienia.
2. **Nowy `text/kerning.ts`**: tabela par jednej rodziny. Mierzy leniwie przez `fontCanvas` przy `referenceSize` i zwraca wartość przy tym rozmiarze. Warunek: tani hot path.
3. **`text/font.ts`**: dodać `FontData.kerning?`.
4. **`text/dynamicFont.ts`**: konstruktor dostaje tabelę rodziny. `kerning(left, right)` = wartość z tabeli × `size / referenceSize`.
5. **`assetManager.ts` → `setFonts`**:
   - mapa `name → tabela` dla fontów dynamic, podmieniana przy każdym `setFonts`, tak jak `dynamicFonts`;
   - `getFont` przekazuje tabelę do `new DynamicFont`.

## Weryfikacja

- Typecheck przechodzi.
- Tekst w sandboxie wygląda **identycznie jak dziś**, bo layout jeszcze nie używa kerningu.
- Tymczasowy `console.log` (usunąć przed oddaniem), dla dynamicznego Lato: pary `AV`, `To`, `Ty` dają wartości ujemne, a `oo` daje zero.
- **Jeśli wszystkie pary wychodzą 0** (np. `fontKerning` nic nie zmienia w OffscreenCanvas): zatrzymaj się i zgłoś. Nie zmieniaj metody na własną rękę.

## Czego nie robimy

- Kerningu dla MTSDF i grid.
- Parsera TTF/GPOS.
- Zmian w `TextLayout`, `TextBox` ani `Draw`.
