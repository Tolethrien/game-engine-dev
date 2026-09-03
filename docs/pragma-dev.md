# PRAGMA — notatki developerskie (jak to działa od środka)

Ten dokument opisuje wewnętrzne bebechy modułu z [`src/core/pragma`](../src/core/pragma). Notatka „dla siebie" — żeby po powrocie do projektu przypomnieć sobie, **dlaczego** coś jest zrobione tak, a nie inaczej, gdzie są kruche miejsca i co zostało do zrobienia.

Pliki:

| Plik | Rola |
|------|------|
| [`pragma.ts`](../src/core/pragma/pragma.ts) | Statyczny manager scen, `EnginePhase` (bitmaska), `ITERATED_PHASES`, główna pętla `update()` |
| [`scene.ts`](../src/core/pragma/scene.ts) | Kontener aktorów, cache `actorsWithPhase`, wykonanie faz |
| [`actor.ts`](../src/core/pragma/actor.ts) | Kontener komponentów + tagi/marker + lifecycle (awake/start/destroy) |
| [`component.ts`](../src/core/pragma/component.ts) | Bazowy komponent: budowa bitmaski faz, dostęp do sibling/scene/eventów |
| [`eventManager.ts`](../src/core/pragma/eventManager.ts) | `EventBus`, `SharedData`, oraz utilsy `Timer`/`IntervalTimer`/`Signal` do użycia w kodzie gry |
| [`types.d.ts`](../src/core/pragma/types.d.ts) | Globalne typy (`PragmaPhase`, `PragmaComponentClass`, `PragmaPhaseRegistry`, ...) |

---

## Filozofia: komponent = dane + logika, tożsamość przez klasę

Nie ma osobnych systemów, nie ma query po kombinacjach komponentów. Logika mieszka bezpośrednio w komponencie (jego metody fazowe), a identyfikacja typu komponentu to **referencja do klasy** (`PragmaComponentClass`), nie string. `actor.components` to `Map<PragmaComponentClass, PragmaComponent>`, więc `getComponent(Transform)` jest po prostu odczytem z mapy po kluczu-klasie — TypeScript wywnioskuje typ zwrotny z `Ctor` przez `InstanceType<T>`, bez potrzeby globalnego rejestru nazw.

Konsekwencja: brak grupowego query. Żeby "przeiterować po wszystkich aktorach z komponentami A i B", trzeba dziś ręcznie przejść po `scene.getAllActors` i sprawdzić `hasComponent` — nie ma na to cache'owanego indeksu.

---

## `Pragma` (manager scen)

Stan statyczny: `sceneList: Map<string, PragmaScene>`, `events: EventBus` (globalny).

- `addScene`/`deleteScene`/`getScene` działają **natychmiast**, bez żadnego bufora "do dispatchu" — `deleteScene` od razu woła `onDestroy()` na każdym aktorze i kasuje wpis z mapy.
- `addActor`/`deleteActor` to cienkie fasady do `scene.spawnActor`/`scene.deleteActor` — realne dodanie/usunięcie aktora do sceny **jest** kolejkowane (patrz `PragmaScene.prePhase`).

### `EnginePhase` — bitmaska zamiast listy nazw

```ts
enum EnginePhase {
  none = 0,
  awake = 1 << 0,
  start = 1 << 1,
  preFixedUpdate = 1 << 2,
  fixedUpdate = 1 << 3,
  preUpdate = 1 << 4,
  update = 1 << 5,
  postUpdate = 1 << 6,
  render = 1 << 7,
  destroy = 1 << 8,
}
```

`ITERATED_PHASES` to podzbiór faz, które **są tickowane w pętli** (bez `awake`/`start`/`destroy`, bo te odpalają się raz przy dodaniu/usunięciu, nie co klatkę):

```ts
export const ITERATED_PHASES = [
  "preFixedUpdate", "fixedUpdate", "preUpdate", "update", "postUpdate", "render",
] as const;
```

> **Uwaga — kolejność deklaracji w `ITERATED_PHASES` ≠ kolejność wykonania w pętli.** Tablica jest w tej kolejności, bo tak wygodnie iterować przy budowaniu bitmaski/rejestrów (kolejność tam jest nieistotna — używana tylko do `for...of` po Setach/mapach budowanych raz). Faktyczna kolejność egzekucji w `update()` jest zakodowana wprost w trzech metodach `PragmaScene` (`prePhase`/`fixedPhase`/`postPhase`) i **nie pochodzi** z `ITERATED_PHASES`.

### `Pragma.update()` — dokładna kolejność

```
1. for scene (active): scene.prePhase()          // zarządzanie aktorami + preUpdate
2. while Time.requestFixedUpdate():
       for scene (active): scene.fixedPhase()     // preFixedUpdate, fixedUpdate
3. Time.switchToUpdateContext(); Time.updateAlpha()
4. for scene (active): scene.postPhase()          // update, postUpdate, render
```

