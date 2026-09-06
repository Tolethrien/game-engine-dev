# ENGINE — dokumentacja dla użytkownika

**ENGINE** to spinacz silnika: inicjalizacja canvasu i renderera, główna pętla klatki, zegar (`Time`), input (`InputManager` + `keys`) i prosty licznik FPS (`FPSOverlay`).

- **`Engine`** — statyczny start: przygotowuje canvas/WebGPU, woła Twój `preload`/`setup`, odpala `requestAnimationFrame`.
- **`Time`** — zegar z fixed-timestep (akumulator), skalowaniem czasu (spowolnienia/przyspieszenia), licznikiem FPS/CPU.
- **`InputManager`** — mysz/klawiatura z detekcją zbocza (pressed/released/hold), system "akcji" (nazwany input niezależny od konkretnego klawisza) i mechanizm "claim" (do negocjacji z UI, kto dostaje dany klik/klawisz).
- **`keys`** — słownik nazw klawiszy na wartości `KeyboardEvent.code` (niezależne od layoutu klawiatury).
- **`FPSOverlay`** — nakładka HUD z FPS/CPU/GPU do debugowania.

---

## `Engine`

```ts
import Engine from "@engine/engine";

Engine.initialize({
  preload: async () => {
    /* setup renderera, wczytanie assetów */
  },
  setup: () => {
    /* zbuduj pierwszą scenę gry */
  },
});
```

`initialize` w kolejności: przygotowuje canvas (`<canvas id="gameWindow">`) i kontekst WebGPU, startuje `Time`, czeka na Twój `preload()`, woła `setup()`, po czym sam startuje pętlę klatki przez `requestAnimationFrame` — nie trzeba (i nie da się) wywołać kolejnej klatki ręcznie.

`Engine.ctx` — getter do bieżącego `GPUCanvasContext`, gdyby coś poza rendererem go potrzebowało.

> Co dokładnie dzieje się w każdej klatce pętli (i czego dziś **nie** ma w niej wpiętego — np. input czy UI) opisuje [engine-dev.md](./engine-dev.md).

---

## `Time`

Zegar oparty o wzorzec "fixed timestep z akumulatorem" — logika stałokrokowa (fizyka) i logika zmiennokrokowa (reszta) żyją obok siebie.

```ts
Time.getDeltaTime(); // sekundy, skalowane przez timeSpeed, 0 gdy paused
Time.getUnscaledDeltaTime(); // sekundy, BEZ timeSpeed, 0 gdy paused
Time.getRawDeltaTime(); // sekundy, ignoruje NAWET paused — patrz uwaga niżej
Time.getFixedDeltaTime(); // stały krok (1/60s), skalowany przez timeSpeed, 0 gdy paused

Time.getTime(); // czas gry w ms (rośnie, dopóki update() jest wołane)
Time.getTimeInSeconds();

Time.getFps();
Time.getCpuTime(); // ms CPU spędzone w ostatniej klatce (Time.update...Time.endFrame)
Time.getAlpha(); // 0..1, do interpolacji renderu między prevPosition a position
```

> **`getRawDeltaTime()` nie respektuje pauzy.** To celowe — z tej metody korzysta np. animacja UI, żeby menu pauzy mogło się nadal płynnie animować, gdy `Time.setPaused(true)`. Jeśli używasz jej we własnym kodzie, pamiętaj, że dostaniesz deltę nawet w trakcie pauzy.

Sterowanie:

```ts
Time.setPaused(true); // getDeltaTime/getUnscaledDeltaTime/getFixedDeltaTime -> 0
Time.setTimeSpeed(0.5); // spowolnienie 2x, natychmiast
Time.setLerpTimeSpeed(0, 1.5); // płynne dojście do timeSpeed=0 w 1.5s (np. bullet-time)
```

Integracja z pętlą (już zrobione przez `Engine`/`Pragma`/`Dogma` — pokazane dla zrozumienia kolejności):

