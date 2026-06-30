# Dogma — dokumentacja dla developerów

Dogma to akronim od "Data Oriented Game Mechanics Architecture".

Ten dokument opisuje wewnętrzne działanie modułu Dogma w katalogu [src/core/dogma](../src/core/dogma). Jest przeznaczony dla osób, które chcą rozumieć, jak silnik działa od środka lub rozszerzać go o nowe funkcje.

## Architektura

Dogma składa się z kilku warstw:

- `Dogma` — statyczny manager scen
- `DogmaScene` — zarządzanie systemami, fazami, encjami i komponentami
- `DogmaSystem` — abstrakcja systemu z API do subskrypcji i dostępu do danych
- `DogmaEntity` — kontener komponentów, tagów i markera
- `DogmaComponent` — lekki obiekt stanu
- `EntityManager` — pomocnik do dodawania/usuwania encji ze sceny

## Główne struktury danych

### Dogma

Klasa `Dogma` przechowuje:

- `scenes` — aktywne sceny
- `scenesToDispatch` — sceny oczekujące na zarejestrowanie
- `scenesToRemoved` — sceny oczekujące na usunięcie
- `sceneSorted` — uporządkowane sceny do aktualizacji
- `globalSharedData` — dane współdzielone globalnie

#### Flow ticka

Metoda `tickAll()` robi kolejno:

1. `sceneDispatcher()` — przetwarza sceny w `scenesToDispatch` i `scenesToRemoved`, zapisuje je do `scenes`, a następnie sortuje `sceneSorted` po `priority`.
2. `systemDispatcher()` dla każdej sceny — dopina nowe systemy, uruchamia ich `onStart()`, usuwa systemy zaplanowane do usunięcia, dopisuje subskrypcje do `phaseManager` i sortuje fazy topologicznie.
3. `entityDispatcher()` dla każdej sceny — realizuje kolejkowanie encji, aktualizuje `entitiesInFrame`, rejestruje markery i tagi oraz uaktualnia cache zapytań po komponentach.
4. `preUpdate` — wykonuje subskrypcje ustawione dla tej fazy.
5. `fixedUpdate` — wykonuje się wielokrotnie w pętli, aż `Time.requestFixedUpdate()` przestanie zwracać `true`.
6. `update` — po aktualizacji czasu i `eventManager.updateTimers(frameDtMs)`.
7. `postUpdate` — faza kończąca logikę aktualizacji.
8. `eventsDeferred` — specjalna faza, w której wykonywane są callbacki z opóźnionych zdarzeń i zaplanowanych faz zdarzeniowych.
9. `render` — wykonywana tylko, gdy `scene.getFlags().isRendered` jest `true`.

### DogmaScene

`DogmaScene` jest najważniejszym modułem. Przechowuje:

- `components` — mapa komponentów zorganizowana po typie komponentu
- `systems` — aktywne systemy
- `systemsToDispatch` — systemy do zainicjowania
- `systemsToRemove` — systemy do usunięcia
- `phaseManager` — listy subskrypcji per faza
- `phaseToDispatch` / `phaseToRemove` — kolejkowanie zmian faz
- `entityToDispatch` / `entityToRemove` — kolejkowanie encji
- `sceneSharedData` — dane lokalne sceny
- `queries`, `queryFilters` — mechanizm zapytań po komponentach
- `tagsQuery`, `tagsQueryFilter` — mechanizm zapytań po tagach
- `markerQuery`, `markerMap` — dostęp po markerze
- `entitiesInFrame` — metadane encji w bieżącej klatce

## Cykl życia sceny

Scena ma kilka etapów:

1. utworzenie przez `Dogma.createScene()`
2. dodawanie systemów przez `scene.addSystem()`
3. rejestracja encji przez `EntityManager.spawnEntity()`
4. aktualizacja w `Dogma.tickAll()`
5. usunięcie przez `Dogma.deleteScene()`

## Cykl życia systemu

Systemy są tworzone przez `scene.addSystem(name)`. W trakcie dispatcha sceny:

- systemy z `systemsToDispatch` są przenoszone do `systems`
- wywoływane jest `onStart()`
- systemy z `systemsToRemove` są usuwane
- wywoływane jest `onDestroy()`

