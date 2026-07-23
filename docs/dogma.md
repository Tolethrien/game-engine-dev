# DOGMA — dokumentacja dla użytkownika

**DOGMA** = **D**ata **O**riented **G**ame **M**echanics **A**rchitecture.

To lekki silnik w stylu **ECS** (Entity–Component–System). Organizuje logikę gry/aplikacji w:

- **Sceny** — niezależne światy z własnymi systemami i encjami,
- **Encje** — obiekty złożone z komponentów,
- **Komponenty** — czyste dane (stan),
- **Systemy** — logika, która co klatkę operuje na komponentach,
- **Fazy** — uporządkowane etapy pętli klatki (`preUpdate`, `fixedUpdate`, `update`, `postUpdate`, `eventsDeferred`, `render`),
- **Eventy** — komunikacja między systemami (natychmiastowa, odroczona, kaskadowa, czasowa).

> Zasada ECS: komponenty **nie mają logiki**, systemy **nie mają stanu** (poza konfiguracją). Cały stan siedzi w komponentach, cała logika w systemach.

---

## Szybki start

Poniżej pełny, działający przykład z `src/sandbox` — kręcący się kwadrat spadający na podłogę.

### 1. Komponenty (czyste dane)

```ts
// src/sandbox/components/transform.ts
import DogmaComponent, { InternalDCProps } from "@/core/dogma/component";

interface TransformProps {
  position: Position2D;
  size: Size2D;
}

export default class Transform extends DogmaComponent {
  public position: Position2D;
  public prevPosition: Position2D;
  public size: Size2D;

  // UWAGA: pierwszy argument konstruktora to ZAWSZE internalProps (dostaje go DOGMA),
  // Twoje własne propsy zaczynają się od drugiego argumentu.
  constructor(internalProps: InternalDCProps, props: TransformProps) {
    super(internalProps);
    this.position = props.position;
    this.prevPosition = props.position;
    this.size = props.size;
  }
}
```

```ts
// src/sandbox/components/phys.ts
export default class Phys extends DogmaComponent {
  public velocity = { x: 0, y: 0 };
  public acceleration = { x: 0, y: 0 };
  public gravityScale = 1;
  public isGrounded = false;

  constructor(internalProps: InternalDCProps, props: PhysProps) {
    super(internalProps);
  }
}
```

### 2. Encja (kontener komponentów)

```ts
// src/sandbox/entities/player.ts
import DogmaEntity from "@/core/dogma/entity";

export default class Player extends DogmaEntity {
  constructor() {
    super();
    this.addComponent("Transform", {
      position: { x: 10, y: 10 },
      size: { width: 100, height: 100 },
    });
    this.addComponent("Phys", {});
    this.setMarker("Player"); // unikalny "adres" tej encji w scenie
    this.addTag("human");     // etykieta do grupowania
  }
}
```

### 3. System (logika)

```ts
// src/sandbox/systems/physics.ts
import DogmaSystem from "@/core/dogma/system";
import Time from "@/core/engine/time";

const GLOBAL_GRAVITY = 980;
const FLOOR_Y = 650;

export default class Physics extends DogmaSystem {
  public onStart(): void {
    // Zapisz metodę do fazy fixedUpdate; wykonaj ją PO systemie "Inputs".
    this.subscribeToPhase({
      phase: "fixedUpdate",
      callback: this.updatePhysics.bind(this),
      after: ["Inputs"],
    });
  }

  private updatePhysics() {
    const dt = Time.getFixedDeltaTime() / 1000;

    // Pobierz wszystkie encje mające JEDNOCZEŚNIE Transform i Phys.
    const entities = this.getComponentsGroup(["Transform", "Phys"]);

    entities.forEach((id) => {
      const transform = this.getComponent(id, "Transform");
      const physics = this.getComponent(id, "Phys");
      if (!transform || !physics) return;

      transform.prevPosition.x = transform.position.x;
      transform.prevPosition.y = transform.position.y;

      if (!physics.isGrounded) {
        physics.velocity.y += GLOBAL_GRAVITY * physics.gravityScale * dt;
      }
      transform.position.x += physics.velocity.x * dt;
      transform.position.y += physics.velocity.y * dt;

      const bottomY = transform.position.y + transform.size.height;
      if (bottomY >= FLOOR_Y) {
        transform.position.y = FLOOR_Y - transform.size.height;
        physics.velocity.y = 0;
        physics.isGrounded = true;
      }
    });
  }
}
```

