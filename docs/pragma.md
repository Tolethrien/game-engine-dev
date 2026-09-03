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

| Metoda | Do czego |
|--------|----------|
| `addComponent(Ctor, ...args)` | dodaje komponent (nie można dodać dwóch tego samego typu); jeśli aktor jest już "żywy" na scenie, dodanie jest **kolejkowane** i realizowane na początku najbliższej klatki |
| `destroyComponent(Ctor)` | usuwa komponent (nie można usunąć `Transform`); też kolejkowane, gdy aktor jest żywy |
| `getComponent(Ctor)` | zwraca komponent danego typu lub `undefined` |
| `hasComponent(Ctor)` | czy aktor ma dany komponent |
| `getAllComponents()` | iterator po wszystkich komponentach |
| `transform` | skrót do komponentu `Transform` |
| `setMarker(name)` / `getMarker()` | unikalny identyfikator aktora (czysto informacyjny) |
| `tags` | `Set<string>` — dodawaj/usuwaj wprost (`actor.tags.add("x")`) |
| `setVisibility(bool)` / `getVisibility()` | steruje, czy faza `render` odpala się dla tego aktora |
| `setEnabled(bool)` / `getEnabled()` | steruje, czy fazy inne niż `render` odpalają się dla tego aktora |
| `selfDestroy()` | kolejkuje usunięcie samego siebie ze sceny |

> **Runtime dodawanie/usuwanie komponentów działa**, ale dopiero od **następnej klatki** (`resolvePending()` w fazie `preUpdate`).

### Komponent (`PragmaComponent`)

Dane + logika w jednym. Dostępne z klasy bazowej:

| Metoda / getter | Do czego |
|------------------|----------|
| `this.actor` | referencja do aktora-właściciela |
| `this.name` | nazwa klasy (`this.constructor.name`) |
| `this.scene` | skrót do `this.actor.scene` |
| `this.tags` | skrót do `this.actor.tags` |
| `getSibling(Ctor)` | pobiera inny komponent **tego samego** aktora |
| `destroySelf()` | usuwa siebie z aktora (kolejkowane jak `actor.destroyComponent`) |
| `setEnabled(bool)` / `getEnabled()` | wyłącza pojedynczy komponent — jego metody fazowe przestają się odpalać, mimo że aktor pozostaje aktywny |
| `systemSharedData` | skrót do `this.scene.sharedData` |

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
Pragma.onGlobalEvent("GamePaused", (data) => { /* ... */ });
Pragma.offGlobalEvent("GamePaused", cb);

// Scena — w komponencie
this.emitSceneEvent("SpawnWave", { count: 5 });
this.onSceneEvent("SpawnWave", (data) => { /* ... */ });

// Aktor — w komponencie, komunikacja między własnymi komponentami / z zewnątrz
this.emitActorEvent("DamageTaken", { amount: 10 });
this.onActorEvent("DamageTaken", (data) => { /* ... */ });
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