```ts
Time.initTimer(performance.now()); // raz, przed pierwszą klatką
// w każdej klatce:
Time.update(currentTime);
while (Time.requestFixedUpdate()) {
  // fixed-step logika (fizyka)
}
Time.switchToUpdateContext(); // PO pętli fixed — dopiero teraz getDeltaTime() jest aktualne
Time.updateAlpha();
// zmienno-krokowa logika + render
Time.endFrame(); // na samym końcu, do pomiaru CPU
```

---

## `InputManager`

Mysz i klawiatura z buforowaniem klatkowym — stan jest stabilny przez całą klatkę i pozwala odróżnić "właśnie wciśnięte" od "trzymane".

```ts
InputManager.registerEvents(); // raz, na starcie — podpina listenery DOM
InputManager.updateInputs(); // raz na klatkę, ZANIM cokolwiek odczyta input w tej klatce
```

### Mysz

```ts
InputManager.isMouseClicked(
  "LEFT" | "RIGHT" | "MIDDLE" | "BUTTON4" | "BUTTON5" | "BUTTON6",
);
InputManager.isMouseHold(button);
InputManager.isMouseReleased(button);
InputManager.isMouseMoved();
InputManager.isMouseScrolled();
InputManager.getMousePos(); // Position2D w pikselach canvasu
InputManager.getMouseScroll(); // Position2D delty kółka
```

### Klawiatura

```ts
import { KEY } from "@engine/keys";

InputManager.isKeyPressed(KEY.space); // edge: wciśnięto w tej klatce
InputManager.isKeyHold(KEY.w); // trzymany
InputManager.isKeyRelease(KEY.w); // edge: puszczono w tej klatce
InputManager.isAnyKeyHold([KEY.shiftLeft, KEY.shiftRight]);
```

Tekst wpisywany (do pól tekstowych UI, nie do sterowania grą):

```ts
InputManager.getTypedText(); // string wpisany w tej klatce (pojedyncze znaki, uwzględnia AltGr)
InputManager.getEditKeys(); // klawisze edycyjne w tej klatce (strzałki, Backspace, Enter, ...)
```

### Akcje

Nazwany input niezależny od konkretnego klawisza/przycisku — wygodne do rebindingu:

```ts
InputManager.bindAction({ name: "jump", key: KEY.space, mods: "NoMod" });
InputManager.bindAction({ name: "attack", mouse: "LEFT", mods: "NoMod" });
InputManager.bindAction({ name: "sprint", key: KEY.w, mods: ["shift"] });

InputManager.onActionPressed("jump"); // edge
InputManager.onActionHold("sprint"); // trzymane
InputManager.onActionReleased("attack");
InputManager.removeAction("jump");
```

`mods: "NoMod"` wymaga, żeby **żaden** z shift/ctrl/alt nie był wciśnięty. `mods: ["shift"]` wymaga, żeby shift **był** wciśnięty (nie wyklucza dodatkowo wciśniętego ctrl/alt).

### Claim (dla UI)

Mechanizm, dzięki któremu warstwa UI (np. NAVI) może na daną klatkę "przejąć" mysz/klawiaturę, żeby ten sam klik/klawisz nie trafił jednocześnie w UI i w grę:

```ts
InputManager.setMouseClaim(true); // od teraz mysz "należy" do UI w tej klatce
InputManager.setKeyboardClaim(true);
InputManager.suspendClaim(); // jednorazowo zignoruj bieżące zaklejmowanie (na czas przeliczenia)
InputManager.suspendKeyboardClaim();
```

Jeśli piszesz własny system UI/overlay, wołaj `set*Claim` na końcu swojej aktualizacji tej klatki; `isMouseClicked`/`isKeyPressed`/... automatycznie zwrócą `false` dla zaklejmowanego inputu — reszta gry nie musi nic sprawdzać ręcznie.

---

## `keys`

`KEY` to słownik nazw (`KEY.w`, `KEY.space`, `KEY.arrowUp`, ...) na wartości `KeyboardEvent.code` — działają identycznie niezależnie od layoutu klawiatury (fizyczna pozycja klawisza, nie wpisany znak). `KEY_GROUP` grupuje warianty lewy/prawy dla `shift`/`ctrl`/`alt`, do użycia z `isAnyKeyHold`.

