[zrobione]

# Rozmycie tła pod elementem GUI (`backdrop`, jak CSS `backdrop-filter`)

**Agent: worker senior.** Zależy od: `gui-box-shadow.md` [zrobione] (kształty cieni, gałąź „pomija materiał” przed `material()`, `DrawGuiExtra`, `TRANSPARENT_SHAPE_MASK`).

Źródło: `todo.md` → wpis „efekty warstwy GUI: … blur tła” (dopisany przy cieniach).

## Cel

`DrawGui.rect/circle/sprite` dostają `backdrop: { blur }` (na razie tylko blur, inne filtry w `todo.md`). Pod kształtem rozmyte jest **wszystko, co już leży za nim**: scena świata i elementy GUI narysowane wcześniej w tej klatce. Na to normalnie kładzie się kolor boxa (półprzezroczysty = tint), obrys i cienie. Semantyka jak CSS `backdrop-filter`: zagnieżdżone szkło rozmywa także szkło pod sobą.

Blur tego, co zostanie narysowane **później** (przed elementem), to post-process i nie należy do tego planu.

## Dlaczego pass `gui` musi się ciąć

W WebGPU nie da się próbkować tekstury, do której ten sam render pass właśnie pisze. Żeby element widział GUI narysowane przed nim, w miejscu tego elementu trzeba:

1. zamknąć render pass `gui`,
2. zrobić zrzut „scena + GUI do tej pory” w obszarze elementu i go rozmyć,
3. otworzyć render pass z powrotem (`loadOp: load`) i rysować dalej, zaczynając od instancji backdropu, która próbkuje rozmyty zrzut.

Przeglądarki robią to samo: `backdrop-filter` tworzy osobną warstwę kompozycji. Osobny pass w grafie (poprzednia wersja tego planu) odpada: widzi tylko świat, nie wcześniejsze GUI.

## Decyzje

### `DrawPass` → `MultiPass`