### 4. Rejestracja w configu

Wszystkie systemy i komponenty **muszą** być zebrane w `dogmaConfig` — DOGMA tworzy z niego instancje po nazwie (stringu) i z niego buduje typy.

```ts
// src/sandbox/configs.ts
import Phys from "./components/phys";
import Transform from "./components/transform";
import Inputs from "./systems/inputs";
import Physics from "./systems/physics";
import Render from "./systems/render";

export const dogmaConfig = {
  systems: { Render, Inputs, Physics },
  components: { Transform, Phys },
} satisfies DogmaConfig;
```

Klucze z tego obiektu (`"Transform"`, `"Physics"`, ...) to jedyne poprawne nazwy, jakich używasz w `addComponent`, `addSystem`, `getComponentsGroup` itd. Są w pełni typowane.

### 5. Złożenie sceny

```ts
// src/sandbox/index.ts
function setup() {
  const main = Dogma.createScene("Main");
  main.addSystem("Inputs");
  main.addSystem("Physics");
  main.addSystem("Render");

  const player = new Player();
  const wall = new Wall();
  EntityManager.spawnEntity(player, "Main");
  EntityManager.spawnEntity(wall, "Main");
}
```

Silnik gry wywołuje `Dogma.tickAll()` raz na klatkę — to on napędza wszystkie sceny.

---

## Pojęcia

### Scena

Kontener na systemy i encje. Sceny są od siebie niezależne (osobne komponenty, systemy, eventy, dane lokalne).

```ts
const scene = Dogma.createScene("Main", { priority: 1 });
```

Flagi sceny (`PartialDSFlags`):

| Flaga        | Domyślnie | Znaczenie |
|--------------|-----------|-----------|
| `isActive`   | `true`    | Gdy `false` — scena pomija fazy `preUpdate`/`fixedUpdate`/`update`/`postUpdate`/timery. |
| `isRendered` | `true`    | Gdy `false` — pomijana jest faza `render`. |
| `priority`   | kolejność dodania | Sceny są sortowane rosnąco; niższy `priority` = liczony wcześniej. |

Gdy nie podasz `priority`, scena dostaje kolejny numer wg kolejności utworzenia.

Metody `Dogma`:

- `Dogma.createScene(name, flags?)` — tworzy scenę (aktywuje się przy najbliższym ticku),
- `Dogma.deleteScene(name)` — kolejkuje usunięcie,
- `Dogma.getScene(name)` — pobiera scenę,
- `Dogma.getAllScenes()` — mapa aktywnych scen,
- `Dogma.tickAll()` — jedna klatka wszystkich scen.

### Encja

Obiekt = zbiór komponentów + tagi + marker. Sama nie ma logiki.

```ts
class Player extends DogmaEntity {
  constructor() {
    super();
    this.addComponent("Transform", { position: { x: 0, y: 0 }, size: { width: 32, height: 32 } });
    this.addTag("enemy");
    this.setMarker("Player");
  }
}
```

Metody encji:

- `addComponent(name, ...args)` — dodaje komponent (nie można dodać dwóch tego samego typu),
- `addTag(tag)` — etykieta do grupowania wielu encji,
- `setMarker(marker)` — **unikalny** identyfikator do wskazania jednej konkretnej encji,
- `getComponents()`, `getTags()`, `getMarker()`.

> **Tag vs Marker**: tag = "wielu" (wszyscy `"enemy"`), marker = "jeden" (`"Player"`, `"MainCamera"`).

Encja pojawia się/znika w scenie przez `EntityManager`:

```ts
EntityManager.spawnEntity(entity, "Main");
EntityManager.removeEntity(entity.ID, "Main");
```

Zmiany są **kolejkowane** i wchodzą w życie na początku najbliższego ticku (patrz sekcja *Kolejkowanie*).

### Komponent

Czysta paczka danych, rozszerza `DogmaComponent`. Konstruktor zawsze zaczyna się od `internalProps` (wstrzykiwane przez DOGMA), a Twoje własne propsy idą dalej. Z klasy bazowej dostajesz gettery: `.ID`, `.tags`, `.marker`, `.componentName`.

### System

