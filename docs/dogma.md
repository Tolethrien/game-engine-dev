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
    this.addTag("human"); // etykieta do grupowania
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

| Flaga        | Domyślnie         | Znaczenie                                                                               |
| ------------ | ----------------- | --------------------------------------------------------------------------------------- |
| `isActive`   | `true`            | Gdy `false` — scena pomija fazy `preUpdate`/`fixedUpdate`/`update`/`postUpdate`/timery. |
| `isRendered` | `true`            | Gdy `false` — pomijana jest faza `render`.                                              |
| `priority`   | kolejność dodania | Sceny są sortowane rosnąco; niższy `priority` = liczony wcześniej.                      |

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
    this.addComponent("Transform", {
      position: { x: 0, y: 0 },
      size: { width: 32, height: 32 },
    });
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

Zmiany są **kolejkowane** i wchodzą w życie na początku najbliższego ticku (patrz sekcja _Kolejkowanie_).

### Komponent

Czysta paczka danych, rozszerza `DogmaComponent`. Konstruktor zawsze zaczyna się od `internalProps` (wstrzykiwane przez DOGMA), a Twoje własne propsy idą dalej. Z klasy bazowej dostajesz gettery: `.ID`, `.tags`, `.marker`, `.componentName`.

### System

Logika, rozszerza `DogmaSystem`. Nie trzymaj w nim stanu gry — od tego są komponenty. W `onStart()` zwykle podpinasz metody do faz.

Hooki systemu:

| Hook             | Kiedy                            | Uwaga                                                                  |
| ---------------- | -------------------------------- | ---------------------------------------------------------------------- |
| `onStart()`      | raz, gdy system wchodzi do sceny | tu subskrybujesz fazy                                                  |
| `onDestroy()`    | raz, przy usuwaniu systemu       | sprzątanie                                                             |
| `onFrameStart()` | —                                | **zadeklarowane, ale jeszcze nie wywoływane** przez silnik (planowane) |
| `onFrameEnd()`   | —                                | jw.                                                                    |

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
  before: ["Render"], // wykonaj się PRZED systemem Render
  after: ["Inputs"], // ...i PO systemie Inputs
});
```

- `before: ["X"]` — ten callback ma iść przed callbackami systemu `X` w tej fazie,
- `after: ["X"]` — ma iść po `X`.

DOGMA sortuje fazy topologicznie. Jeśli zależności tworzą **cykl** albo sprzeczność (`X` jednocześnie przed i po `Y`, albo system wskazuje sam siebie) — silnik **rzuci błąd**.

> **Ważne**: `callback` musi być powiązany z `this` — używaj `this.metoda.bind(this)` albo `() => this.metoda()`. Goły `this.metoda` zgubi kontekst.

Wypisanie z fazy: `this.unSubscribeFromPhase("update")`.

---

## Dostęp do komponentów (w systemie)

| Metoda                                    | Zwraca                   | Do czego                                                               |
| ----------------------------------------- | ------------------------ | ---------------------------------------------------------------------- |
| `getComponentsGroup(["A", "B"])`          | `Set<Symbol>` (ID encji) | encje mające **wszystkie** wskazane komponenty; wynik jest cache'owany |
| `getComponentList("A")`                   | `Map<Symbol, A>`         | wszystkie komponenty danego typu w scenie                              |
| `getComponent(id, "A")`                   | `A \| undefined`         | konkretny komponent danej encji                                        |
| `getComponentsWithTags("A", ["t1","t2"])` | `Set<Symbol>`            | encje z komponentem `A` i **wszystkimi** podanymi tagami               |
| `getComponentWithMarker("Player", "A")`   | `A \| undefined`         | komponent encji o danym markerze                                       |

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
meta.addedToFrame; // encje dodane w tym ticku
meta.removedFromFrame; // encje usunięte w tym ticku
meta.inFrame; // wszystkie żywe encje sceny
```

---

## Dane współdzielone (Shared Data)

Do wartości, które nie należą do żadnej encji (np. czas świata, wynik):