Nieaktywna scena (`scene.active === false`) jest pomijana **całkowicie** — jedna flaga steruje i logiką, i renderem (nie ma osobnej flagi "licz ale nie renderuj").

---

## `PragmaScene`

### Struktury

```ts
actorsInScene:  Map<Symbol, PragmaActor>                                // faktycznie żywi aktorzy
actorsDirty:    Set<PragmaActor>                                        // aktorzy z pending add/remove komponentu
actorsWithPhase: Record<IteratedPragmaPhases, Set<PragmaActor>>         // cache: który aktor ma >=1 komponent w danej fazie
actorsToAdd:    Set<PragmaActor>
actorsToRemove: Set<PragmaActor>
events:         EventBus
sharedData:     SharedData
```

`actorsWithPhase` to indeks "czy aktor ma cokolwiek do zrobienia w tej fazie" — bez kombinacji komponentów, tylko obecność/brak. Aktualizowany przez `actor.onAwake()` (pełne wypełnienie), `actor.onDestroy()` (pełne czyszczenie) i `actor.updateScenePhases()` (przeliczenie po dodaniu/usunięciu pojedynczego komponentu w locie).

### `runPhase(phase)`

```ts
for (const actor of this.actorsWithPhase[phase]) {
  if (phase !== "render" && !actor.getEnabled()) continue;
  if (phase === "render" && !actor.getVisibility()) continue;
  for (const component of actor.phaseRegistrator[phase]) {
    if (!component.getEnabled()) continue;
    component[phase]!();
  }
}
```

Trzy poziomy włącz/wyłącz, sprawdzane od najgrubszego do najdrobniejszego:
1. `actorsWithPhase[phase]` — czy aktor w ogóle ma tam co robić (cache, budowany raz),
2. `actor.getEnabled()` / `getVisibility()` — czy aktor jako całość jest aktywny/widoczny **teraz**,
3. `component.getEnabled()` — czy **ten konkretny** komponent jest aktywny **teraz**.

> `render` używa `getVisibility()`, wszystkie pozostałe fazy używają `getEnabled()`. To celowe rozdzielenie: aktor może być "wyłączony logicznie" (nie liczy fizyki/AI) ale nadal renderowany (np. zamrożony w cutscence), albo niewidzialny ale nadal aktywny (np. gracz w trybie duch).

### `prePhase()` — dispatcher aktorów + faza `preUpdate`

```
1. dopóki actorsToAdd niepuste:
     - weź snapshot (batch), wyczyść actorsToAdd
     - dla każdego w batchu: actorsInScene.set + actor.onAwake()
     - DOPIERO PO całym batchu: dla każdego actor.onStart()
   (pętla "dopóki", bo onAwake/onStart mogą dorzucić kolejnych aktorów do actorsToAdd)
2. dla każdego w actorsToRemove: actor.onDestroy() + usuń z actorsInScene; wyczyść actorsToRemove
3. dla każdego w actorsDirty: actor.resolvePending()   // dodaj/usuń komponenty w locie, wywołaj awake/destroy na nich
4. dla każdego w actorsDirty: actor.startPending()      // start() na nowo dodanych komponentach
   wyczyść actorsDirty
5. runPhase("preUpdate")
```

Kluczowe: `onAwake` wszystkich aktorów w batchu leci **przed** `onStart` jakiegokolwiek z nich (dwie osobne pętle) — więc w `start()` komponentu możesz bezpiecznie zakładać, że sąsiedzi (`getSibling`) na innych świeżo dodanych aktorach też mieli już `awake()`. To samo rozbicie `resolvePending`/`startPending` na dwie osobne pętle po `actorsDirty` w krokach 3-4.

### `fixedPhase()` / `postPhase()`

Proste: `fixedPhase` = `preFixedUpdate` + `fixedUpdate`. `postPhase` = `update` + `postUpdate` + `render`.

---

## `PragmaActor`

### Tożsamość i przechowywanie komponentów

- `ID: Symbol` — `Symbol(crypto.randomUUID())`.
- `components: Map<PragmaComponentClass, PragmaComponent>` — klucz to **klasa**, nie string. Stąd `addComponent`/`getComponent`/`hasComponent` przyjmują konstruktor wprost.
- Konstruktor bazowy **zawsze** dokłada `Transform` (`this.addComponent(Transform)`), więc każdy aktor ma go gwarantowane od startu; `destroyComponent` ma twardą asercję przeciw usunięciu `Transform`.
- `tags: Set<string>` jest publiczne i mutowalne wprost (`actor.tags.add(...)`) — nie ma osobnej metody typu `addTag`.
- `marker` to zwykły `string | undefined`, ustawiany/czytany przez `setMarker`/`getMarker`. **Nie ma** indeksu po markerze na poziomie sceny (żadnego sposobu "znajdź aktora po markerze" bez ręcznego przeszukania) — marker jest dziś czysto informacyjny.