---

## `FPSOverlay`

Prosty HUD tekstowy (FPS / czas CPU / czas GPU) do debugowania wydajności:

```ts
FPSOverlay.setVisible(true);
FPSOverlay.update(); // wołane co klatkę przez Engine; odświeża tekst raz na sekundę
FPSOverlay.setGpuTimeSource(() => AuroraDebugInfo.getGpuMs()); // opcjonalnie: podepnij pomiar GPU
```

Bez ustawionego źródła GPU (`setGpuTimeSource`) wiersz GPU pokazuje `—`.

---

## Ściąga (cheat sheet)

```ts
Engine.initialize({ preload, setup });

Time.setPaused(true);
Time.setLerpTimeSpeed(0.2, 0.5);

InputManager.registerEvents();
InputManager.bindAction({ name: "jump", key: KEY.space, mods: "NoMod" });
if (InputManager.onActionPressed("jump")) {
  /* skok */
}

FPSOverlay.setVisible(true);
```

Szczegóły wewnętrzne (jak to działa pod spodem, ograniczenia, TODO) → [engine-dev.md](./engine-dev.md).

# ENGINE — notatki developerskie (jak to działa od środka)

Ten dokument opisuje wewnętrzne bebechy modułu z [`src/core/engine`](../src/core/engine).

Pliki:

| Plik                                                    | Rola                                                              |
| ------------------------------------------------------- | ----------------------------------------------------------------- |
| [`engine.ts`](../src/core/engine/engine.ts)             | Setup canvasu/WebGPU, `requestAnimationFrame`, ciało pętli klatki |
| [`time.ts`](../src/core/engine/time.ts)                 | Zegar: fixed-timestep akumulator, skala czasu, FPS/CPU            |
| [`inputManager.ts`](../src/core/engine/inputManager.ts) | Bufory mysz/klawiatura, akcje, mechanizm claim                    |
| [`keys.ts`](../src/core/engine/keys.ts)                 | Stałe `KeyboardEvent.code`                                        |
| [`fpsOverlay.ts`](../src/core/engine/fpsOverlay.ts)     | HUD tekstowy FPS/CPU/GPU                                          |

---

## `Engine.initialize()` i `loop()` — dokładny przebieg

```
initialize({ preload, setup }):
  1. setCanvas()                      // patrz niżej
  2. await Aurora.init(canvas)
  3. Time.initTimer(performance.now())
  4. await preload()
  5. setup()
  6. requestAnimationFrame(loop)

loop(currentTime):
  1. Time.update(currentTime)
  2. AuroraDebugInfo.startCount(currentTime)
  3. Renderer.beginBatch()
  4. Renderer.setGlobalIllumination([10, 0, 0])
  5. Pragma.update()
  6. Draw.rect(...)         // demo: różowy kwadrat — na sztywno w engine.ts
  7. Draw.pointLight(...)   // demo: światło punktowe — na sztywno w engine.ts
  8. Renderer.endBatch()
  9. AuroraDebugInfo.endCount()
  10. debug.aurora.reportGPUData(...)
  11. Time.endFrame()
  12. FPSOverlay.update()
  13. debug.performance.endFrame(Time.getFrameTime())
  14. requestAnimationFrame(loop)
```

### `setCanvas()`

Pobiera `<canvas id="gameWindow">` z DOM-u (asercja, jeśli go nie ma), kontekst `"webgpu"`, i ustawia rozmiar canvasu na podstawie `window.API.WINDOW.getWindowSize()` (most IPC z Electrona, zdefiniowany w warstwie preload, poza tym folderem). Podpina `onWindowResize` z **debounce 100 ms** — zmiana `canvas.width`/`canvas.height` następuje dopiero po ustaniu serii zdarzeń resize, nie przy każdym pikselu przeciąganego okna.

