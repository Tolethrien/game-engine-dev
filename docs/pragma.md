# PRAGMA — dokumentacja dla użytkownika

**PRAGMA** to aktorowy rdzeń silnika: logika **i** stan siedzą razem w komponentach, komponenty wiszą na aktorach, a aktorzy żyją w scenach.

- **Sceny** (`PragmaScene`) — kontenery na aktorów, z własnym `EventBus` i `SharedData`,
- **Aktorzy** (`PragmaActor`) — obiekty gry, kontener komponentów + tagi + marker + widoczność/aktywność,
- **Komponenty** (`PragmaComponent`) — dane **i** logika naraz; metody fazowe (`update`, `render`, ...) implementujesz bezpośrednio w komponencie,
- **Fazy** — `awake`, `start`, `preFixedUpdate`, `fixedUpdate`, `preUpdate`, `update`, `postUpdate`, `render`, `destroy`,
- **Eventy** — trzy poziomy: globalny (`Pragma.events`), sceny (`scene.events`), aktora (`actor.events`) — wszystkie synchroniczne (immediate).

> Nie ma osobnych "systemów" i nie ma query po zestawie komponentów. Każdy komponent sam wie, co robić — jeśli potrzebuje danych z innego komponentu tego samego aktora, sięga po nie przez `getSibling`.

---

## Szybki start

### 1. Komponent (dane + logika)

Komponent rozszerza `PragmaComponent`. Pierwszy argument konstruktora to zawsze `internal: InternalPCProps` (wstrzykiwane przez PRAGMA, zawiera referencję do `actor`), własne propsy idą po nim.

```ts
// src/sandbox/components/phys.ts
import PragmaComponent from "@/core/pragma/component";
import Transform from "@/sandbox/components/transform";

interface PhysProps {
  gravityScale?: number;
}

export default class Phys extends PragmaComponent {
  public velocity = { x: 0, y: 0 };
  public gravityScale: number;
  public isGrounded = false;

  constructor(internal: InternalPCProps, props: PhysProps = {}) {
    super(internal);
    this.gravityScale = props.gravityScale ?? 1;
  }

  // Sama OBECNOŚĆ tej metody rejestruje komponent w fazie fixedUpdate.
  public fixedUpdate() {
    const transform = this.getSibling(Transform)!;
    const dt = 0; // np. Time.getFixedDeltaTime() / 1000

    if (!this.isGrounded) {
      this.velocity.y += 980 * this.gravityScale * dt;
    }
    transform.position.x += this.velocity.x * dt;
    transform.position.y += this.velocity.y * dt;
  }
}
```

> **Ważne**: PRAGMA rejestruje fazy komponentu **raz, w konstruktorze klasy bazowej**, sprawdzając które metody fazowe (`this[phase]`) istnieją na instancji. Zdefiniuj metodę fazową jako zwykłą metodę klasy (nie przypisuj jej dynamicznie po `super()`), bo w tym momencie musi już istnieć na prototypie.

### 2. Aktor (kontener komponentów)

```ts
// src/sandbox/actors/player.ts
import PragmaActor from "@/core/pragma/actor";
import Phys from "@/sandbox/components/phys";

export default class Player extends PragmaActor {
  constructor() {
    super(); // dokłada Transform automatycznie
    this.addComponent(Phys, { gravityScale: 1 });
    this.setMarker("Player");
    this.tags.add("human");
  }
}
```

Każdy `PragmaActor` **automatycznie** dostaje komponent `Transform` w konstruktorze bazowym — nie trzeba go dodawać ręcznie, dostępny jest przez `actor.transform`.

### 3. Scena i spawn

```ts
// src/sandbox/index.ts
import Pragma from "@/core/pragma/pragma";
import Player from "@/sandbox/actors/player";

function setup() {
  Pragma.addScene("Main");
  Pragma.addActor(new Player(), "Main");
}
```

Silnik gry wywołuje `Pragma.update()` raz na klatkę (patrz [`engine.ts`](../src/core/engine/engine.ts)) — napędza wszystkie sceny.

---

## Pojęcia

### Scena (`PragmaScene`)