Logika, rozszerza `DogmaSystem`. Nie trzymaj w nim stanu gry — od tego są komponenty. W `onStart()` zwykle podpinasz metody do faz.

Hooki systemu:

| Hook            | Kiedy | Uwaga |
|-----------------|-------|-------|
| `onStart()`     | raz, gdy system wchodzi do sceny | tu subskrybujesz fazy |
| `onDestroy()`   | raz, przy usuwaniu systemu | sprzątanie |
| `onFrameStart()`| — | **zadeklarowane, ale jeszcze nie wywoływane** przez silnik (planowane) |
| `onFrameEnd()`  | — | jw. |

---

## Pętla klatki (`Dogma.tickAll()`)

Jeden tick wykonuje po kolei:

1. **Dispatch scen** — dopięcie nowych / usunięcie skasowanych scen, sortowanie po `priority`.
2. **Dispatch systemów** (każda scena) — dopięcie nowych systemów (`onStart()`), usunięcie skasowanych (`onDestroy()`), sortowanie faz.
3. **Dispatch encji** (każda scena) — realne dodanie/usunięcie encji, aktualizacja markerów, tagów i cache zapytań.
4. **`preUpdate`** — dla scen aktywnych.
5. **`fixedUpdate`** — w pętli, tyle razy ile zwróci `Time.requestFixedUpdate()` (stały krok czasu, deterministyczna fizyka).
6. **Timery** — `emitDelayed` / `emitInterval` są rozliczane tuż przed `update`.
7. **`update`** — główna logika klatkowa.
8. **`postUpdate`** — po logice.
9. Wyliczenie **alfy interpolacji** (do płynnego renderu).
10. **`eventsDeferred`** — obsługa zdarzeń odroczonych, potem czyszczenie kolejek eventów (`flush`).
11. **`render`** — tylko dla scen z `isRendered === true`.

Kluczowe konsekwencje:

- `fixedUpdate` może wykonać się 0, 1 lub kilka razy na klatkę → tam rób fizykę.
- Render dostaje `Time.getAlpha()` do interpolacji między `prevPosition` a `position` (patrz `render.ts`).
- Nieaktywna scena / nieaktywny system są po prostu pomijane.

---

## Fazy i kolejność systemów

Metodę systemu podpinasz do fazy przez `subscribeToPhase`. Możesz wymusić kolejność względem innych systemów:

```ts
this.subscribeToPhase({
  phase: "update",
  callback: this.onUpdate.bind(this),
  before: ["Render"],   // wykonaj się PRZED systemem Render
  after: ["Inputs"],    // ...i PO systemie Inputs
});
```

- `before: ["X"]` — ten callback ma iść przed callbackami systemu `X` w tej fazie,
- `after: ["X"]` — ma iść po `X`.

DOGMA sortuje fazy topologicznie. Jeśli zależności tworzą **cykl** albo sprzeczność (`X` jednocześnie przed i po `Y`, albo system wskazuje sam siebie) — silnik **rzuci błąd**.

> **Ważne**: `callback` musi być powiązany z `this` — używaj `this.metoda.bind(this)` albo `() => this.metoda()`. Goły `this.metoda` zgubi kontekst.

Wypisanie z fazy: `this.unSubscribeFromPhase("update")`.

---

## Dostęp do komponentów (w systemie)

| Metoda | Zwraca | Do czego |
|--------|--------|----------|
| `getComponentsGroup(["A", "B"])` | `Set<Symbol>` (ID encji) | encje mające **wszystkie** wskazane komponenty; wynik jest cache'owany |
| `getComponentList("A")` | `Map<Symbol, A>` | wszystkie komponenty danego typu w scenie |
| `getComponent(id, "A")` | `A \| undefined` | konkretny komponent danej encji |
| `getComponentsWithTags("A", ["t1","t2"])` | `Set<Symbol>` | encje z komponentem `A` i **wszystkimi** podanymi tagami |
| `getComponentWithMarker("Player", "A")` | `A \| undefined` | komponent encji o danym markerze |

Typowy wzorzec (iteracja po grupie):

```ts
const ids = this.getComponentsGroup(["Transform", "Phys"]);
ids.forEach((id) => {
  const t = this.getComponent(id, "Transform");
  const p = this.getComponent(id, "Phys");
  if (!t || !p) return;
  // ...logika
});
```

Tagi w locie:

