# CELLO — dokumentacja dla użytkownika

**CELLO** to statyczny manager audio oparty o Web Audio API: bufory dźwięków, drzewo kategorii głośności (magistrale miksera), podpinane efekty (współdzielone lub per-instancja) i sterowanie odtwarzaniem.

- **Bufory** — zdekodowane dźwięki (`AudioBuffer`) trzymane pod nazwą, wczytywane raz przy starcie.
- **Kategorie** — drzewo węzłów `GainNode` (magistrale miksera, np. `master → sfx → footsteps`), każdy dźwięk routowany przez jedną lub więcej kategorii.
- **Efekty** — rejestrowane pod nazwą, budowane jako łańcuch `AudioNode` (filtr, pogłos, kompresor, ...), doczepiane do konkretnego odtworzenia.
- **Odtworzenie** — `Cello.play(name, props)` zwraca uchwyt do sterowania pojedynczą, już grającą instancją (stop/fade/volume).

---

## Szybki start

### 1. Inicjalizacja

```ts
import Cello from "@/core/cello/cello";

await Cello.initialize({
  masterVolume: 1,
  preloadSounds: [
    { name: "click", url: "assets/audio/click.wav" },
    { name: "footstep", url: "assets/audio/footstep.wav" },
  ],
  categoryTree: {
    sfx: { initVol: 1, children: { ui: { initVol: 1 } } },
    music: { initVol: 0.7 },
  },
});
```

`categoryTree` buduje drzewo `master → (sfx → ui), music` — klucze to nazwy kategorii, `initVol` to startowa głośność (0–1), `children` zagnieżdża kolejny poziom.

### 2. Odtwarzanie

```ts
Cello.play("click", { categories: ["ui"], volume: 0.8 });

const handle = Cello.play("footstep", {
  categories: ["sfx"],
  loop: true,
  randomPitch: 0.1, // lekko losowy pitch przy każdym odtworzeniu
  maxConcurrent: 4, // max 4 jednoczesne instancje tego dźwięku
});

handle?.setVolume(0.5);
handle?.fadeOutAndStop(1.2); // płynne wyciszenie w 1.2s, potem stop
handle?.stop(); // natychmiastowy stop
```

`categories` jest **wymagane** — dźwięk musi trafić do co najmniej jednej kategorii, żeby w ogóle było go słychać (kategoria musi istnieć w drzewie z `initialize`).

### 3. Własny efekt

```ts
Cello.registerEffect("lowpass", {
  scope: "perInstance", // osobny węzeł dla każdego odtworzenia
  build: (ctx) => {
    const filter = Cello.createNode("filter");
    filter.type = "lowpass";
    filter.frequency.value = 800;
    return { input: filter, output: filter };
  },
});

Cello.play("footstep", { categories: ["sfx"], effects: ["lowpass"] });
```

`scope: "shared"` zamiast tego zbuduje **jeden** węzeł efektu, współdzielony przez wszystkie odtworzenia, które go użyją (np. jedna instancja pogłosu pokoju dla wszystkich dźwięków w nim).

---

## `Cello.initialize(config)`

| Pole configu    | Do czego                                                                                                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `masterVolume`  | wartość startowa (obecnie nieużywana automatycznie do ustawienia głośności — steruj przez `setMasterVolume` po inicjalizacji, patrz Ograniczenia w [cello-dev.md](./cello-dev.md)) |
| `preloadSounds` | lista `{ name, url }` — pobierane i dekodowane (`decodeAudioData`) przed zakończeniem `initialize`                                                                                 |
| `categoryTree`  | zagnieżdżone `Record<string, { initVol, children? }>` — buduje magistrale miksera pod `"master"`                                                                                   |
| `effects`       | `Record<string, EffectStrategy>` — rejestrowane od razu, tak jakby wywołać `registerEffect` dla każdego                                                                            |

Po zbudowaniu drzewa kategorii i zarejestrowaniu efektów, wszystkie efekty ze `scope: "shared"` są **budowane od razu** (`buildRegisteredEffects`), więc pierwsze użycie takiego efektu w `play()` nie płaci kosztu tworzenia węzła.

