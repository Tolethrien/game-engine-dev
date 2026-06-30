# Dogma — dokumentacja dla użytkownika

Dogma to akronim od "Data Oriented Game Mechanics Architecture".

Dogma to lekki silnik ECS-style, który zarządza scenami, systemami, encjami i komponentami. Pozwala budować prostą logikę gry lub aplikacji w oparciu o sceny, fazy aktualizacji i zależności między systemami.

## Najważniejsze pojęcia

### Scena

Scena jest kontenerem dla systemów i encji. Tworzysz ją przez:

```ts
const scene = Dogma.createScene("main", { priority: 1 });
```

Opcjonalnie możesz ustawić flagi sceny, takie jak:

- `isActive` — czy scena ma być aktywna
- `isRendered` — czy w ogóle wykonywać fazę render
- `isFocused` — flaga pomocnicza
- `priority` — kolejność scen przy sortowaniu

### System

System to klasa rozszerzająca `DogmaSystem`. Odpowiada za konkretne zachowanie, np. ruch, animację, renderowanie lub logikę AI.

Przykład:

```ts
class RenderSystem extends DogmaSystem {
  public onStart() {
    this.subscribeToPhase({
      phase: "render",
      callback: this.onRender.bind(this),
      after: ["Anim"],
    });
  }

  public onRender() {
    // logika renderowania
  }
}
```

System jest dodawany do sceny przez:

```ts
scene.addSystem("Rend");
```

### Encja

Encja to obiekt, który przechowuje komponenty. Przykład:

```ts
class PlayerEntity extends DogmaEntity {
  constructor() {
    super();
    this.addComponent("Move", { speed: 200 });
  }
}
```

### Komponent

Komponent to mały obiekt stanu, np. `Move`, `Trans` albo dowolny inny zarejestrowany w konfiguracji.

## Jak zarejestrować rzeczy w Dogmie

Wszystkie klasy systemów i komponentów muszą być dodane do `dogmaConfig`.

```ts
export const dogmaConfig = {
  systems: { Anim, Rend },
  components: { Move, Trans },
} satisfies DogmaConfig;
```

Dzięki temu `Dogma` wie, jak tworzyć instancje systemów i komponentów.

## Przebieg działania

### 1. Tworzenie sceny

```ts
const scene = Dogma.createScene("main");
```

### 2. Dodanie systemu

```ts
scene.addSystem("Rend");
```

### 3. Dodanie encji do sceny

```ts
const entity = new PlayerEntity();
EntityManager.spawnEntity(entity, "main");
```

### 4. Uruchomienie ticka

```ts
Dogma.tickAll();
```

`Dogma.tickAll()` wykonuje kolejno:

1. sortowanie scen po `priority`
2. dispatch systemów
3. dispatch encji
4. wywołanie subskrypcji fazowych: `preUpdate`, `fixedUpdate`, `update`, `postUpdate`, `eventsDeferred`, `render`

Warto wiedzieć:

- `fixedUpdate` może się wykonać wielokrotnie w jednym ticku, jeśli `Time.requestFixedUpdate()` zwraca `true`.
- `eventsDeferred` to faza, w której zaplanowane zdarzenia odroczone są przetwarzane przed `render`.
- `render` jest pomijany, jeśli scena ma `isRendered === false`.

## Fazy aktualizacji

Systemy mogą zapisywać się do następujących faz:

- `preUpdate`
- `fixedUpdate`
- `update`
- `postUpdate`
- `eventsDeferred`
- `render`

Każda faza jest uruchamiana w kolejności, którą silnik ustala na podstawie zależności między systemami.

Faza `eventsDeferred` jest przeznaczona dla odroczonych zdarzeń i płynie po rozliczeniu `postUpdate`, ale przed `render`.

## Zależności między systemami

Podczas rejestrowania subskrypcji możesz określić zależności:

```ts
this.subscribeToPhase({
  phase: "update",
  callback: this.onUpdate.bind(this),
  before: ["Anim"],
  after: ["Rend"],
});
```

- `before` — system ma wykonać się wcześniej niż wskazany system
- `after` — system ma wykonać się później niż wskazany system

Jeśli zależności są sprzeczne albo tworzą cykl, silnik zgłosi błąd.

## Najważniejsze metody systemu

W systemie możesz używać:

- `subscribeToPhase(...)` — zarejestruj callback w fazie
- `unSubscribeFromPhase(phase)` — usuń subskrypcję
- `setActive(true/false)` — włącz/wyłącz system
- `setSharedData(type, name, data)` / `getSharedData(...)` — dane współdzielone lokalnie lub globalnie
- `getComponentList(...)` / `getComponent(...)` — dostęp do komponentów sceny
- `query([...])` — zapytanie po komponentach
- `getComponentsWithTags(...)` — filtrowanie po tagach
- `getComponentWithMarker(...)` — dostęp do encji po markerze
- `events.subscribeToImmediate(eventName, callback)` — subskrypcja zdarzeń natychmiastowych
- `events.unsubscribeFromImmediate(eventName, ID)` — usuń subskrypcję natychmiastowego zdarzenia
- `events.subscribeToDeferred({ eventName, sysRef: this, callback, before?, after? })` — subskrypcja na odroczone zdarzenia w fazie `eventsDeferred`
- `events.unsubscribeFromDeferred(key)` — usuń subskrypcję odroczoną
- `events.emitImmediate(eventName, data)` — emituj zdarzenie natychmiastowo
- `events.emitDeferred(eventName, data)` — odłóż zdarzenie do fazy `eventsDeferred`
- `events.emitCascade(eventName, data)` — zapisz kaskadowe dane, które mogą być odczytane później
- `events.getCascade(eventName)` — pobierz dane z kaskady
- `events.deleteCascadeEvent(eventName)` — usuń dane z kaskady
- `events.emitDelayed({ eventName, data, delaySeconds, mode })` — opóźnione emitowanie zdarzenia
- `events.emitInterval({ eventName, data, intervalSeconds, totalSeconds, mode })` — powtarzające się emitowanie zdarzenia

## Najważniejsze metody encji

- `addComponent(name, ...args)` — dodaje komponent
- `addTag(tag)` — dodaje tag
- `setMarker(marker)` — ustawia marker
- `getComponents()` — zwraca mapę komponentów

## Warto wiedzieć

- `Dogma.tickAll()` powinno być wywoływane raz na klatkę.
- Sceny są sortowane po `priority`.
- `render` nie wykona się, jeśli scena ma `isRendered === false`.
- Systemy, które nie są aktywne, nie wykonują callbacków.
- Encje są dodawane do sceny dopiero podczas dispatcha encji, a usuwane podczas kolejnego kroku.
- `emitImmediate(...)` działa natychmiastowo, w miejscu wywołania.
- `emitDeferred(...)` działa w fazie `eventsDeferred`.
- `emitCascade(...)` przechowuje dane do późniejszego odczytu przez inne systemy lub fazy.
- `emitDelayed(...)` i `emitInterval(...)` są obsługiwane poprzez `Time.updateTimers(...)` wywoływane tuż przed fazą `update`.