### Hooki systemu

Klasa `DogmaSystem` definiuje hooki:

- `onFrameStart()`
- `onStart()`
- `onDestroy()`
- `onFrameEnd()`

W praktyce sam silnik nie wywołuje `onPreUpdate`, `onFixedUpdate`, `onUpdate`, `onPostUpdate` i `onRender` jako osobnych metod, ponieważ te callbacki są dodawane przez subskrypcję fazową.

## Mechanizm faz

Każda faza jest reprezentowana przez listę wpisów typu `PhaseEntry`.

Wpis zawiera:

- `phaseName`
- `systemName`
- `callback`
- `sysRef`
- `before`
- `after`

Subskrypcja jest dodawana przez `DogmaSystem.subscribeToPhase(...)` i trafia do `scene.addToScenePhase(...)`.

`DogmaScene.phaseManager` zawiera wszystkie fazy:

- `preUpdate`
- `fixedUpdate`
- `update`
- `postUpdate`
- `eventsDeferred`
- `render`

Faza `eventsDeferred` jest specjalna: to w niej wykonywane są callbacki z opóźnionych / odroczonych zdarzeń, zanim `EventManager.flush()` wyczyści kolejki.

### Sortowanie zależności

Po dodaniu/usunięciu subskrypcji lub systemu scena wykonuje sortowanie topologiczne po każdej fazie.

Algorytm wykorzystuje graf zależności:

- `before` tworzy krawędź z bieżącego systemu do celu
- `after` tworzy krawędź od celu do bieżącego systemu

Jeśli zależności są sprzeczne lub tworzą cykl, silnik rzuca błąd.

### Walidacja

`validatePhaseConstraints()` sprawdza:

- czy system nie ma samego siebie w `before`
- czy system nie ma samego siebie w `after`
- czy system nie ma jednocześnie konfliktu `before` i `after` względem tego samego systemu

## Mechanizm encji i komponentów

### Dodawanie encji

`EntityManager.spawnEntity()` dodaje encję do `scene.entityToDispatch`.

W `entityDispatcher()` encja jest:

- dodawana do `entitiesInFrame.inFrame`
- dodawana do `entitiesInFrame.addedToFrame`
- rejestrowana w `markerQuery` / `markerMap` jeśli ma marker
- dodawana do zapytań po tagach
- dodana do odpowiednich map komponentów

### Usuwanie encji

`EntityManager.removeEntity()` dodaje ID encji do `scene.entityToRemove`.

W `entityDispatcher()` encja jest:

- usuwana z `entitiesInFrame.inFrame`
- dodana do `removedFromFrame`
- usuwana z markerów, tagów, komponentów i zapytań

## Query system

### Query po komponentach

`DogmaSystem.query([...])` tworzy lub zwraca zapytanie po komponentach. Mechanizm działa przez:

- `createQuery(key, list)`
- `getQueryResult(key)`

Zapytanie jest przechowywane jako `Set<Symbol>` zawierający ID encji z wymaganymi komponentami.

### Kaskada i cache danych

Podczas `entityDispatcher()` każda dodana encja aktualizuje cache zapytań oraz `entitiesInFrame`:

- `addedToFrame` — encje dodane w bieżącym ticku
- `removedFromFrame` — encje usunięte w bieżącym ticku
- `inFrame` — aktywne encje w scenie

Dzięki temu systemy mogą bezpiecznie odczytywać wyniki zapytań i korzystać z danych o życiu encji w ramach aktualnej klatki.

### Query po tagach

`DogmaSystem.getComponentsWithTags(component, tags)` działa przez:

- `createTagsQuery(key, tags, component)`
- `getTagsQueryResults(key)`

Działa na bazie `Set<string>` tagów przechowywanych na komponencie.

## Shared data

Systemy mogą przechowywać dane współdzielone:

- lokalne dla sceny: `sceneSharedData`
- globalne: `Dogma.globalSharedData`

API:

- `setSharedData(type, name, data)`
- `getSharedData(type, name)`
- `removeSharedData(type, name)`

## Mechanizm eventów

`EventManager` w `DogmaScene` obsługuje kilka trybów pracy:

- `emitImmediate(eventName, data)` — wykonywane natychmiast w miejscu wywołania.
- `emitDeferred(eventName, data)` — zapisuje zdarzenie do wewnętrznej kolejki; zostanie obsłużone w fazie `eventsDeferred`.
- `emitCascade(eventName, data)` — przechowuje dane w `cascadeEvents`, które mogą zostać odczytane później przez inne systemy lub inne fazy tej samej klatki przy pomocy `eventManager.getCascade(eventName)`.

### Subskrypcje

- `events.subscribeToImmediate(eventName, callback)` — rejestruj odbiorcę zdarzeń natychmiastowych.
- `events.unsubscribeFromImmediate(eventName, ID)` — usuń subskrypcję natychmiastowego zdarzenia.
- `events.subscribeToDeferred({ eventName, sysRef: this, callback, before?, after? })` — subskrybuj odroczone zdarzenia w fazie `eventsDeferred`.
- `events.unsubscribeFromDeferred(key)` — usuń subskrypcję odroczonego zdarzenia.

### Przykłady

```ts
const immediateID = this.events.subscribeToImmediate("DamageTaken", (data) => {
  // obsługa natychmiastowych efektów
});
this.events.emitImmediate("DamageTaken", { amount: 10 });
this.events.unsubscribeFromImmediate("DamageTaken", immediateID);
```

```ts
const deferredKey = this.events.subscribeToDeferred({
  eventName: "SpawnEnemy",
  sysRef: this,
  callback: (data) => {
    // obsługa odroczonego zdarzenia w fazie eventsDeferred
  },
  after: ["Physics"],
});
this.events.emitDeferred("SpawnEnemy", { type: "orc" });
this.events.unsubscribeFromDeferred(deferredKey);
```

```ts
this.events.emitCascade("CollisionChain", { source: entityID });
const cascadeData = this.events.getCascade("CollisionChain");
```

### Opóźnienia i interwały

- `emitDelayed({ eventName, data, delaySeconds, mode })` — zarejestruj zdarzenie, które zostanie wysłane po zadanym czasie. Jeśli `mode` to `"immediate"`, po czasie wywoła `emitImmediate`; jeśli `mode` to `"deferred"`, po czasie wywoła `emitDeferred`.
- `emitInterval({ eventName, data, intervalSeconds, totalSeconds, mode })` — powtarza emisję co `intervalSeconds` aż do wyczerpania `totalSeconds`, używając podanego trybu `mode`.

`Time.updateTimers(frameDtMs)` jest wywoływane tuż przed fazą `update`, więc opóźnione i interwałowe zdarzenia są rozliczane w tym samym ticku.

## Uwaga o aktualnym stanie kodu

W bieżącej implementacji są kilka rzeczy, które warto znać:

- `Dogma.tickAll()` wywołuje `systemDispatcher()` i `entityDispatcher()` przed fazami aktualizacji.
- `render` jest pomijany, jeśli scena ma `isRendered === false`.
- `entityDispatcher()` nie aktualizuje jeszcze w pełni zapytań po tagach w sposób tak samo kompletnego jak query po komponentach, co może wymagać dalszego dopracowania.
- `phaseManager` jest aktualizowany przez kolejkowanie zmian, a sortowanie odbywa się dopiero gdy nastąpią zmiany.

## Jak rozszerzać Dogmę

### Dodanie nowego komponentu

1. Utwórz klasę rozszerzającą `DogmaComponent`.
2. Dodaj ją do `dogmaConfig.components`.
3. Użyj jej w encjach przez `addComponent("Nazwa", ...args)`.

### Dodanie nowego systemu

1. Utwórz klasę rozszerzającą `DogmaSystem`.
2. Dodaj ją do `dogmaConfig.systems`.
3. Dodaj do sceny przez `scene.addSystem("Nazwa")`.
4. Zarejestruj subskrypcję w fazie przez `subscribeToPhase(...)`.

### Dodanie nowej fazy

Obecnie lista faz jest sztywno zdefiniowana jako:

- `preUpdate`
- `fixedUpdate`
- `update`
- `postUpdate`
- `eventsDeferred`
- `render`

Aby dodać nową fazę, trzeba zmodyfikować:

- typ `DogmaPhase`
- `phaseManager` w `DogmaScene`
- logikę `Dogma.tickAll()`