```ts
const scene = Pragma.addScene("Main", /* active */ true);
Pragma.deleteScene("Main");
Pragma.getScene("Main");
```

- `active` (domyślnie `true`) — gdy `false`, scena jest całkowicie pomijana w `Pragma.update()` (żadna faza się nie odpala).
- Każda scena ma własny `scene.events` (`EventBus`) i `scene.sharedData` (`SharedData`) — patrz niżej.
- Usunięcie sceny (`deleteScene`) woła `onDestroy()` na wszystkich jej aktorach i kasuje scenę od razu (bez kolejkowania).

### Aktor (`PragmaActor`)

Kontener komponentów z dodatkową logiką stanu:

```ts
class Enemy extends PragmaActor {
  constructor() {
    super();
    this.addComponent(Health, { max: 100 });
    this.tags.add("enemy");
  }
}
```

Metody aktora:

| Metoda                                    | Do czego                                                                                                                                                                    |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `addComponent(Ctor, ...args)`             | dodaje komponent (nie można dodać dwóch tego samego typu); jeśli aktor jest już "żywy" na scenie, dodanie jest **kolejkowane** i realizowane na początku najbliższej klatki |
| `destroyComponent(Ctor)`                  | usuwa komponent (nie można usunąć `Transform`); też kolejkowane, gdy aktor jest żywy                                                                                        |
| `getComponent(Ctor)`                      | zwraca komponent danego typu lub `undefined`                                                                                                                                |
| `hasComponent(Ctor)`                      | czy aktor ma dany komponent                                                                                                                                                 |
| `getAllComponents()`                      | iterator po wszystkich komponentach                                                                                                                                         |
| `transform`                               | skrót do komponentu `Transform`                                                                                                                                             |
| `setMarker(name)` / `getMarker()`         | unikalny identyfikator aktora (czysto informacyjny)                                                                                                                         |
| `tags`                                    | `Set<string>` — dodawaj/usuwaj wprost (`actor.tags.add("x")`)                                                                                                               |
| `setVisibility(bool)` / `getVisibility()` | steruje, czy faza `render` odpala się dla tego aktora                                                                                                                       |
| `setEnabled(bool)` / `getEnabled()`       | steruje, czy fazy inne niż `render` odpalają się dla tego aktora                                                                                                            |
| `selfDestroy()`                           | kolejkuje usunięcie samego siebie ze sceny                                                                                                                                  |

> **Runtime dodawanie/usuwanie komponentów działa**, ale dopiero od **następnej klatki** (`resolvePending()` w fazie `preUpdate`).

### Komponent (`PragmaComponent`)

Dane + logika w jednym. Dostępne z klasy bazowej:

| Metoda / getter                     | Do czego                                                                                                 |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `this.actor`                        | referencja do aktora-właściciela                                                                         |
| `this.name`                         | nazwa klasy (`this.constructor.name`)                                                                    |
| `this.scene`                        | skrót do `this.actor.scene`                                                                              |
| `this.tags`                         | skrót do `this.actor.tags`                                                                               |
| `getSibling(Ctor)`                  | pobiera inny komponent **tego samego** aktora                                                            |
| `destroySelf()`                     | usuwa siebie z aktora (kolejkowane jak `actor.destroyComponent`)                                         |
| `setEnabled(bool)` / `getEnabled()` | wyłącza pojedynczy komponent — jego metody fazowe przestają się odpalać, mimo że aktor pozostaje aktywny |
| `systemSharedData`                  | skrót do `this.scene.sharedData`                                                                         |

Metody fazowe (wszystkie **opcjonalne** — implementujesz tylko te, których potrzebujesz):

```ts
interface PragmaComponent {
  awake?(): void;
  start?(): void;
  destroy?(): void;
  preFixedUpdate?(): void;
  fixedUpdate?(): void;
  preUpdate?(): void;
  update?(): void;
  postUpdate?(): void;
  render?(): void;
}
```

---

## Pętla klatki (`Pragma.update()`)