```ts
this.addEntityTag(component, "onFire");
this.removeEntityTag(component, "onFire");
```

Metadane cyklu życia encji w tej klatce:

```ts
const meta = this.getEntitiesInFrameMeta();
meta.addedToFrame;    // encje dodane w tym ticku
meta.removedFromFrame; // encje usunięte w tym ticku
meta.inFrame;         // wszystkie żywe encje sceny
```

---

## Dane współdzielone (Shared Data)

Do wartości, które nie należą do żadnej encji (np. czas świata, wynik):

```ts
this.setSharedData("scene", "score", { value: 0 });   // tylko ta scena
this.setSharedData("global", "time", { world: 0 });   // wszystkie sceny

const score = this.getSharedData("scene", "score");
this.removeSharedData("global", "time");
```

- `"scene"` — widoczne tylko w tej scenie,
- `"global"` — widoczne we wszystkich scenach.

---

## Eventy

Dostęp przez `this.events` w systemie. Cztery mechanizmy:

### 1. Immediate (natychmiastowe)

Callback odpala się **w miejscu wywołania**, synchronicznie.

```ts
const id = this.events.subscribeToImmediate("DamageTaken", (data) => {
  console.log("Otrzymano obrażenia:", data.amount);
});
this.events.emitImmediate("DamageTaken", { amount: 10 });
this.events.unsubscribeFromImmediate("DamageTaken", id);
```

### 2. Deferred (odroczone)

Emisja odkłada dane do kolejki; callbacki odpalają się zbiorczo w fazie `eventsDeferred`. Subskrypcja może mieć `before`/`after` względem innych systemów.

```ts
const key = this.events.subscribeToDeferred({
  eventName: "SpawnEnemy",
  sysRef: this,
  callback: (data) => { /* obsługa w fazie eventsDeferred */ },
  after: ["Physics"],
});
this.events.emitDeferred("SpawnEnemy", { type: "orc" });
this.events.unsubscribeFromDeferred(key);
```

### 3. Cascade (kaskadowe / dane jednorazowe)

Zapisujesz dane pod nazwą, inny system może je odczytać **w tej samej klatce**. Kolejka jest czyszczona pod koniec ticka (`flush`), więc dane żyją tylko jedną klatkę.

```ts
// system A (np. w preUpdate):
this.events.emitCascade("test", { test: 3 });

// system B (np. w postUpdate/render):
const data = this.events.getCascade("test"); // tablica zapisanych paczek
```

### 4. Czasowe (delayed / interval)

```ts
// jednorazowo po 2 sekundach:
this.events.emitDelayed({
  eventName: "Boom",
  data: {},
  delaySeconds: 2,
  mode: "deferred", // "immediate" albo "deferred"
});

// co 0.5s przez 10s:
this.events.emitInterval({
  eventName: "Tick",
  data: {},
  intervalSeconds: 0.5,
  totalSeconds: 10,
  mode: "immediate",
});
```

Timery rozliczane są tuż przed fazą `update`, więc `mode: "immediate"` odpala odbiorców od razu, a `mode: "deferred"` — w fazie `eventsDeferred` tej samej klatki.

---

## Ściąga (cheat sheet)

```ts
// Scena
const scene = Dogma.createScene("Main", { priority: 0 });
scene.addSystem("Physics");
scene.removeSystem("Physics");
scene.setFlag({ isActive: false });
Dogma.deleteScene("Main");

// Encja
class Foo extends DogmaEntity {
  constructor() {
    super();
    this.addComponent("Transform", { position: {x:0,y:0}, size: {width:1,height:1} });
    this.addTag("enemy");
    this.setMarker("Boss");
  }
}
EntityManager.spawnEntity(new Foo(), "Main");
EntityManager.removeEntity(foo.ID, "Main");

// System
class MySys extends DogmaSystem {
  onStart() {
    this.subscribeToPhase({ phase: "update", callback: this.tick.bind(this), after: ["Inputs"] });
  }
  tick() {
    this.getComponentsGroup(["Transform", "Phys"]).forEach((id) => { /* ... */ });
  }
}

// Pętla — raz na klatkę (robi to silnik):
Dogma.tickAll();
```

Szczegóły wewnętrzne (jak to działa pod spodem, ograniczenia, TODO) → [dogma-dev.md](./dogma-dev.md).
