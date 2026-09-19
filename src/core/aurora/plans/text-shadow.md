[zrobione]

# Cień tekstu w GUI

**Agent: worker mid.** Zależy od: `gui-box-shadow.md` (typ `DrawShadow`, `DrawGuiExtra`, opcja `shadows`, `diagnostic(off, derivative_uniformity)`, gałąź cienia przed `material()`).

Źródło: `todo.md` → Draw → „Cień tekstu i kształtów” (część o tekście).

## Cel

`DrawGui.text`, `textBox` i `glyph` przyjmują ten sam `shadow` co boxy. Działa jak underlay w TextMeshPro: cień liczony per glif z pola odległości, które glify już mają. Bez nowego passa i bez nowych pól instancji.

## Dlaczego nie osobny pass

GUI rysuje w kolejności drzewa w jednym passie. Cień z osobnego passa (maska → blur → złożenie) nie wejdzie między panel a tekst. Trzeba by ciąć GUI na kawałki przy każdym cieniu, czyli kilka passów na jeden napis. Pole odległości wystarcza na typowy cień tekstu UI (mały offset, lekki blur).

## Decyzje

### Warstwa cienia

Tekst ma dziś warstwy obrys → wypełnienie (`textLayers`, `drawRun`, `glyph`). Cień dochodzi na początku:

```
cienie wszystkich liter (każdy cień z listy osobno, od końca listy) → obrysy → wypełnienia
```

Wszystkie z jednym punktem sortowania napisu i tym samym materiałem, więc batch się nie łamie. Przy materiale additive cień idzie na `DEFAULT_MATERIAL`, jak w boxie. Zapis przez wspólny `writeGlyph`. Warstwę trzeba rozróżniać (wypełnienie / obrys / cień), zamiast obecnego `DrawOutline | null`, ale zrobić to tak, żeby hot path nie alokował (dziś `textLayers` zwraca stałą tablicę albo nową dwuelementową, to samo podejście albo scratch).

`inset` przy tekście nie ma sensu: ignorować i ostrzec raz (`warned`).

### Kształty i pakowanie

Nowe `SHAPE_GLYPH_SHADOW` i `SHAPE_MTSDF_SHADOW` na końcu `SHAPE`, za cieniami boxa. W shaderze wchodzą do `maskGlyph` / `msdfGlyph` (próbkowanie pola jak u pozostałych glifów).

| pole | wartość |
|---|---|
| `position` | kwadrat glifu **przesunięty o offset** na CPU (offset dowolny, nie zjada zasięgu pola) |
| `size/uvRect/layer/radius` | jak glif (radius.x = zasięg pola, yzw = blok UV, nieużywany, ale zapis jak zwykle) |
| `color` | kolor cienia |
| `outlineWidth` | `blur` |
| `params.x` | `spread` (dilate), reszta 0 |

`rotation` zostaje wolne pod obracany tekst.

### Shader

W gałęzi cienia z `gui-box-shadow.md`: pokrycie = `1 − smoothstep` po `glyphDist − spread` o szerokości `max(blur, glyphAa)`, wyśrodkowane na krawędzi. Dobrać szerokość przejścia tak, żeby ten sam `blur` wyglądał podobnie jak na boxie (gauss 2σ daje przejście szerokości mniej więcej 2 × blur). Nie da się tego zrobić dokładnie, bo pole nie jest splotem, więc sprawdzić na oko w sandboxie obok boxa. `glyphAa` już jest liczony poza gałęziami.

### Zasięg pola (ograniczenie)

Pole sięga `glyph.range × px na teksel` (maski: `fontAtlas.spread`, MTSDF: połowa `distanceRange`, skalowane). Dalej odległość się nasyca i cień wypełniłby cały kwadrat. W `writeGlyph`, analogicznie do obrysu: `spread + blur` przycinać do `zasięg − 1` z ostrzeżeniem raz (osobny wpis w `warned`, komunikat jak `warnOutline`: podnieść `fontAtlas.spread` albo `-pxrange` MTSDF). Blur zmniejszać przed spreadem.

Znane, akceptowane (zapisać w `todo.md`):
- cienie sąsiednich liter składane przez „over” odbiegają lekko od rozmycia całego napisu tam, gdzie pola się stykają; przy małym blurze niewidoczne,
- przez półprzezroczysty tekst prześwituje jego cień (brak przycięcia pod literą, TMP też go nie robi).

## Kroki

1. `urp/draw.ts`: kształty, `shadow` w `DrawText`/`DrawTextBox`/`DrawGlyph` przez `DrawGuiExtra` (tylko GUI, jak w planie 1), warstwa cienia w `drawRun` i `glyph`, clamp i ostrzeżenia w `writeGlyph`.
2. `urp/shaders/draw.wgsl`: stałe kształtów, dołączenie do `maskGlyph/msdfGlyph`, pokrycie cienia glifu w gałęzi cienia.
3. Sandbox: tekst z cieniem dla fontu grid, dynamic i MTSDF; cień + obrys; kilka cieni; blur ponad zasięg (ostrzeżenie); tekst z cieniem obok boxa z tym samym `shadow` (porównanie blur).
4. Dokumentacja: `plans/CLAUDE.md` (tekst: warstwa cienia, nowe kształty, pakowanie), `todo.md`: usunąć wpis „Cień tekstu i kształtów”, dopisać znane ograniczenia z tego planu.

## Czego nie robimy

- Cienia tekstu w `Draw` (świat).
- Poświaty szerszej niż pole i miękkiego cienia pod całym napisem jako jednej masy. To efekt warstwy GUI z osobnym passem (wpis w `todo.md` z planu 1).
- Zmiany domyślnego `fontAtlas.spread`.