CELLO samo zawiesza/wznawia `AudioContext` przy zmianie fokusu okna (`window.API.WINDOW.onFocusChanged`) — audio pauzuje się, gdy okno gry traci fokus.

---

## Odtwarzanie (`Cello.play`)

```ts
Cello.play(name: string, props: {
  categories: string[];      // wymagane — routing do kategorii
  loop?: boolean;
  effects?: string[];        // nazwy zarejestrowanych efektów, w kolejności łańcucha
  volume?: number;           // głośność tej instancji (domyślnie 1)
  randomPitch?: number;      // 0–1, losowe odchylenie tempa/pitcha
  position?: Position2D;     // przekazywane do efektów jako runtimeArgs.position
  maxConcurrent?: number;    // limit jednoczesnych instancji TEGO buforu (po nazwie)
});
```

Zwraca `undefined`, jeśli bufora nie ma (nieprzeładowany dźwięk) albo limit `maxConcurrent` został osiągnięty — w obu przypadkach ciszej, bez rzucania błędu (tylko `console.warn` przy brakującym buforze). W przeciwnym razie zwraca uchwyt:

```ts
{
  stop(): void;
  setVolume(val: number): void;
  fadeOutAndStop(durationSeconds: number): void;
  sourceNode: AudioBufferSourceNode;
}
```

Dźwięk startuje natychmiast (`source.start(0)`) — nie ma wbudowanego planowania startu na konkretny czas `AudioContext`.

---

## Efekty

```ts
Cello.registerEffect(name, strategy); // rzuca warning i NIE nadpisuje, jeśli nazwa już istnieje
Cello.overrideEffect(name, strategy); // jak wyżej, ale nadpisuje (z warningiem)
Cello.getEffectNode(name); // zbuduj/pobierz węzeł efektu ręcznie, poza play()
```

`EffectStrategy`:

```ts
{
  scope: "shared" | "perInstance";
  build: (ctx: AudioContext, runtimeArgs?: unknown) => {
    input: AudioNode;
    output: AudioNode;
  };
}
```

- `"shared"` — węzeł budowany **raz** (przy `initialize`/pierwszym użyciu) i reużywany przez wszystkie odtworzenia.
- `"perInstance"` — świeży węzeł na każde `play()`, sprzątany automatycznie po zakończeniu dźwięku.

`Cello.createNode(type)` to typowana fabryka surowych węzłów Web Audio (`"gain" | "delay" | "filter" | "stereoPan" | "convolver" | "compressor" | "waveShaper" | "analyser" | "panner"`) — do użycia wewnątrz własnego `build()`, żeby nie pisać `ctx.createX()` za każdym razem ręcznie.

---

## Kategorie (magistrale głośności)

```ts
Cello.setMasterVolume(0.8);
Cello.getMasterVolumeValue();
Cello.getMasterVolumeNode(); // surowy GainNode, do własnych podpięć

Cello.setCategoryVolume("music", 0.5);
Cello.getCategoryVolumeValue("music");
Cello.getCategoryVolumeNode("music");

Cello.getCategoryNames(); // wszystkie zarejestrowane nazwy kategorii
Cello.getCategoryPath("footsteps"); // np. ["footsteps", "sfx", "master", "destination"]
Cello.getAllCategoryPaths(); // mapa nazwa -> ścieżka
```

Zmiana głośności kategorii jest **natychmiastowa** (bez rampy) — do płynnego fade'u pojedynczej instancji użyj `handle.fadeOutAndStop()`.

---

## Ściąga (cheat sheet)

```ts
await Cello.initialize({
  masterVolume: 1,
  preloadSounds: [{ name: "hit", url: "assets/hit.wav" }],
  categoryTree: { sfx: { initVol: 1 } },
});

Cello.registerEffect("reverb", {
  scope: "shared",
  build: (ctx) => {
    const node = Cello.createNode("convolver");
    return { input: node, output: node };
  },
});

const handle = Cello.play("hit", {
  categories: ["sfx"],
  effects: ["reverb"],
  volume: 0.9,
  randomPitch: 0.05,
  maxConcurrent: 8,
});

handle?.fadeOutAndStop(0.5);

Cello.setCategoryVolume("sfx", 0.6);
Cello.setMasterVolume(1);
```