> Zmiana rozmiaru canvasu **nie** woła nic więcej automatycznie (np. `Navi.resize()`) — Aurora czyta `canvas.width`/`canvas.height` na bieżąco przy rysowaniu, więc render dopasowuje się sam, ale każdy inny system trzymający własną kopię rozmiaru (jak `Navi`) trzeba by dopiąć do tego samego handlera ręcznie.

---

## Znane ograniczenia, pułapki i niespójności (stan obecny)

1. **Ciało `loop()` zawiera na sztywno wpisany kod demonstracyjny** (`Draw.rect` różowego kwadratu, `Draw.pointLight`) — to nie jest mechanizm typu "callback co klatkę" wystawiony dla gry, tylko dosłowna zawartość metody w rdzeniu silnika. Żeby dodać własną logikę rysowania/aktualizacji co klatkę, dziś trzeba edytować `engine.ts` bezpośrednio (albo przenieść tę logikę do komponentu Pragmy/systemu Dogmy, skoro `Pragma.update()` i tak jest już wołane w pętli) — nie ma osobnego hooka `onFrame`/`render` przekazywanego do `Engine.initialize`.
2. **Tylko `Pragma.update()` jest wpięte w pętlę.** `Dogma.tickAll()`, `Navi.updateSystem()`/`Navi.drawSystem()` oraz `InputManager.registerEvents()`/`updateInputs()` **nie są wołane nigdzie** w `engine.ts`. Skutek:
   - `Dogma` (rdzeń ECS) jest martwy, dopóki ktoś sam nie doda `Dogma.tickAll()` do pętli.
   - `Navi` (UI) jest martwe z tego samego powodu (i tak wymagałoby ręcznej integracji — patrz [navi-dev.md](./navi-dev.md), punkt 1).
   - `InputManager` **nigdy nie zbiera inputu** bez ręcznego wywołania `registerEvents()` (raz) i `updateInputs()` (co klatkę) — dziś żadne z nich nie jest wołane automatycznie przez `Engine`, więc `isKeyPressed`/`isMouseClicked`/... zawsze zwracają wynik oparty o dwa puste bufory, dopóki integrator sam nie dopnie obu wywołań do swojej pętli/setupu.
3. **`Time.switchToUpdateContext()`/`Time.updateAlpha()` są wołane wewnątrz `Pragma.update()`, nie w `Engine.loop()`.** To znaczy, że jeśli w przyszłości dodasz do pętli własny krok **przed** `Pragma.update()`, który czyta `Time.getDeltaTime()`/`Time.getFrameTime()`, dostaniesz wartości sprzed przełączenia kontekstu (czyli efektywnie z poprzedniej klatki) — kolejność w pętli ma znaczenie i nie jest oczywista bez zajrzenia do `Pragma.update()`.
4. **`FPSOverlay.setVisible(true)` jest zakomentowane w `src/sandbox/index.ts`** — overlay istnieje i działa, ale trzeba świadomie odkomentować/wywołać, żeby cokolwiek się pokazało.

---

## `Time` — szczegóły fixed-timestep

Klasyczny wzorzec "fix your timestep":