```ts
this.setSharedData("scene", "score", { value: 0 }); // tylko ta scena
this.setSharedData("global", "time", { world: 0 }); // wszystkie sceny

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
  callback: (data) => {
    /* obsługa w fazie eventsDeferred */
  },
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
    this.addComponent("Transform", {
      position: { x: 0, y: 0 },
      size: { width: 1, height: 1 },
    });
    this.addTag("enemy");
    this.setMarker("Boss");
  }
}
EntityManager.spawnEntity(new Foo(), "Main");
EntityManager.removeEntity(foo.ID, "Main");

// System
class MySys extends DogmaSystem {
  onStart() {
    this.subscribeToPhase({
      phase: "update",
      callback: this.tick.bind(this),
      after: ["Inputs"],
    });
  }
  tick() {
    this.getComponentsGroup(["Transform", "Phys"]).forEach((id) => {
      /* ... */
    });
  }
}

// Pętla — raz na klatkę (robi to silnik):
Dogma.tickAll();
```

Szczegóły wewnętrzne (jak to działa pod spodem, ograniczenia, TODO) → [dogma-dev.md](./dogma-dev.md).

# DOGMA — notatki developerskie (jak to działa od środka)

**DOGMA** = **D**ata **O**riented **G**ame **M**echanics **A**rchitecture.

Ten dokument opisuje wewnętrzne bebechy modułu z [`src/core/dogma`](../src/core/dogma). To notatka „dla siebie” — żeby po powrocie do projektu przypomnieć sobie, **dlaczego** coś jest zrobione tak, a nie inaczej, gdzie są kruche miejsca i co zostało do zrobienia.

Pliki:

| Plik                                                     | Rola                                                      |
| -------------------------------------------------------- | --------------------------------------------------------- |
| [`dogma.ts`](../src/core/dogma/dogma.ts)                 | Statyczny manager scen + główna pętla `tickAll()`         |
| [`scene.ts`](../src/core/dogma/scene.ts)                 | Serce systemu: systemy, fazy, encje, komponenty, query    |
| [`system.ts`](../src/core/dogma/system.ts)               | Klasa bazowa systemu + całe publiczne API dla użytkownika |
| [`entity.ts`](../src/core/dogma/entity.ts)               | Kontener komponentów + tagi + marker                      |
| [`component.ts`](../src/core/dogma/component.ts)         | Bazowy komponent (dane + gettery do ID/tagów/markera)     |
| [`eventManager.ts`](../src/core/dogma/eventManager.ts)   | Immediate / deferred / cascade / timery                   |
| [`entityManager.ts`](../src/core/dogma/entityManager.ts) | Cienki fasada do spawn/remove encji                       |
| [`type.d.ts`](../src/core/dogma/type.d.ts)               | Globalne typy generowane z `dogmaConfig`                  |

---

## Filozofia dwóch faz: „to dispatch" i realizacja

Najważniejszy wzorzec w całym module: **nic nie dzieje się natychmiast**. Każda mutacja struktury (dodanie sceny, systemu, encji, subskrypcji fazy) trafia najpierw do bufora `*ToDispatch` / `*ToRemove`, a realna zmiana następuje na **początku ticku**, w kontrolowanym momencie.

Po co: dzięki temu w trakcie iteracji po encjach/systemach można bezpiecznie zlecać spawn/destroy bez psucia iteratorów i bez niedeterminizmu „kto pierwszy zdążył”.

Bufory:

- `Dogma`: `scenesToDispatch`, `scenesToRemoved`
- `DogmaScene`: `systemsToDispatch`, `systemsToRemove`, `entityToDispatch`, `entityToRemove`, `phaseToDispatch`, `phaseToRemove`

---

## `Dogma` (manager scen)

Cały stan statyczny:

- `scenes: Map<string, DogmaScene>` — aktywne sceny,
- `scenesToDispatch`, `scenesToRemoved` — bufory,
- `sceneSorted: DogmaScene[]` — sceny posortowane po `priority`, po tej liście iteruje pętla,
- `globalSharedData: Map<string, SharedData>` — dane globalne (współdzielone między scenami).

`createScene` domyślnie nadaje `priority = scenes.size + scenesToDispatch.size` (kolejny numer), chyba że podasz własny. Nowa scena ląduje w `scenesToDispatch` — jest widoczna dopiero po najbliższym `sceneDispatcher()`.

### `tickAll()` — dokładna kolejność

```
1.  sceneDispatcher()                      // dopnij/usuń sceny, przesortuj sceneSorted po priority
2.  for scene: scene.systemDispatcher()    // dopnij systemy (onStart), usuń (onDestroy), sortuj fazy
3.  for scene: scene.entityDispatcher()    // realny spawn/remove encji + aktualizacja cache
4.  for scene (isActive): phase preUpdate
5.  while Time.requestFixedUpdate():
        for scene (isActive): phase fixedUpdate
6.  Time.switchToUpdateContext()
7.  for scene (isActive): eventManager.updateTimers(frameDtMs)   // delayed/interval
8.  for scene (isActive): phase update
9.  for scene (isActive): phase postUpdate
10. Time.updateAlpha()                      // alfa interpolacji dla renderu
11. for scene: phase eventsDeferred; eventManager.flush()   // obsłuż odroczone, potem wyczyść kolejki
12. for scene (isRendered): phase render
```