Szczegóły wewnętrzne (jak to działa pod spodem, ograniczenia, TODO) → [cello-dev.md](./cello-dev.md).

# CELLO — notatki developerskie (jak to działa od środka)

Ten dokument opisuje wewnętrzne bebechy modułu z [`src/core/cello`](../src/core/cello).

Pliki:

| Plik                                         | Rola                                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------------- |
| [`cello.ts`](../src/core/cello/cello.ts)     | Cała logika: statyczny stan, inicjalizacja, odtwarzanie, efekty, kategorie          |
| [`types.d.ts`](../src/core/cello/types.d.ts) | `EffectStep` — deklaratywny opis kroku efektu (**patrz Ograniczenia — nieużywany**) |

---

## Stan statyczny

```ts
buffers: Map<string, AudioBuffer>; // zdekodowane dźwięki, po nazwie
categories: Map<string, GainNode>; // węzły magistrali miksera, po nazwie
categoryParents: Map<string, string>; // nazwa kategorii -> nazwa rodzica (do getCategoryPath)
effectRegistry: Map<string, EffectStrategy>; // zarejestrowane fabryki efektów
sharedEffects: Map<string, EffectNode>; // zbudowane węzły efektów o scope "shared"
activeCounts: Map<string, number>; // licznik żywych instancji per nazwa bufora (dla maxConcurrent)
ctx: AudioContext;
masterGain: GainNode; // zadeklarowane, ale NIGDY nie przypisywane (patrz Ograniczenia)
```

## `initialize()` — kolejność

```
1. utwórz AudioContext
2. jeśli preloadSounds: dla KAŻDEGO dźwięku po kolei (sekwencyjnie, nie równolegle):
     fetch -> arrayBuffer -> decodeAudioData -> buffers.set(name, ...)
3. jeśli categoryTree: createCategoryTree
     - tworzy węzeł "master", podłącza do ctx.destination
     - rekurencyjnie (spawnCategories) tworzy GainNode dla każdej kategorii z drzewa,
       podłącza do rodzica, zapisuje categoryParents[nazwa] = rodzic
4. jeśli effects: registerEffect(name, strategy) dla każdego wpisu configu
5. buildRegisteredEffects() — buduje OD RAZU wszystkie efekty o scope "shared"
   (niezależnie, czy przyszły z configu, czy zostały zarejestrowane wcześniej)
6. window.API.WINDOW.onFocusChanged(...) -> ctx.resume()/ctx.suspend()
7. console.log(this.getCategoryPath("ambient"))  // patrz Ograniczenia
```

### `createCategoryTree` / `spawnCategories`

Drzewo kategorii to zwykłe `GainNode` połączone w łańcuch (`node.connect(parent)`), z korzeniem `"master"` podłączonym wprost do `ctx.destination`. `categoryParents` zapisuje **tylko** dzieci (`spawnCategories` ustawia wpis dla każdej kategorii, którą tworzy) — `"master"` samo nigdy nie trafia do `categoryParents`, bo jego "rodzicem" jest `ctx.destination`, nietrackowany jako kategoria.

---

## `play()` — dokładny przebieg

```
1. buffer = buffers.get(name); brak -> warn + return undefined
2. jeśli maxConcurrent podane:
     active = activeCounts.get(name) ?? 0
     active >= maxConcurrent -> return undefined (cicho, bez warna)
     activeCounts.set(name, active + 1)
3. utwórz BufferSourceNode, podepnij buffer, ustaw loop
4. jeśli randomPitch: playbackRate = 1 + losowe odchylenie w [-randomPitch, +randomPitch]
5. utwórz instanceGain (props.volume ?? 1), source -> instanceGain
6. dla każdego props.effects (W KOLEJNOŚCI PODANEJ w tablicy):
     effect = buildEffect(effName, { position: props.position })
     current.connect(effect.input); current = effect.output
     jeśli strategy.scope === "perInstance": zapamiętaj input+output do posprzątania
7. dla każdej props.categories: current.connect(categoryNode)
   (current to WYJŚCIE całego łańcucha efektów — jeśli categories ma >1 wpis,
    ten sam sygnał trafia do WIELU magistrali jednocześnie)
8. source.onended: disconnect source + wszystkie perInstanceNodes, dekrementuj activeCounts
9. source.start(0)
10. zwróć { stop, setVolume, fadeOutAndStop, sourceNode }
```