### `isLive` i dwie ścieżki dodawania komponentu

`addComponent`/`destroyComponent` sprawdzają `this.isLive`:

- **`isLive === false`** (aktor jeszcze nie zespawnowany, budujesz go w konstruktorze) → komponent trafia do `phaseRegistrator` **od razu**, synchronicznie (`addToLocalPhases`/`deleteFromLocalPhases`). Nie ma jeszcze `this.scene`, więc i tak nic więcej nie można zrobić.
- **`isLive === true`** (aktor już żyje na scenie) → zmiana jest kolejkowana: `scene.actorsDirty.add(this)` + `pendingToAdd`/`pendingToRemove`. Realizacja w `resolvePending()`/`startPending()` na początku najbliższej klatki (patrz `prePhase()` wyżej).

`isLive` przełącza się w `onAwake()` (`true`) i `onDestroy()` (`false`).

### `phaseRegistrator` — lokalny indeks aktora

```ts
phaseRegistrator: Record<IteratedPragmaPhases, Set<PragmaComponent>>
```

Odpowiednik `actorsWithPhase` sceny, ale **na poziomie aktora**: które z jego komponentów mają co robić w danej fazie. `runPhase` sceny iteruje po `actorsWithPhase[phase]` (które aktory), a dla każdego — po `actor.phaseRegistrator[phase]` (które komponenty tego aktora).

`addToLocalPhases(component)` sprawdza bitmaskę: `if (component.phases & EnginePhase[phase])`. `updateScenePhases()` (wołane na końcu `resolvePending`) przelicza, czy aktor jako całość powinien być w `scene.actorsWithPhase[phase]`, patrząc czy `phaseRegistrator[phase].size > 0`.

### Lifecycle

| Hook aktora | Kiedy | Co robi |
|---|---|---|
| `onAwake()` | raz, przy realnym dodaniu do sceny | wypełnia `actorsWithPhase` sceny na podstawie `phaseRegistrator`, woła `awake()` na każdym komponencie, ustawia `isLive = true` |
| `onStart()` | raz, po `onAwake()` całego batcha | woła `start()` na każdym komponencie |
| `onDestroy()` | raz, przy realnym usunięciu ze sceny | woła `destroy()` na każdym komponencie, czyści aktora ze wszystkich `actorsWithPhase`, `isLive = false` |
| `resolvePending()` | co klatkę, jeśli aktor w `actorsDirty` | realizuje `pendingToAdd`/`pendingToRemove` z `addComponent`/`destroyComponent` wywołanych w locie; woła `awake()`/`destroy()` na dotkniętych komponentach; na końcu `updateScenePhases()` |
| `startPending()` | tuż po `resolvePending()` | woła `start()` na komponentach z `pendingToAdd`, czyści zbiór |

> Zauważ asymetrię: `pendingToRemove` jest czyszczone **wewnątrz** `resolvePending()`, a `pendingToAdd` dopiero w `startPending()` (bo trzeba je najpierw przeczytać drugi raz, żeby wywołać `start()`).

---

## `PragmaComponent`

### Budowa bitmaski w konstruktorze

```ts
constructor(internal: InternalPCProps) {
  this.actor = internal.actor;
  this.name = this.constructor.name;
  let mask = EnginePhase.none;
  for (const phase of ITERATED_PHASES) {
    if (this[phase]) mask |= EnginePhase[phase];
  }
  this.phases = mask;
}
```

To dzieje się **raz**, w konstruktorze klasy bazowej — zanim konstruktor klasy pochodnej doda cokolwiek po `super()`. Metody fazowe muszą więc być zdefiniowane jako **metody klasy** (żyją na prototypie, widoczne już w momencie `super()`), a nie przypisane jako pola instancji (`this.update = () => {...}`) w ciele konstruktora po `super()` — bo wtedy `this[phase]` w klasie bazowej jeszcze ich nie zobaczy i komponent nigdy nie trafi do żadnej iterowanej fazy.

`phases` jest `readonly` — raz wyliczona bitmaska się nie zmienia przez całe życie komponentu (nawet jeśli ktoś dynamicznie dołoży metodę do instancji później — architektura tego nie przewiduje).

### Dostęp do rodzeństwa i eventów