`DrawPass` przechodzi z `RenderPass` na `MultiPass` i sam otwiera kroki przez `ctx.beginRender(label, { colors, depth })`. Świat ma zawsze jeden krok (opaque + transparent jak dziś, pierwszy krok z `clear` = `canvasColor`, depth z `clear` 1). GUI ma tyle kroków, ile grup backdropu + 1. Jedna klasa, jedna ścieżka. Nie robimy osobnej klasy `GuiDrawPass`, bo cała reszta (bufory, materiały, pipeline'y) jest wspólna.

Sprawdzić przy przejściu: kto w `MultiPass` stosuje `clearValue` z `res.create`. `beginRender` robi `clear` tylko przy jawnym `target.clear`, więc pierwszy krok musi go podać sam. Timestampy per krok przychodzą z grafu za darmo.

### Grupy backdropu: jeden zrzut na wiele elementów

Cięcie na każdy element byłoby drogie przy liście szklanych przycisków z tekstem. Zasada łączenia:

- **Grupa** zaczyna się przy pierwszym backdropie. Punkt zrzutu = indeks jego instancji w buforze transparent. GUI ma `mode: "none"`, bufor jest w kolejności wywołań i nie jest sortowany, więc indeksy są stabilne.
- Każdy następny backdrop **dołącza do otwartej grupy**, jeśli jego obszar odczytu (AABB kształtu + 3σ) nie przecina **sumy AABB wszystkiego, co narysowano od punktu zrzutu**. Nic, co powinien widzieć, nie powstało po zrzucie, więc może użyć tego samego zrzutu. W przeciwnym razie otwiera nową grupę.
- Suma AABB to cztery liczby, więc test jest O(1) i bez alokacji. Śledzić ją tylko wtedy, gdy grupa jest otwarta (w klatce bez backdropu zero kosztu). AABB liczy `DrawApi` przy zapisie instancji: rotacja konserwatywnie, cień zewnętrzny z padem jak w vertexie, quad z punktów.
- Pionowa i pozioma lista przycisków ze szkłem i tekstem mieści się w jednej grupie. Siatka albo nachodzące na siebie szkła dadzą więcej grup, co jest poprawne, bo wtedy naprawdę się widzą. Licznik `backdrop groups` w `counters()`.

Dane grupy (w `DrawPass`, zerowane w `beginFrame`): indeks startu, region odczytu (suma obszarów członków, px canvasa), największa σ (→ ile poziomów piramidy).

### Zrzut i rozmycie grupy

- `temp("backdrop", { size: { scale: 0.5, base: "canvas" }, format: "rgba16float", mips: 6 })` w `resources`, tylko gdy pass ma opcję `backdrop` (nazwa sceny, w presecie `"offscreenCanvas"`). Jeden temp na całą klatkę, grupy nadpisują go po kolei, a kolejność w encoderze to gwarantuje.
- **Mip 0 = połowa canvasa**, już po pierwszym downsamplu. Przy samym blurze ostry poziom w pełnej rozdzielczości nic nie daje, a w 4K kosztowałby ~90 MB zamiast ~22 MB. Najmniejszy możliwy blur to więc ok. 1–2 px. Przy filtrach bez blura (`todo.md`) trzeba będzie wrócić do ostrego mipa 0.
- GUI deklaruje dodatkowo `read("offscreenCanvas")`. Zrzut składa GUI over scena w liniowym premultiplied, tym samym wzorem co `present.wgsl`. `gui` zależy wtedy od świata, co jest akceptowalne, bo `present` i tak zależy od obu.
- Krok poziomu 0: skład (scena + `gui`) z downsamplem 13-tap do mipa 0. Dalej `mip i-1 → mip i` tym samym filtrem (Jimenez, „Next Generation Post Processing in Call of Duty: AW”). Każdy poziom jest więc już rozmyty, nie tylko zmniejszony. Źródło kroku to widok innego mipa tej samej tempy (`ctx.output("backdrop", i-1)`), a WebGPU pozwala próbkować mip inny niż ten, do którego piszemy. Czytanie `gui` między krokami jest w porządku, bo to własny output w osobnym kroku.
- **Tylko region grupy**: każdy krok ze scissorem do regionu przeskalowanego na dany poziom. Koszt jest proporcjonalny do pola szkła, nie ekranu. Filtr czyta ±2 teksele źródła, a próbkowanie w GUI (bicubic) też sięga poza, więc region powiększyć o margines rosnący w dół piramidy, np. 3σ + `2^(poziom+2)` px canvasa. Poza regionem tempa ma śmieci z poprzedniej grupy i nie może ich być w próbkowanym obszarze.
- Tylko tyle poziomów, ile potrzebuje największa σ w grupie (+1 na mieszanie).

### Odczyt w shaderze `draw.wgsl`

- `BINDS` dostaje `backdrop: { binding: 1, type: "texture" }`, a shader `@group(2) @binding(1) var backdrop: texture_2d<f32>`. GUI binduje tempę (wszystkie mipy). Świat ma ten sam shader i układ grupy 2, więc binduje **placeholder 1×1** tworzony w `setup` i niszczony w `destroy`, z komentarzem dlaczego.
- `SHAPE_BACKDROP` (11) na końcu `SHAPE`, w `TRANSPARENT_SHAPE_MASK`. Gałąź obok `shadowCoverage`, przed `material()`, bez pochodnych.
- UV = `in.position.xy / frame.canvasSize`. Tempa jest liczona od canvasa, więc mapowanie nie zależy od tego, jak present skaluje scenę.
- `blur` jak w CSS `backdrop-filter: blur(r)`: **r = σ w px canvasa**. Uwaga: w `DrawShadow` blur = 2σ, jak w `box-shadow`. Obie semantyki są z CSS, zapisać to w komentarzu przy typach. Poziom ≈ `log2(σ)` minus stała, skalibrować w sandboxie obok cienia o tym samym σ. Przyciąć do poziomów, które grupa policzyła.
- Próbkowanie: dwa sąsiednie całkowite poziomy, każdy bicubic B-spline (4 próbki bilinear), `mix` po ułamku. Sam bilinear z małego mipa daje kwadraty. Z całkowitym poziomem `linearClamp` wystarcza, samplerów nie ruszamy.
- Wynik = rozmyty zrzut × `shape` (pokrycie boxa z AA). Zapis „over” do `gui` daje w środku kształtu dokładnie rozmyte tło (alfa 1), a na krawędzi AA mieszankę. Zaokrąglenia i rotacja działają same, bo próbkujemy po pozycji ekranu.

### Instancja i API

| pole | wartość |
|---|---|
| `position/size/rotation/radius` | geometria boxa (jak cień) |
| `color` | biały (tylko żeby `instance()` nie odrzucił alfy 0) |
| `params` | `blur, 0, 0, 0` |

Kolejność w `rect/circle/sprite`: `cienie zewnętrzne → backdrop → box → cienie wewnętrzne`. Punkt zrzutu grupy wypada **na instancji backdropu**, więc cień zewnętrzny tego samego elementu jest już w zrzucie i rozmyje się pod szkłem. To poprawne i nie ma znaczenia, bo cień jest przycięty pod boxem.

Materiał jak przy cieniu: ten sam co box, przy additive `DEFAULT_MATERIAL`. Batch łamie się tylko na granicach grup (koniec kroku), pętla ciągów materiału w `execute` dostaje dodatkowy warunek końca na indeksie zrzutu.

Przełącznik: opcję konstruktora `shadows` zamienić na jedną `guiEffects: true` (cienie + backdrop). `DrawGuiExtra.backdrop?: DrawBackdrop`.

## Kroki

1. `urp/passes/draw.ts`: `MultiPass`, kroki per grupa, tempa, `read("offscreenCanvas")` dla GUI, placeholder dla świata, binding, licznik grup. Najpierw samo przejście na `MultiPass` bez backdropu i sprawdzenie w sandboxie, że świat i GUI wyglądają identycznie.
2. `urp/shaders/backdrop.wgsl`: skład 1:1 (poziom 0, dwa źródła) i downsample 13-tap (kolejne poziomy), przez `override` albo osobne entry.
3. `urp/draw.ts`: `DrawBackdrop`, `guiEffects`, `SHAPE.BACKDROP`, zapis w `rect/circle/sprite`, AABB instancji i grupowanie (grupowanie może żyć w `DrawPass`, który dostaje prostokąt od fasady).
4. `urp/shaders/draw.wgsl`: stała kształtu, binding, gałąź backdropu.
5. Sandbox: ruchomy świat + panele GUI pod szkłem; szkło nad innym panelem GUI (musi się rozmyć); zagnieżdżone szkło; pionowa lista szklanych przycisków z tekstem (licznik: 1 grupa); siatka nachodzących szkieł (więcej grup, poprawny obraz); obrót, zaokrąglenia, tint, obrys, cień; klatka bez backdropu (zero dodatkowych kroków w profilerze).
6. Dokumentacja: `plans/CLAUDE.md` (DrawPass jako `MultiPass`, grupy backdropu, binding grupy 2, `SHAPE_BACKDROP`, `guiEffects`, API) i `todo.md`: usunąć „blur tła” z wpisu o efektach warstwy GUI.

## Czego nie robimy

- Backdropu w `Draw` (świat) i na tekście.
- Innych filtrów z `backdrop-filter` niż blur (zapisane w `todo.md`).
- Blura „do przodu” (post-process).
- Mądrzejszego grupowania niż suma AABB (np. lista prostokątów). Najpierw zmierzyć licznikiem grup na prawdziwym UI.