- `update(currentTime)`: liczy surową deltę (`raw = currentTime - lastTime`), **przycina** ją do `MAX_DELTA_TIME` (100 ms = próg 10 FPS) — zapobiega "spirali śmierci" (jedna bardzo długa klatka, np. po odpaleniu debuggera, nie generuje potem serii doganiających fixed-update'ów w nieskończoność). Przycięta delta trafia do `accumulator` i `currentFrameDt`.
- `requestFixedUpdate()`: drenuje `accumulator` porcjami `FIXED_DT` (1000/60 ms) — woła się w pętli `while`, bo w jednej klatce może się "należeć" 0, 1 lub więcej kroków fixed.
- `switchToUpdateContext()`: dopiero **teraz** `deltaTime`/`frameTime` (sekundy/ms zmiennokrokowe) są liczone z `currentFrameDt` — musi być wołane **po** pętli `requestFixedUpdate`, **przed** czytaniem `getDeltaTime()`/`getFrameTime()` w tej klatce.
- `updateAlpha()`: `alpha = accumulator / FIXED_DT` — ułamek "jak daleko jesteśmy między ostatnim a następnym krokiem fixed", do interpolacji pozycji przy renderze (`lerp(prevPosition, position, alpha)`).

### Skala czasu i pauza — kto co respektuje

| Getter                   | Respektuje `paused` | Respektuje `timeSpeed` |
| ------------------------ | ------------------- | ---------------------- |
| `getDeltaTime()`         | tak (zwraca 0)      | tak                    |
| `getUnscaledDeltaTime()` | tak (zwraca 0)      | **nie**                |
| `getRawDeltaTime()`      | **nie**             | **nie**                |
| `getFixedDeltaTime()`    | tak (zwraca 0)      | tak                    |

`getRawDeltaTime()` to jedyny getter, który **nigdy** nie zwraca zera — istnieje specjalnie dla rzeczy, które muszą tykać nawet w pauzie (dziś: fazy `contentPhase`/`animationPhase` w `Navi`, patrz [navi-dev.md](./navi-dev.md)). Każdy kolejny konsument tej metody dziedziczy to zachowanie, nawet jeśli tego nie chce — trzeba o tym pamiętać, sięgając po nią gdziekolwiek indziej.

`setLerpTimeSpeed(target, duration)` ustawia liniową interpolację `timeSpeed`, przeliczaną co klatkę w `updateSpeedLerp` (wołane wewnątrz `update()`, **przed** ewentualnym sprawdzeniem pauzy przez konsumentów — sam `updateSpeedLerp` **pomija** przeliczenie, gdy `paused === true`, więc pauza zamraża też trwającą interpolację prędkości czasu, nie tylko sam czas).

### Licznik FPS i CPU

`countFps` jest wołane bezwarunkowo w `update()` (niezależnie od `paused`/`timeSpeed`) — liczy **realne** klatki renderu, nie kroki logiki. `getCpuTime()` mierzy `performance.now()` od początku `update()` (`frameStart`) do wywołania `endFrame()` przez `Engine.loop` — czyli **cały** koszt klatki (aktualizacja czasu + `Pragma.update()` + rysowanie + raportowanie debug), nie tylko "logikę gry".

---

## `InputManager` — bufory i mechanizm claim

### Trzy warstwy buforów

```
*InputBuffer   — pisane NA BIEŻĄCO przez listenery DOM (mousedown/up/move/wheel, keydown/up)
*CurrentFrame  — migawka *InputBuffer z początku klatki (updateInputs())
*PreviousFrame — migawka poprzedniego *CurrentFrame
```

Detekcja zbocza (`isKeyPressed` = w `current`, nie w `previous`) działa tylko dzięki temu rozdzieleniu — bez cyklicznego wywoływania `updateInputs()` raz na klatkę, `current`/`previous` nigdy się nie różnią (albo nigdy nie aktualizują — w zależności, kiedy ostatni raz coś wywołało `updateInputs`), więc `isKeyPressed` nigdy nie zwróci `true`.

`registerEvents()` dodatkowo podpina listener `blur` na oknie, który czyści **wszystkie** żywe bufory i zatrzaski (`keyInputBuffer`, `mouseInputBuffer.buttons`, `claimLatch`, `keyClaimLatch`, `textBuffer`, `editBuffer`) — bez tego Alt+Tab w trakcie trzymania np. `W` zostawiłby klawisz "zablokowany" jako wciśnięty (`keyup` nigdy by nie doszedł, bo fokus okna już zniknął), a gra po powrocie fokusu myślałaby, że gracz wciąż idzie do przodu.

### Tekst i klawisze edycyjne

W `keyEvents` (na `"down"`): jeśli `e.key.length === 1` (pojedynczy znak, uwzględniając AltGr — `ctrlKey && altKey`, potrzebne np. dla polskich znaków `ą`/`ę` na layoucie Windows), trafia do `textBuffer`. Wszystko inne (strzałki, `Backspace`, `Enter`, ...) trafia do `editBuffer`. To rozdzielenie zasila `Navi`'s `onKeys({ text, keys })` bez dodatkowego przetwarzania po stronie UI.

> `todo.md` w tym folderze wspomina o przejściu z "w" (znaku) na kod klawisza w input managerze z powodu problemów z CapsLockiem — **aktualny kod już tego nie robi** dla ścieżki gry: `keyInputBuffer` (czytane przez `isKeyPressed`/`isKeyHold`/`isKeyRelease`/akcje) zawsze zapisuje `e.code`, nie `e.key`. Wpis w `todo.md` wygląda na nieaktualny, chyba że problem dotyczył innego, już poprawionego miejsca.

### Mechanizm claim — kto o czym decyduje

Trzy niezależne "kanały" claimu: mysz (per-przycisk), klawiatura (per-klawisz), kółko (osobna logika czasowa):

- **Mysz/klawiatura**: `setMouseClaim(claimed)`/`setKeyboardClaim(claimed)` ustawiają flagę bazową (`mouseClaimed`/`keyboardClaimed`) i **zatrzaskują** (`claimLatch`/`keyClaimLatch`) ją dla każdego przycisku/klawisza, który **właśnie zaczął** być wciśnięty w tej klatce (`current` ma, `previous` nie miał). Odczyt (`isClaimed`/`isKeyClaimed`) najpierw sprawdza zatrzask dla danego przycisku/klawisza, dopiero potem flagę bazową — dzięki temu cały gest (wciśnięcie → trzymanie → puszczenie) pozostaje spójny nawet jeśli w międzyczasie kursor zjedzie z UI albo flaga bazowa się zmieni. Zatrzask jest kasowany w `updateInputs()`, gdy przycisk/klawisz przestaje być wciśnięty w obu klatkach z rzędu (czyli już dawno puszczony).
- **Kółko**: nie ma naturalnego "trzymania", więc `wheelLatch` działa czasowo — pierwszy scroll w geście ustawia zatrzask na bieżącą wartość `claimed`, kolejne przewinięcia w oknie `WHEEL_GESTURE_GAP` (150 ms) go podtrzymują; brak scrolla przez dłużej niż ten czas czyści zatrzask (koniec gestu).
- **`suspendClaim()`/`suspendKeyboardClaim()`**: jednorazowo wyłączają **całe** filtrowanie (łącznie z zatrzaskami) na czas, aż coś znowu wywoła `setMouseClaim`/`setKeyboardClaim`. Używane przez `Navi` na **początku** swojej aktualizacji (patrz [navi-dev.md](./navi-dev.md), sekcja "Claim"), żeby stan sprzed tej klatki nie "zaklinował" inputu, zanim UI zdąży przeliczyć nowy hover/focus.

`blur` (patrz wyżej) czyści też `claimLatch`/`keyClaimLatch` — powrót z Alt+Tab nie dziedziczy zatrzasków sprzed utraty fokusu.

---

## Jak rozszerzać

**Własna logika co klatkę:** dziś jedyne "oficjalne" miejsce to `setup()` przekazane do `Engine.initialize` (budowa scen/aktorów Pragmy, ewentualnie Dogmy, jeśli dopiszesz `Dogma.tickAll()` do pętli) — sama treść `loop()` w `engine.ts` wymaga edycji, żeby dodać/usunąć coś wołane bezwarunkowo co klatkę (jak wpięcie `InputManager.updateInputs()` albo `Navi.updateSystem()`/`drawSystem()`).

**Nowa akcja wejścia:** `InputManager.bindAction({ name, key | mouse, mods })`, potem `onActionPressed`/`onActionHold`/`onActionReleased(name)` — nic więcej nie trzeba rejestrować.

**Nowy klawisz spoza `KEY`:** dopisz wpis do obiektu `KEY` w `keys.ts` z properną wartością `KeyboardEvent.code` (sprawdź w devtoolsach albo liście MDN) — `KeyCode` się przeliczy automatycznie (`typeof KEY[keyof typeof KEY]`).