- `getSibling(Ctor)` = `this.actor.getComponent(Ctor)` — jedyny sposób komunikacji między komponentami tego samego aktora poza eventami.
- `emitActorEvent`/`onActorEvent` operują na `this.actor.events` — widoczne tylko dla komponentów **tego samego** aktora (i kogokolwiek z referencją do `actor.events`).
- `emitSceneEvent`/`onSceneEvent` operują na `this.actor.scene.events` — widoczne dla całej sceny.
- `systemSharedData` = `this.scene.sharedData`.

---

## `EventBus` / `SharedData` / `Timer` (`eventManager.ts`)

- **`EventBus`** — `Map<string, Set<callback>>`, `emit` woła synchronicznie. Bardzo prosty mechanizm: brak deferred/cascade, brak `flush()`, brak integracji z fazami (subskrypcja nie ma żadnej kontroli kolejności względem innych subskrybentów).
- **`Signal<T>`** — pojedynczy kanał typu `connect`/`disconnect`/`emit` (odpowiednik jednego wpisu `EventBus`, ale bez mapy nazw). Do użycia jako property na własnym komponencie/aktorze (np. `onPositionChanged: Signal<Position2D>`), gdy nie chce się nazwy stringowej z `EventBus`.
- **`Timer`** / **`IntervalTimer`** — proste utilsy z `tick(dt)`, przeznaczone do ręcznego wołania z kodu gry (np. z metody fazowej `update` własnego komponentu, przekazując deltę czasu z `Time`). Silnik ich sam z siebie nie tika — to narzędzie, po które sięga się tam, gdzie się go potrzebuje, a nie zarządzany przez `Pragma`/`PragmaScene` mechanizm globalny.
- **`SharedData`** — `add` ostrzega o duplikacie klucza, `set` nadpisuje po cichu. Istnieje **tylko poziom sceny** — nie ma globalnego magazynu danych współdzielonych między scenami (trzeba by go trzymać w payloadach `Pragma.events` albo w osobnym statycznym polu).

---

## Znane ograniczenia, pułapki i niespójności (stan obecny)

1. **Brak query po komponentach.** Nie ma sposobu na "wszyscy aktorzy z X i Y" poza ręczną iteracją `scene.getAllActors` + `hasComponent` x2 na każdym. Dla dużej liczby aktorów to O(n) przy każdym zapytaniu, bez żadnego cache'a.
2. **Brak indeksu po markerze i po tagach.** `setMarker`/`tags` to czyste dane na aktorze — "znajdź aktora z markerem Player" albo "wszystkich z tagiem X" wymaga dziś ręcznego przeszukania wszystkich aktorów sceny.
3. **Brak kontroli kolejności komponentów w fazie.** Komponenty odpalają się w kolejności iteracji `Set` (czyli kolejności dodania), bez możliwości wymuszenia "ten komponent zawsze przed tamtym" między różnymi aktorami czy nawet w obrębie jednego aktora.
4. **`deleteScene` nie sprząta niczego poza wywołaniem `onDestroy()` na aktorach** i skasowaniem wpisu z `sceneList` — nie ma żadnego bufora/kolejkowania jak przy `deleteActor`. Usunięcie sceny w trakcie iteracji po niej (np. z jej własnego komponentu w fazie `update`) mogłoby być ryzykowne (nie testowane).
5. **Brak `NOT`/exclude w zapytaniach i brak singletonowych komponentów sceny** (globalny stan bez aktora-nośnika) — niezaadresowane na razie.
6. **`marker` to `string | undefined`, nie referencja współdzielona.** `actor.getMarker()` zawsze czyta aktualną wartość bezpośrednio z aktora — nie ma potrzeby sztuczek z współdzieloną referencją, bo komponenty i tak trzymają wskaźnik na `actor`.

---

## Jak rozszerzać

**Nowy komponent:** klasa `extends PragmaComponent`, konstruktor `(internal: InternalPCProps, ...twoje propsy)`, zaimplementuj tylko te metody fazowe (`awake`/`start`/`destroy`/`preFixedUpdate`/`fixedUpdate`/`preUpdate`/`update`/`postUpdate`/`render`), których potrzebujesz — bitmaska wykryje je sama. Żadnej osobnej rejestracji nie trzeba.

**Nowy aktor:** klasa `extends PragmaActor`, w konstruktorze `this.addComponent(Ctor, ...props)` dla każdego potrzebnego komponentu, potem `Pragma.addActor(new Foo(), "SceneName")`.

**Nowa faza:** trzeba ruszyć cztery miejsca — `EnginePhase` (dodać kolejny bit), `ITERATED_PHASES` (jeśli ma być tickowana co klatkę), interfejs `PragmaComponent` w `component.ts` (opcjonalna metoda), i jedną z metod `PragmaScene` (`prePhase`/`fixedPhase`/`postPhase` albo nową) żeby faktycznie wywołać `runPhase("nowaFaza")` we właściwym miejscu pętli `Pragma.update()`.