```
1. dla każdej AKTYWNEJ sceny: prePhase()
     - dołącz nowo zespawnowanych aktorów (onAwake -> onStart)
     - usuń skolejkowanych do usunięcia aktorów (onDestroy)
     - rozwiąż "dirty" aktorów (dodane/usunięte w locie komponenty: resolvePending -> startPending)
     - odpal fazę preUpdate
2. dopóki Time.requestFixedUpdate():
     dla każdej aktywnej sceny: fixedPhase() -> preFixedUpdate, potem fixedUpdate
3. Time.switchToUpdateContext(); Time.updateAlpha()
4. dla każdej aktywnej sceny: postPhase() -> update, postUpdate, render
```

Kluczowe konsekwencje:

- `preUpdate` odpala się **raz**, **przed** pętlą `fixedUpdate`.
- `fixedUpdate`/`preFixedUpdate` mogą odpalić się 0, 1 lub kilka razy na klatkę — tam licz fizykę.
- `render` steruje `getVisibility()` aktora (a nie `getEnabled()`); wszystkie pozostałe fazy — odwrotnie.
- Nieaktywna scena (`active: false`) jest pomijana **w całości** (żadna faza, nawet `render`).

---

## Rejestracja komponentu w fazach (bitmaska)

Nie trzeba nic subskrybować ręcznie — PRAGMA sam wykrywa, w jakich fazach ma odpalić komponent, sprawdzając w konstruktorze bazowym, które metody fazowe (`awake`, `preUpdate`, `update`, ...) istnieją na instancji, i buduje z tego bitmaskę (`EnginePhase`).

```ts
// enum EnginePhase (pragma.ts) — bity, można je łączyć operatorami bitowymi
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

Konsekwencje:

- **Brak kontroli kolejności** komponentów w tej samej fazie — komponenty odpalają się w kolejności iteracji `Set`, czyli w kolejności dodania.
- Jeśli komponent nie definiuje żadnej metody fazowej poza `awake`/`start`/`destroy`, nigdy nie trafia do zbioru komponentów tickowanych co klatkę.

---

## Eventy

Trzy niezależne, w pełni synchroniczne magistrale (`EventBus`):

```ts
// Globalny — widoczny wszędzie
Pragma.emitGlobalEvent("GamePaused", { paused: true });
Pragma.onGlobalEvent("GamePaused", (data) => {
  /* ... */
});
Pragma.offGlobalEvent("GamePaused", cb);

// Scena — w komponencie
this.emitSceneEvent("SpawnWave", { count: 5 });
this.onSceneEvent("SpawnWave", (data) => {
  /* ... */
});

// Aktor — w komponencie, komunikacja między własnymi komponentami / z zewnątrz
this.emitActorEvent("DamageTaken", { amount: 10 });
this.onActorEvent("DamageTaken", (data) => {
  /* ... */
});
```

`emit*` woła wszystkich subskrybentów **natychmiast, synchronicznie**.

---

## Dane współdzielone (Shared Data)

Per-scena schowek klucz-wartość:

```ts
this.systemSharedData.add("score", { value: 0 }); // ostrzega, jeśli klucz już istnieje
this.systemSharedData.set("score", { value: 10 }); // nadpisuje bez ostrzeżenia
const score = this.systemSharedData.get<{ value: number }>("score");
this.systemSharedData.delete("score");
this.systemSharedData.has("score");
```

---

## Ściąga (cheat sheet)

```ts
// Scena
Pragma.addScene("Main", true);
Pragma.deleteScene("Main");
const scene = Pragma.getScene("Main");

// Aktor
class Foo extends PragmaActor {
  constructor() {
    super();
    this.addComponent(Phys, { gravityScale: 1 });
    this.tags.add("enemy");
    this.setMarker("Boss");
  }
}
const foo = new Foo();
Pragma.addActor(foo, "Main");
Pragma.deleteActor(foo, "Main");
foo.selfDestroy(); // z zewnątrz tak samo skuteczne

// Komponent
class Health extends PragmaComponent {
  public hp = 100;
  constructor(internal: InternalPCProps, props: { max: number }) {
    super(internal);
    this.hp = props.max;
  }
  update() {
    const transform = this.getSibling(Transform)!;
    // ...logika
  }
}