Uwagi:

- Kroki 2 i 3 są rozbite na **osobne pętle po wszystkich scenach** (najpierw wszystkie systemy, potem wszystkie encje) — nie „scena po scenie w całości”.
- Warunek pomijania: fazy 4–9 sprawdzają `scene.getFlags().isActive`; faza 11 (`eventsDeferred`) leci **zawsze** (ale sam callback sprawdza `entry.sysRef.isActive()`); faza 12 sprawdza `isRendered`.
- Każdy `PhaseEntry` przed odpaleniem sprawdza `entry.sysRef.isActive()` — nieaktywny system jest cicho pomijany.
- `updateTimers` jest po `switchToUpdateContext`, więc timery liczą `frameDtMs` z kontekstu update, nie fixed.

---

## `DogmaScene` (najgrubszy plik)

### Główne struktury

```ts
components: Map<
  string /*componentName*/,
  Map<Symbol /*entityID*/, DogmaComponent>
>;
systems: Map<string, DogmaSystem>;
phaseManager: Record<DogmaPhase, PhaseEntry[]>; // subskrypcje per faza (już posortowane)

queries: Map<string /*"A|B"*/, Set<Symbol>>; // wynik query po komponentach
queryFilters: Map<string, ComponentRegistryKeys[]>; // definicja query (jakie komponenty)

tagsQuery: Map<string /*"t1|t2"*/, Set<Symbol>>;
tagsQueryFilter: Map<string /*tag*/, Set<string /*queryKey*/>>; // tag -> które query go dotyczą

markerQuery: Map<string /*marker*/, Symbol /*entityID*/>;
markerMap: Map<Symbol /*entityID*/, string /*marker*/>; // odwrotność, do sprzątania

entitiesInFrame: {
  (addedToFrame, removedFromFrame, inFrame);
} // Set<Symbol>
```

Klucz query to **posortowane alfabetycznie nazwy złączone `|`** (`["Phys","Transform"].sort().join("|")` → `"Phys|Transform"`). Sortowanie gwarantuje ten sam klucz niezależnie od kolejności argumentów.

### `entityDispatcher()`

Na starcie czyści `addedToFrame` i `removedFromFrame` (to metadane „co się zdarzyło w tym ticku”), potem realizuje kolejki:

**dispatchEntities()** dla każdej encji z `entityToDispatch`:

1. dopisz ID do `inFrame` i `addedToFrame`,
2. jeśli ma marker (`!== ""`) → `markerQuery[marker] = ID`, `markerMap[ID] = marker`,
3. zbuduj klucz z tagów encji i jeśli istnieje `tagsQuery[key]` → dopisz ID,
4. wrzuć każdy komponent do `components[name]`,
5. przejrzyj **wszystkie** istniejące `queries` i dopisz ID tam, gdzie encja ma komplet wymaganych komponentów.

**removeEntities()** — lustrzane sprzątanie: usuwa z `inFrame` (+ `removedFromFrame`), markerów, wszystkich `tagsQuery`, `components` (kasuje pustą mapę typu) i wszystkich `queries`.

### `systemDispatcher()`

Kolejno: dopnij systemy z `systemsToDispatch` → odpal ich `onStart()` → dopnij `phaseToDispatch` do `phaseManager` → usuń `phaseToRemove` → usuń `systemsToRemove` (odpalając `onDestroy()` i czyszcząc ich subskrypcje z każdej fazy). Na końcu, jeśli cokolwiek się zmieniło (`needSorting`), sortuje **każdą** listę fazy topologicznie.

### Sortowanie topologiczne faz (`sortPhaseByDependencies`) — kod oznaczony `//AI`

Klasyczny Kahn:

- buduje graf: `before` → krawędź `entry → other`, `after` → krawędź `other → entry`,
- liczy `inDegree`, kolejkuje węzły o stopniu 0, zdejmuje po kolei,
- jeśli `sorted.length !== entries.length` → został cykl → `throw` z listą zamieszanych systemów.

