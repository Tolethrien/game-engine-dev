[zrobione]

# Debugger 4: `PreviewPass`, podgląd tekstury na ekranie

**Agent: worker mid.** Zależy od: `debug-2-snapshot.md` (używa opisu zasobów klatki z `RenderGraph`, który tam powstaje).

Źródło: `todo.md` → Debugger → „Podgląd tekstur”.

## Co

Zwykły pass URP, który wstawiamy **ręcznie** na koniec presetu (po `PresentPass`), kiedy chcemy coś podejrzeć, i usuwamy, gdy już niepotrzebny. Nadpisuje canvas wybraną teksturą. Debugger nie ma z nim nic wspólnego, nic nie wstawia go automatycznie i nie ma go w domyślnym presecie. Wydajność nie ma znaczenia.

```ts
new PreviewPass({ texture: "depth" });
new PreviewPass({ asset: "fonts", layer: 1, channel: "a" });
```

Opcje (kierunek):

- `texture: string` (nazwa z grafu) **albo** `asset: AssetName` (`albedo`, `normal`, `height`, `ui`, `fonts`),
- `mip?` (domyślnie 0), `layer?` (domyślnie 0; dla assetów 0 to warstwa neutralna, więc przy assetach domyślnie 1, jeśli istnieje),
- `channel?: "rgb" | "r" | "g" | "b" | "a"` (domyślnie `rgb`; pojedynczy kanał w skali szarości, np. atlas fontów: A = pokrycie, R = SDF),
- `name?` (domyślnie `"preview"`, gdyby ktoś chciał dwa naraz na testy).

Wszystkie opcje są opcjonalne. Bez `texture`/`asset` pass startuje od pierwszej tekstury z listy klatki.

## Przełączanie w trakcie gry

Pass trzymamy w zmiennej i sterujemy nim z kodu (np. klawisz w sandboxie; podpięcie klawiszy nie należy do tego planu):

- `next()` / `prev()`: przejście po liście tekstur **użytych w bieżącej klatce**, z zawijaniem.
  - Lista pochodzi z opisu zasobów klatki z `RenderGraph` (plan 2): tekstury grafu w kolejności tworzenia, potem assety włączone w configu.
  - Bez `canvas`, tempów i bez tego, co dokłada sam `PreviewPass`, żeby podgląd nie wpływał na listę.
- `select(name)`: przejście do konkretnej tekstury grafu albo assetu.
- `visible` (albo `show()`/`hide()`): `enabled()` zwraca `false`, pass wypada z klatki i widać normalny obraz. Bez rebuildu.
- `mip`, `layer`, `channel` zmieniane w locie: idą do uniformu passa, bez rebuildu. Clamp do liczby mipów/warstw bieżącej tekstury.
- Przy zmianie tekstury `console.info` z nazwą, formatem i rozmiarem (to debug pass, log jest OK).

**Dlaczego zmiana tekstury robi `RenderGraph.rebuild()`:**

- Odczyt jest deklarowany w `resources()`, a graf na tej podstawie liczy `lastUse` i oddaje tekstury do puli. `resources()` jest wołane tylko przy budowie.
- Inny format (depth vs kolor vs tablica) potrzebuje też innego pipeline'u w `setup`.
- Rebuild jest async, więc przez chwilę widać poprzedni podgląd; nowszy build unieważnia starszy (`buildId`), więc szybkie przełączanie jest bezpieczne.

**Czego nie robimy:** deklarowania odczytu wszystkich tekstur naraz, żeby uniknąć rebuildu. Trzymałoby to każdą teksturę do końca klatki i zmieniało zachowanie grafu (pula, ostrzeżenia o nieczytanych zapisach), a podgląd nie może wpływać na to, co podgląda.

Bez wyboru z profilera i bez API w debuggerze.

## Jak działa w grafie

- `resources`: `read(texture)` albo `readAsset(asset)` + `writeCanvas({loadOp: "clear"})`.
  - Graf sam trzyma teksturę do końca klatki (`lastUse`), a przy `modify` daje ostatnią wersję.
  - Jeśli tekstura nie została w tej klatce zapisana, pass wypada normalnym mechanizmem i widać zwykły obraz.
  - Nieznana nazwa → istniejący assert w `validatePass`. To kod pisany ręcznie, więc crash z czytelnym komunikatem jest OK.
- Tempy `MultiPass` nie są podglądalne.
- Typ passa: `MultiPass`, bo depth potrzebuje kroku compute przed renderem. Dla pozostałych rodzajów wystarczy sam krok render.

## Shader

- Obraz wpasowany w canvas z zachowaniem proporcji, reszta czarna.
- Najbliższy sąsiad (`textureLoad`), widać teksele.
- Rodzaje wejścia (osobne pipeline'y albo `override`, decyzja implementacji):
  - **kolor float / `*-srgb`** (wartości liniowe: `offscreenCanvas` `rgba16float`, albedo): clamp 0..1, kodowanie sRGB jak w `present.wgsl`,
  - **kolor unorm bez srgb** (UI, fonty): bez kodowania,
  - **depth**: skala szarości znormalizowana do zakresu faktycznie zajętego w klatce.
    - Krok compute liczy min/max przez `atomicMin`/`atomicMax` na bitach `f32` jako `u32` (depth ≥ 0, więc kolejność się zgadza), pomijając wartość czyszczenia (1.0).
    - Krok render mapuje `(d - min) / (max - min)`. Gdy nic nie narysowano: czarno.
    - Bez tej normalizacji sort depth zajmuje mały kawałek 0..1 i obraz jest prawie jednolity.
    - Widok depth musi mieć `aspect: "depth-only"`. Sprawdzić, co zwraca `ResourcePool.view`, i w razie potrzeby dodać tam wariant.
  - **tablice / mipy**: `layer`, `mip` jak w opcjach.
- Bindy przez `PassBinds`, pipeline'y przez `Aurora.createRenderPipeline` / `createComputePipeline` (konwencje z `aurora2/plans/CLAUDE.md`).

## Pliki

- `src/core/aurora2/urp/passes/preview.ts`, `src/core/aurora2/urp/shaders/preview.wgsl`.
- Ewentualnie `resourcePool.ts` (widok depth-only).
- `urp.ts` tylko eksport klasy; **nie** dodawać jej do presetu.

## Sprawdzenie

W sandboxie wstawić pass na koniec presetu i tymczasowo podpiąć `next()` i zmianę `channel` pod klawisze. Przejść całą listę:

- `offscreenCanvas`, `gui`, depth draw passa (widać sortowanie po odcieniach),
- `fonts` warstwa 1 kanał `a` i `r`,
- `ui`, `albedo`.

Sprawdzić:

- `hide()`/`show()`,
- szybkie wielokrotne `next()` (bez błędów, kończy na ostatnim wyborze).

Na koniec usunąć z presetu.

## Dokumentacja

- Krótka wzmianka w sekcji URP w `aurora2/plans/CLAUDE.md`: `PreviewPass`, ręcznie na koniec presetu.
- Odhaczyć punkt w `todo.md`.

## Czego nie robimy

- Wyboru z profilera, miniatur, API w debuggerze.
- Podglądu wersji tekstury „po konkretnym passie” (zawsze ostatnia w klatce).
- Podglądu tempów.