// Pętla — raz na klatkę (robi to silnik):
Pragma.update();
```

Szczegóły wewnętrzne (jak to działa pod spodem, ograniczenia, TODO) → [pragma-dev.md](./pragma-dev.md).

# PRAGMA — notatki developerskie (jak to działa od środka)

Ten dokument opisuje wewnętrzne bebechy modułu z [`src/core/pragma`](../src/core/pragma). Notatka „dla siebie" — żeby po powrocie do projektu przypomnieć sobie, **dlaczego** coś jest zrobione tak, a nie inaczej, gdzie są kruche miejsca i co zostało do zrobienia.

Pliki:

| Plik                                                    | Rola                                                                                          |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [`pragma.ts`](../src/core/pragma/pragma.ts)             | Statyczny manager scen, `EnginePhase` (bitmaska), `ITERATED_PHASES`, główna pętla `update()`  |
| [`scene.ts`](../src/core/pragma/scene.ts)               | Kontener aktorów, cache `actorsWithPhase`, wykonanie faz                                      |
| [`actor.ts`](../src/core/pragma/actor.ts)               | Kontener komponentów + tagi/marker + lifecycle (awake/start/destroy)                          |
| [`component.ts`](../src/core/pragma/component.ts)       | Bazowy komponent: budowa bitmaski faz, dostęp do sibling/scene/eventów                        |
| [`eventManager.ts`](../src/core/pragma/eventManager.ts) | `EventBus`, `SharedData`, oraz utilsy `Timer`/`IntervalTimer`/`Signal` do użycia w kodzie gry |
| [`types.d.ts`](../src/core/pragma/types.d.ts)           | Globalne typy (`PragmaPhase`, `PragmaComponentClass`, `PragmaPhaseRegistry`, ...)             |

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
  "preFixedUpdate",
  "fixedUpdate",
  "preUpdate",
  "update",
  "postUpdate",
  "render",
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
actorsInScene: Map<Symbol, PragmaActor>; // faktycznie żywi aktorzy
actorsDirty: Set<PragmaActor>; // aktorzy z pending add/remove komponentu
actorsWithPhase: Record<IteratedPragmaPhases, Set<PragmaActor>>; // cache: który aktor ma >=1 komponent w danej fazie
actorsToAdd: Set<PragmaActor>;
actorsToRemove: Set<PragmaActor>;
events: EventBus;
sharedData: SharedData;
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
phaseRegistrator: Record<IteratedPragmaPhases, Set<PragmaComponent>>;
```

Odpowiednik `actorsWithPhase` sceny, ale **na poziomie aktora**: które z jego komponentów mają co robić w danej fazie. `runPhase` sceny iteruje po `actorsWithPhase[phase]` (które aktory), a dla każdego — po `actor.phaseRegistrator[phase]` (które komponenty tego aktora).

`addToLocalPhases(component)` sprawdza bitmaskę: `if (component.phases & EnginePhase[phase])`. `updateScenePhases()` (wołane na końcu `resolvePending`) przelicza, czy aktor jako całość powinien być w `scene.actorsWithPhase[phase]`, patrząc czy `phaseRegistrator[phase].size > 0`.

### Lifecycle

| Hook aktora        | Kiedy                                  | Co robi                                                                                                                                                                                   |
| ------------------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onAwake()`        | raz, przy realnym dodaniu do sceny     | wypełnia `actorsWithPhase` sceny na podstawie `phaseRegistrator`, woła `awake()` na każdym komponencie, ustawia `isLive = true`                                                           |
| `onStart()`        | raz, po `onAwake()` całego batcha      | woła `start()` na każdym komponencie                                                                                                                                                      |
| `onDestroy()`      | raz, przy realnym usunięciu ze sceny   | woła `destroy()` na każdym komponencie, czyści aktora ze wszystkich `actorsWithPhase`, `isLive = false`                                                                                   |
| `resolvePending()` | co klatkę, jeśli aktor w `actorsDirty` | realizuje `pendingToAdd`/`pendingToRemove` z `addComponent`/`destroyComponent` wywołanych w locie; woła `awake()`/`destroy()` na dotkniętych komponentach; na końcu `updateScenePhases()` |
| `startPending()`   | tuż po `resolvePending()`              | woła `start()` na komponentach z `pendingToAdd`, czyści zbiór                                                                                                                             |

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
