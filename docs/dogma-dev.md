# DOGMA — notatki developerskie (jak to działa od środka)

**DOGMA** = **D**ata **O**riented **G**ame **M**echanics **A**rchitecture.

Ten dokument opisuje wewnętrzne bebechy modułu z [`src/core/dogma`](../src/core/dogma). To notatka „dla siebie” — żeby po powrocie do projektu przypomnieć sobie, **dlaczego** coś jest zrobione tak, a nie inaczej, gdzie są kruche miejsca i co zostało do zrobienia.

Pliki:

| Plik | Rola |
|------|------|
| [`dogma.ts`](../src/core/dogma/dogma.ts) | Statyczny manager scen + główna pętla `tickAll()` |
| [`scene.ts`](../src/core/dogma/scene.ts) | Serce systemu: systemy, fazy, encje, komponenty, query |
| [`system.ts`](../src/core/dogma/system.ts) | Klasa bazowa systemu + całe publiczne API dla użytkownika |
| [`entity.ts`](../src/core/dogma/entity.ts) | Kontener komponentów + tagi + marker |
| [`component.ts`](../src/core/dogma/component.ts) | Bazowy komponent (dane + gettery do ID/tagów/markera) |
| [`eventManager.ts`](../src/core/dogma/eventManager.ts) | Immediate / deferred / cascade / timery |
| [`entityManager.ts`](../src/core/dogma/entityManager.ts) | Cienki fasada do spawn/remove encji |
| [`type.d.ts`](../src/core/dogma/type.d.ts) | Globalne typy generowane z `dogmaConfig` |

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
components:     Map<string /*componentName*/, Map<Symbol /*entityID*/, DogmaComponent>>
systems:        Map<string, DogmaSystem>
phaseManager:   Record<DogmaPhase, PhaseEntry[]>     // subskrypcje per faza (już posortowane)

queries:        Map<string /*"A|B"*/, Set<Symbol>>   // wynik query po komponentach
queryFilters:   Map<string, ComponentRegistryKeys[]> // definicja query (jakie komponenty)

tagsQuery:       Map<string /*"t1|t2"*/, Set<Symbol>>
tagsQueryFilter: Map<string /*tag*/, Set<string /*queryKey*/>>  // tag -> które query go dotyczą

markerQuery:    Map<string /*marker*/, Symbol /*entityID*/>
markerMap:      Map<Symbol /*entityID*/, string /*marker*/>      // odwrotność, do sprzątania

entitiesInFrame: { addedToFrame, removedFromFrame, inFrame }  // Set<Symbol>
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

| Mechanizm | Struktura | Kiedy odpala | Czyszczenie |
|-----------|-----------|--------------|-------------|
| immediate | `immediateEvents: Map<name, Map<Symbol, Subscriber>>` | synchronicznie w `emitImmediate` | subskrypcja żyje do `unsubscribe` |
| deferred  | `deferredEvents: Map<name, EventData[]>` | callbacki w fazie `eventsDeferred` | `flush()` na końcu ticku |
| cascade   | `cascadeEvents: Map<name, EventData[]>` | odczyt przez `getCascade` w tej samej klatce | `flush()` na końcu ticku |
| timery    | `timeEvents: TimeEvent[]` | `updateTimers` przed fazą update | zdejmowane po wygaśnięciu |

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
type SystemRegistryKeys     = keyof typeof dogmaConfig.systems;
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