`validatePhaseConstraints` (wołane przy dodawaniu subskrypcji) łapie wcześniej trywialne sprzeczności: system w swoim własnym `before`/`after`, oraz ten sam system jednocześnie w `before` i `after`.

> Zależności `before`/`after` odnoszą się do `systemName`. Dla subskrypcji deferred `systemName` jest **syntetyczny**: `Event(<eventName>)InSystem(<systemName>)` — patrz EventManager.

---

## Encje i komponenty

### `DogmaEntity`

- `ID: Symbol` — `Symbol(createUUID())`. Tożsamość encji przez referencję symbolu; opis symbolu to UUID (przydatne w komunikatach `assert`).
- `marker: [string]` — **celowo tablica jednoelementowa**, nie string. Powód: komponenty dostają referencję do tej samej tablicy, więc `setMarker` zmienia marker „widziany” przez wszystkie komponenty encji bez rozsyłania. To samo dotyczy `tags: Set` (wspólna referencja).
- `addComponent(name, ...args)` — asercja przeciw duplikatom, buduje `InternalDCProps` (`ID`, `tags`, `componentName`, `marker`) i tworzy instancję z `dogmaConfig.components[name]`, doklejając Twoje `args` **po** internalProps.

### `DogmaComponent`

Trzyma prywatnie `entityID`, `entityTags`, `entityMarker` (ta wspólna tablica), `componentName`. Wystawia gettery `.ID`, `.tags`, `.marker`, `.componentName`. Komponent zna swoją encję tylko przez te dane — nie ma wskaźnika na `DogmaEntity`.

### `EntityManager`

Naprawdę cienki: `spawnEntity` → `scene.entityToDispatch.add`, `removeEntity` → `scene.entityToRemove.add`. `cloneEntity` / `moveEntity` są zakomentowane (TODO). Sensownie mogłoby to zniknąć na rzecz eventów (patrz TODO).

---

## System query

### Po komponentach — `getComponentsGroup([...])`

W systemie: liczy klucz (`sort().join("|")`), zwraca `getQueryResult(key)` jeśli jest w cache, inaczej `createQuery(key, list)`.

`createQuery` rejestruje `queries[key]` i `queryFilters[key]`, po czym **od razu wypełnia** wynik: bierze mapę pierwszego komponentu i sprawdza dla każdego ID, czy występuje w mapach pozostałych. Od tego momentu cache jest **utrzymywany przyrostowo** przez `dispatchEntities`/`removeEntities`.

> Sygnatura wymaga `readonly [T, T, ...T[]]` — czyli **minimum dwa** typy komponentów. Do jednego typu użyj `getComponentList`.

### Po tagach — `getComponentsWithTags(component, tags)`

Analogicznie: cache w `tagsQuery`, wypełniane w `createTagsQuery` przez `tagsSet.isSubsetOf(comp.tags)`. Dodatkowo buduje odwrotny indeks `tagsQueryFilter: tag → {queryKeys}`, żeby `updateTagsQuery` (wołane z `addEntityTag`/`removeEntityTag`) mogło punktowo przeliczyć tylko dotknięte query.

### Po markerze — `getComponentWithMarker(marker, component)`

`markerQuery[marker]` → ID → `components[component].get(ID)`.

---

## EventManager

Cztery niezależne mechanizmy, wszystkie per-scena:

| Mechanizm | Struktura                                             | Kiedy odpala                                 | Czyszczenie                       |
| --------- | ----------------------------------------------------- | -------------------------------------------- | --------------------------------- |
| immediate | `immediateEvents: Map<name, Map<Symbol, Subscriber>>` | synchronicznie w `emitImmediate`             | subskrypcja żyje do `unsubscribe` |
| deferred  | `deferredEvents: Map<name, EventData[]>`              | callbacki w fazie `eventsDeferred`           | `flush()` na końcu ticku          |
| cascade   | `cascadeEvents: Map<name, EventData[]>`               | odczyt przez `getCascade` w tej samej klatce | `flush()` na końcu ticku          |
| timery    | `timeEvents: TimeEvent[]`                             | `updateTimers` przed fazą update             | zdejmowane po wygaśnięciu         |

Szczegóły:

- **subscribeToDeferred** nie tworzy osobnej listy subskrybentów — rejestruje `PhaseEntry` w fazie `eventsDeferred` z syntetycznym `systemName` (`Event(...)InSystem(...)`). To pozwala odroczonym eventom uczestniczyć w sortowaniu `before`/`after` tak jak zwykłe systemy. Callback iteruje po `deferredEvents[eventName]`.
- **cascade** to nie tyle „event”, co jednorazowy schowek danych na jedną klatkę (użyty w sandboxie: `Inputs`/`Physics` piszą `"test"` w preUpdate, `Render` czyta w postUpdate).
- **timery** (`updateTimers`): iteracja od końca (bezpieczne `splice`). Bez `interval` = one-shot. Z `interval` = powtarzaj co `nextTickTime`, aż `remainingTime <= 0`. `mode` decyduje, czy tyknięcie leci przez `emitImmediate` czy `emitDeferred`.
- `flush()` czyści **cascade i deferred** (immediate i timery nie).

---

## `dogmaConfig` i typowanie

`type.d.ts` deklaruje globalnie typy pochodne od `dogmaConfig`:

```ts
type ComponentRegistryKeys = keyof typeof dogmaConfig.components;
type SystemRegistryKeys = keyof typeof dogmaConfig.systems;
// + ComponentRegistry, SystemRegistry, DropFirst, DogmaPhase, DogmaConfig
```

Dzięki temu `addComponent("Transform", ...)` jest w pełni typowane, a `DropFirst<ConstructorParameters<...>>` odcina `internalProps` z sygnatury, żeby użytkownik podawał tylko własne propsy.

> **Znany zapach / bug (todo)**: interfejs `DogmaConfig` w `type.d.ts` wskazuje na `Component`/`System` zamiast `DogmaComponent`/`DogmaSystem`, bo poprawka powoduje pętlę zależności typów. Docelowo do wydzielenia do osobnego pliku.

---

## Znane ograniczenia i pułapki (stan obecny)

1. **`onFrameStart` / `onFrameEnd` nie są wołane.** Są zadeklarowane w `DogmaSystem`, ale `tickAll` ich nie odpala. TODO: wpiąć w pętlę (miejsce na profilowanie/debug per-klatka).
2. **Brak dodawania/usuwania komponentów w locie.** Encja składa komponenty w konstruktorze; nie ma API do zmiany składu żywej encji. To dlatego `marker`/`tags` mogły być wspólną referencją (patrz komentarz w todo o `[string]`).
3. **Tag-query dla nowych encji działa tylko na exact-match klucza.** W `dispatchEntities` nowa encja dopisuje się do `tagsQuery[key]` tylko gdy `key` = **wszystkie** jej tagi posortowane. Query po **podzbiorze** tagów istniejącym wcześniej może nie złapać nowej encji, dopóki nie ruszy jej tagów przez `updateTagsQuery`. Do dopracowania.
4. **Query nie są czyszczone przy usunięciu wszystkich encji** — wpis w `queries`/`queryFilters` zostaje (pusty `Set`). Do rozważenia GC nieużywanych query.
5. **Brak poolingu** komponentów/encji — każda encja tworzy świeże instancje. Pomysł: reużywać istniejące transformy zamiast alokować setki.
6. **`getComponentsGroup` — `as const` w typach** jest brzydkie; do wygładzenia.
7. **Brak `NOT`/exclude w query** (np. „wszystkie `Transform` bez `Rigid`”).

---

## Co dalej (roadmapa z `todo.md`)

- Pakowanie encji do jednego pliku i przenoszenie między scenami (serializacja + `moveEntity`).
- Singletonowe komponenty na scenę (globalny stan typu „czas świata” bez encji).
- Relacje parent/child z propagacją danych i poprawną kolejnością liczenia.
- Wpięcie `onFrameStart`/`onFrameEnd`.
- Typy `dataEvent` w `this.events` (obecnie brak typowania payloadów eventów).
- Możliwość `omit` na subskrybencie fazy, żeby nie generować sztucznego eventu fazy.
- Ewentualne wchłonięcie `EntityManager` do sceny, gdy dojrzeje system eventów.

---

## Jak rozszerzać

**Nowy komponent:** klasa `extends DogmaComponent` (konstruktor `(internalProps, props)`) → dopisz do `dogmaConfig.components` → używaj przez `addComponent("Nazwa", props)`.

**Nowy system:** klasa `extends DogmaSystem` → w `onStart()` `subscribeToPhase(...)` → dopisz do `dogmaConfig.systems` → `scene.addSystem("Nazwa")`.

**Nowa faza:** trzeba ruszyć trzy miejsca — typ `DogmaPhase` (`type.d.ts`), obiekt `phaseManager` (`scene.ts`) i pętlę `tickAll()` (`dogma.ts`), wpinając nową fazę w odpowiednim momencie.