### `runtimeArgs` a scope efektu

`buildEffect(name, runtimeArgs)`:

- **`"shared"`** — `strategy.build(this.ctx)` woła się **bez** `runtimeArgs`, i to **tylko raz** (przy pierwszym użyciu albo przy `buildRegisteredEffects()` w `initialize`). Każde kolejne `buildEffect` dla tej nazwy zwraca węzeł z cache'a (`sharedEffects`), ignorując cokolwiek przekazane w `runtimeArgs` — więc `props.position` w `play()` **nie ma żadnego efektu** na efekt o `scope: "shared"`, nawet przy pierwszym użyciu.
- **`"perInstance"`** — `strategy.build(this.ctx, runtimeArgs)` woła się za każdym razem od nowa, więc `{ position: props.position }` faktycznie dociera do `build()` i strategia może go użyć (np. do spozycjonowania efektu 3D).

---

## Rejestracja efektów

`registerEffect(name, strategy)` — jeśli nazwa już istnieje w `effectRegistry`, **tylko ostrzega i nic nie robi** (nie nadpisuje). Żeby faktycznie podmienić istniejącą strategię, trzeba użyć `overrideEffect` (identyczna logika budowania, ale nadpisuje z ostrzeżeniem zamiast odmawiać).

`buildRegisteredEffects()` iteruje **cały** `effectRegistry` i dla każdego wpisu o `scope === "shared"`, którego jeszcze nie ma w `sharedEffects`, buduje go i cache'uje. To jedyne miejsce, które "z automatu" materializuje shared-effecty — jeśli zarejestrujesz nowy `shared` efekt **po** `initialize()` (poza configiem), on **nie** zostanie zbudowany od razu — zbuduje się leniwie przy pierwszym `buildEffect`/`play()`, który go użyje (co i tak działa poprawnie, tylko koszt tworzenia węzła przesuwa się na pierwsze odtworzenie zamiast na start).

---

## `createNode<K>(type)`

Typowany `switch` mapujący string (`"gain" | "delay" | "filter" | ...`) na odpowiednie `ctx.createX()` z Web Audio API, z mapą typów `NodeTypeMap` do wywnioskowania konkretnego typu zwrotnego z literału stringa. Sam w sobie trywialny — wartość dodana to możliwość **sterowania tworzeniem węzła z danych** (string z configu) zamiast twardo wpisanego wywołania — co pasowałoby do `EffectStep` (patrz Ograniczenia), gdyby coś faktycznie z niego korzystało.

---

## Znane ograniczenia, pułapki i niespójności (stan obecny)

