# Dogma — dokumentacja dla developerów

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

1. `sceneDispatcher()`
2. `systemDispatcher()` dla każdej sceny
3. `entityDispatcher()` dla każdej sceny
4. uruchomienie callbacków fazowych

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
- `render`

Aby dodać nową fazę, trzeba zmodyfikować:

- typ `DogmaPhase`
- `phaseManager` w `DogmaScene`
- logikę `Dogma.tickAll()`