1. **`config.masterVolume` z `initialize()` jest nigdzie nieużywane.** Pole istnieje w `CelloConfig`, ale ciało `initialize()` go nie czyta — głośność mastera trzeba ustawić ręcznie po starcie przez `Cello.setMasterVolume(...)`. Podobnie `masterGain` (`declare static masterGain: GainNode`) jest zadeklarowane, ale **nigdy nie przypisywane** — martwe pole, prawdziwym uchwytem do mastera jest `categories.get("master")`.
2. **`setMasterVolume`/`getMasterVolumeValue`/`getMasterVolumeNode` force-unwrapują (`!`) `categories.get("master")`.** Jeśli `initialize()` zostanie wywołane **bez** `categoryTree`, kategoria `"master"` nigdy nie powstaje i te trzy metody rzucą runtime error (`Cannot read properties of undefined`) przy pierwszym użyciu.
3. **`getCategoryPath("master")` (albo dowolnej kategorii spoza drzewa) nie działa** — `categoryParents` mapuje tylko dzieci, więc wywołanie dla samego roota (albo nieistniejącej nazwy) trafia w `!this.categoryParents.has(name)`, ostrzega i zwraca `[]` zamiast sensownej ścieżki.
4. **`EffectStep` (`types.d.ts`) jest zadeklarowanym, ale w pełni nieużywanym typem.** Nic w `cello.ts` nie przyjmuje `EffectStep[]` ani nie buduje z niego łańcucha `AudioNode` — dziś jedyny sposób dodania efektu to ręcznie napisana funkcja `EffectStrategy.build`. `EffectStep` wygląda jak szkic pod przyszły deklaratywny builder (stąd warianty 1:1 z tym, co `createNode` potrafi stworzyć — `panner3d` używający osobnych `positionX/Y/Z`, inaczej niż `PlayObject.position: Position2D` używane dziś w `play()`), ale nie ma na razie żadnego kodu, który by go interpretował.
5. **`PlayObject.position` dociera tylko do efektów `"perInstance"`** — patrz sekcja `runtimeArgs` wyżej. Łatwo założyć, że "podanie pozycji" coś zrobi z efektem 3D zarejestrowanym jako `"shared"` — nie zrobi.
6. **`preloadSounds` dekoduje sekwencyjnie** (`for...of` z `await` w pętli), nie `Promise.all` — czas startu skaluje się liniowo z liczbą dźwięków/opóźnieniem sieci zamiast równolegle.
7. **`console.log(this.getCategoryPath("ambient"))` na końcu `initialize()`** to bezwarunkowy log deweloperski — odpala się przy każdym starcie i (zgodnie z punktem 3) jeszcze do tego zwykle ostrzega w konsoli, bo `"ambient"` nie jest domyślnie skonfigurowaną kategorią w żadnym przykładzie. Wygląda na pozostawiony kod z testów.
8. **Brak API do strumieniowania długich utworów.** Wszystko — SFX i muzyka — idzie przez `preloadSounds` (pełne zdekodowanie do `AudioBuffer` w pamięci) + `AudioBufferSourceNode`. Dla długich ścieżek muzycznych to więcej pamięci i dłuższy `initialize()` niż dałoby `HTMLAudioElement`/`MediaElementAudioSourceNode` ze streamingiem.
9. **Zawieszanie `AudioContext` przy utracie fokusu okna jest globalne i bezwarunkowe** (`window.API.WINDOW.onFocusChanged`) — pauzuje **cały** dźwięk silnika (łącznie z muzyką) natychmiast, gdy okno straci fokus, bez możliwości wyłączenia tego per kategoria (np. "muzyka ma grać dalej w tle").
10. **`source.start(0)` nie wspiera zaplanowanego startu** — jeśli potrzebujesz zsynchronizować kilka dźwięków co do sampla (np. warstwy muzyczne), `play()` nie da tego zrobić; trzeba by budować `BufferSourceNode` ręcznie i wołać `start(ctx.currentTime + offset)`.

---

## Jak rozszerzać

**Nowy efekt:** napisz `EffectStrategy` (`{ scope, build }`), `build` zwraca `{ input, output }` (mogą to być ten sam węzeł, jak w prostym filtrze, albo dwa końce dłuższego wewnętrznego łańcucha) i zarejestruj przez `registerEffect`/`overrideEffect`, albo przekaż w `config.effects` do `initialize()`.

**Nowa kategoria w locie:** dziś brak publicznego API do dodania kategorii **po** `initialize()` — `createCategoryTree`/`spawnCategories` są prywatne i wołane tylko raz. Żeby to dodać, trzeba by wystawić coś w rodzaju `Cello.addCategory(name, parent, initVol)`, replikującego logikę `spawnCategories` dla pojedynczego wpisu.

**Deklaratywne efekty z `EffectStep`:** żeby `EffectStep` przestał być martwym typem, potrzebna jest funkcja `buildFromSteps(ctx, steps: EffectStep[]): EffectNode`, łącząca kolejne kroki przez `createNode` (`switch` po `step.type`, analogiczny do istniejącego `createNode`), zwracająca `input` pierwszego i `output` ostatniego węzła w łańcuchu — dopiero to dałoby możliwość konfigurowania efektów z czystych danych (np. JSON) zamiast pisania `build()` ręcznie za każdym razem.
