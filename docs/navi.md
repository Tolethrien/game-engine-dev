# NAVI — dokumentacja dla użytkownika

**NAVI** to system UI silnika: drzewo węzłów (`UINode`) z layoutem, stylami, animacjami, obsługą myszy/klawiatury i focusem, rysowane przez Aurorę. Gotowe elementy interfejsu (przyciski, pola tekstowe, scrollbary, ...) żyją w [`src/core/navi/elements`](../src/core/navi/elements) jako klasy rozszerzające `UINode` — ten dokument opisuje sam rdzeń (`Navi`, `UINode`, layout, style, animacje), nie konkretne gotowe elementy.

- **`Navi`** — statyczny manager: drzewo węzłów, pętla aktualizacji/rysowania, hit-testing, focus, scroll, drag, portale.
- **`UINode`** — bazowa klasa węzła: pozycja/rozmiar w jednostkach (`px`/`pw`/`ph`/`auto`), styl, layout dzieci, flagi interakcji (`hovered`, `pressed`, `clicked`, ...), hooki do przeciążenia (`draw`, `tick`, `onPress`, ...).
- **Layout** — trzy tryby (`none` / `stack` / `grid`) sterowane przez `style`.
- **Animacje** — dwa niezależne mechanizmy: blending stylu między stanami (hover/pressed/focused/disabled) i tweeny ruchu/skali/alfy (`Tweens`).

---

## Szybki start

### 1. Inicjalizacja i pętla

NAVI **nie jest** samo wpięte w pętlę silnika — wywołujesz je sam, tam gdzie integrujesz UI z grą:

```ts
import Navi from "@/core/navi/navi";

Navi.initialize(); // raz, na starcie

function frame() {
  Navi.updateSystem(); // layout, input, animacje — raz na klatkę
  // ...logika gry...
  Navi.drawSystem(); // rysowanie — po logice, przed prezentacją klatki
}
```

Przy zmianie rozmiaru okna/canvasu wywołaj `Navi.resize()`.

### 2. Własny węzeł

Budujesz UI, rozszerzając `UINode` i nadpisując wybrane hooki:

```ts
// src/sandbox/ui/panel.ts
import UINode, { NodeProps } from "@/core/navi/node";
import { px, pw } from "@/core/navi/units";

export default class Panel extends UINode {
  constructor(props: NodeProps = {}) {
    super({
      size: { width: pw(30), height: px(200) },
      input: "normal",
      ...props,
    });
  }

  protected styleDefaults() {
    return {
      backgroundColor: [20, 20, 20, 220] as RGBA,
      layout: "stack" as const,
      gap: 8,
      padding: { top: 8, right: 8, bottom: 8, left: 8 },
    };
  }

  public onPress(mouse: Position2D) {
    console.log("kliknięto panel w", mouse);
  }
}
```

### 3. Dopięcie do drzewa

```ts
import Navi from "@/core/navi/navi";
import Panel from "@/sandbox/ui/panel";

const panel = new Panel();
Navi.append(panel); // domyślnie do Navi.root
Navi.remove(panel, panel.parent!);
```

`append`/`remove` **kolejkują** zmianę — realnie trafia do drzewa na początku najbliższego `Navi.updateSystem()`.

---

## `Navi` — manager

| Metoda                                           | Do czego                                                                                                                                                                      |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `initialize()`                                   | jednorazowy setup: oznacza `root` tagiem `"root"`, ustawia `root.input = "none"`, liczy skalę                                                                                 |
| `updateSystem()`                                 | jedna klatka logiki: manipulacja drzewem, layout, input, focus, animacje (patrz niżej)                                                                                        |
| `drawSystem()`                                   | rysuje całe drzewo (w tym portale)                                                                                                                                            |
| `resize()`                                       | przelicza `scale` z dopasowania canvasu do rozdzielczości bazowej 1920×1080 (mniejszy z dwóch stosunków) i ustawia `pixelBox` roota                                           |
| `setUserScale(value)`                            | mnożnik skali sterowany przez użytkownika (dopasowania UI), przycinany do `[0.5, 2]`, łączony ze skalą automatyczną                                                           |
| `append(node, target?)` / `remove(node, target)` | kolejkuje dodanie/usunięcie węzła w drzewie (domyślny `target` to `root`)                                                                                                     |
| `find(tag, root?)` / `findFirst(tag, root?)`     | szuka potomków (włącznie z `root`) po tagu                                                                                                                                    |
| `focus(node)` / `blur()`                         | ustawia/czyści focus klawiatury; `focus` szuka najbliższego przodka (lub samego węzła) z `focusable = true`                                                                   |
| `markLayoutDirty()`                              | wymusza pełny re-measure + re-arrange w najbliższym `updateSystem`                                                                                                            |
| `requestReflow()`                                | wymusza pojedynczy dodatkowy przelot measure+arrange **w tej samej klatce** (np. po zmianie treści węzła w trakcie fazy update)                                               |
| `releaseInput(node)`                             | czyści hover/press/focus/lastClick, jeśli aktualnie wskazują na ten węzeł lub jego potomka                                                                                    |
| `releaseNode(node)`                              | jak wyżej + zatrzymuje tweeny i woła `onUnmount()` na całym poddrzewie — wywoływane automatycznie przy `remove`                                                               |
| `registerAnimated(node)`                         | dopisuje węzeł do zbioru tickowanego co klatkę pod kątem tweenów/blendingu stylu (dzieje się automatycznie, gdy węzeł ma tweenowalne stany lub gdy wywołasz `node.play(...)`) |

Gettery (stan bieżącej klatki): `getScale`, `getClicked`, `getRightClicked`, `getHovered`, `getFocused`, `getMousePos`, `didScroll`.

---

## `UINode` — bazowa klasa węzła

### Propsy konstruktora (`NodeProps`)

| Prop                  | Domyślnie                       | Znaczenie                                                                                                                                                                                                                  |
| --------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `position`            | `{x: px(0), y: px(0)}`          | pozycja (jednostki, patrz niżej)                                                                                                                                                                                           |
| `size`                | `{width: px(0), height: px(0)}` | rozmiar                                                                                                                                                                                                                    |
| `minSize` / `maxSize` | brak                            | ograniczenia rozmiaru                                                                                                                                                                                                      |
| `input`               | `"normal"`                      | `"normal"` (klika/hoveruje normalnie), `"absorb"` (przechwytuje trafienie bez sprawdzania dzieci), `"none"` (przezroczysty dla hit-testu, ale dzieci nadal testowane), `"disabled"` (całe poddrzewo pomijane w hit-teście) |
| `wantsKeys`           | `false`                         | czy węzeł chce dostawać `onKeys` gdy ma focus                                                                                                                                                                              |
| `focusable`           | `false`                         | czy może być celem focusu klawiatury                                                                                                                                                                                       |
| `style`               | `{}`                            | nadpisania nad domyślnym stylem (patrz `styleDefaults()`)                                                                                                                                                                  |
| `states`              | brak                            | style dla stanów `hovered`/`pressed`/`focused`/`disabled`                                                                                                                                                                  |
| `inheritState`        | `false`                         | czy `activeStyle` ma czerpać stan (hover/pressed/focus) z najbliższego przodka zamiast z siebie                                                                                                                            |
| `portal`              | `false`                         | czy węzeł jest rysowany/hit-testowany poza normalnym przepływem rodzica (patrz sekcja Portale)                                                                                                                             |

### Hooki do nadpisania

```ts
onMount(): void        // wywoływane, gdy węzeł faktycznie trafia do drzewa
onUnmount(): void       // gdy faktycznie z niego znika
onDrag(delta): void     // trzymany lewy przycisk + ruch myszy nad węzłem, który go złapał
onPress(mouse): void    // wciśnięcie lewego przycisku nad węzłem
onKeys(input): void     // gdy węzeł ma focus i wpisano tekst/klawisze edycyjne
tick(dt): void          // co klatkę, w fazie content — miejsce na własną logikę czasową
contentChanged(): bool  // zwróć true, gdy treść węzła się zmieniła i layout trzeba przeliczyć
draw(box): void         // rysowanie; domyślnie tło + zaokrąglenie + opcjonalny obrazek
styleDefaults(): Partial<Style> // domyślny styl klasy (protected, wołane raz w konstruktorze)
```

### Flagi stanu (czytane, nie ustawiane ręcznie)

Aktualizowane przez `Navi.updateSystem()` co klatkę:

| Grupa                       | Flagi                                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Hover                       | `hovered`, `hoveredWithin` (true też dla przodków hoverowanego węzła)                                            |
| Enter/leave (jednoklatkowe) | `entered`, `enteredWithin`, `left`, `leftWithin`                                                                 |
| Wciśnięcie                  | `pressed`, `rightPressed`                                                                                        |
| Klik (jednoklatkowe)        | `clicked`, `clickedWithin`, `doubleClicked`, `doubleClickedWithin`, `rightClicked`, `rightClickedWithin`         |
| Focus                       | `focusable` (ustawiasz sam), `focused`, `focusedWithin`, `focusGained`, `focusLost` (ostatnie dwa jednoklatkowe) |
| Widoczność                  | `active` (steruj przez `setActive`, nie bezpośrednio)                                                            |

„Jednoklatkowe" = `true` tylko w klatce zdarzenia, wyzerowane na początku kolejnego hit-testu.

### Aktywność

```ts
node.setActive(false); // wyłącza węzeł: releaseInput (zwalnia hover/press/focus), pomijany w layoucie/rysowaniu/hit-teście
node.setActive(true); // włącza z powrotem, oznacza layout jako dirty
```

### Scroll

Kontener przewijalny: ustaw `style.overflowY`/`overflowX` na `"scroll"`. `contentSize` (liczone z layoutu dzieci) i `pixelBox` wyznaczają `maxScroll(axis)`; `scrollOffset` przesuwa dzieci przy rysowaniu i hit-teście. Kółko myszy nad hoverowanym, przewijalnym węzłem (albo najbliższym przewijalnym przodku) porusza `scrollOffset` automatycznie.

---

## Jednostki i layout

### Jednostki (`units.ts`)

```ts
px(120); // piksele projektowe (skalowane przez Navi.getScale)
pw(50); // % szerokości rodzica
ph(100); // % wysokości rodzica
auto(); // rozmiar wynikający z treści/dzieci (contentSize)
```

### Tryby layoutu (`style.layout`)

- **`"none"`** — dzieci pozycjonowane swobodnie: `position` + `anchorX`/`anchorY` (`start`/`center`/`end`/`stretch`, gdzie `stretch` używa `style.inset` zamiast `size`).
- **`"stack"`** — rząd lub kolumna (`style.direction`), z `gap`, `alignMain` (`start`/`center`/`end`/`between`), `alignCross` (+ `alignSelf` per-dziecko).
- **`"grid"`** — siatka o stałej liczbie kolumn/wierszy (`style.gridCount`), komórki rozmiaru największego dziecka, `cellAlignX`/`cellAlignY`.

Layout liczy się w dwóch przelotach: `measureSelf` (od liści do korzenia — najpierw dzieci) → `layoutChildren` (od korzenia do liści — rodzic ustawia `pixelBox` dzieci). Przelot uruchamia się tylko, gdy coś oznaczyło layout jako "dirty" (dodanie/usunięcie węzła, `markLayoutDirty()`, `setActive(true)`, scroll).

---

## Styl (`style.ts`)

`Style` to płaski obiekt: kolory tła/tekstu, `rounded`, `backgroundImage` (+ crop), `textSize`/`textFont`/`textAlign`/`lineGap`, wszystkie właściwości layoutu opisane wyżej, `zIndex` (kolejność rysowania rodzeństwa), `transitionMs` (czas blendingu przy zmianie stylu), oraz `scale`/`nudge`/`origin` — transformacje renderu niezależne od `pixelBox` (używane też przez tweeny).

- `styleDefaults()` (nadpisywane w klasie) łączy się (`deepMerge`) z `props.style` przekazanym z zewnątrz — dając domyślny styl bazowy węzła.
- `props.states.{hovered,pressed,focused,disabled}` to **częściowe** nadpisania nad stylem bazowym, aktywowane automatycznie w zależności od flag węzła (kolejność priorytetu: `disabled` > `pressed` > `hovered` > `focused` > bazowy).
- `inheritState: true` sprawia, że węzeł czerpie **swój aktywny stan** (hover/pressed/focus) z najbliższego przodka zamiast z siebie — przydatne dla węzłów-dekoracji wewnątrz klikalnego rodzica.
- Jeśli `transitionMs > 0` na stylu docelowym, zmiana stanu **blenduje się** płynnie (kolor tła/tekstu, `rounded`, `scale`, `nudge`) zamiast przeskakiwać — obsługiwane automatycznie przez `Navi`, o ile węzeł jest zarejestrowany do animacji (dzieje się to same, gdy którykolwiek stan ma `transitionMs > 0`).

---

## Animacje ruchu (`tween.ts`)

Niezależny od blendingu stylu system tweenów — steruje `motion.scale`/`motion.offset`/`motion.alpha` węzła (**dokłada się** do stylu, nie zastępuje go):

```ts
import { Tweens } from "@/core/navi/tween";

node.play(Tweens.popIn());
node.play(
  Tweens.after(
    200,
    Tweens.fadeOut(150, undefined, () => node.setActive(false)),
  ),
);
node.stopAllTweens();
```

Gotowe fabryki: `slideIn`/`slideOut`, `popIn`/`popOut`, `shake`/`shakeY`, `hop`, `pulse` (zapętlony), `fadeIn`/`fadeOut`, `scaleTo`, `caretBlink` (zapętlony), oraz `Tweens.after(delayMs, tween)` do opóźnienia startu. Kilka tweenów na tym samym węźle **składa się** (mnożenie skali/alfy, sumowanie przesunięcia).

---

## Portale

Węzeł z `portal: true` jest zbierany osobno co klatkę i renderowany/hit-testowany **poza** normalnym przycinaniem (clipping) i pozycją swojego rodzica — trafia na wierzch, z automatycznym „odbiciem"/dosunięciem do ekranu, jeśli wystawałby poza jego krawędź. Do tego służą dropdowny, tooltipy, menu kontekstowe: dziecko-portal pozycjonuje się względem miejsca, gdzie by normalnie wylądowało w layoucie, ale rysuje się nad wszystkim i mieści się na ekranie.

---

## Input i focus (skrót koncepcyjny)

`Navi.updateSystem()` w każdej klatce robi hit-test (od góry portali, potem drzewa głównego, dzieci przed rodzicem, uwzględniając `input` mode i przycinanie), na tej podstawie aktualizuje hover/press/klik/focus, obsługuje przeciąganie (`onDrag`) i scroll kółkiem. Na koniec **zgłasza** do `InputManager`, czy UI „skonsumowało" mysz (`setMouseClaim`, gdy cokolwiek jest hoverowane) i klawiaturę (`setKeyboardClaim`, gdy focus jest aktywny i chce klawiszy) — dzięki temu logika gry może sprawdzić `InputManager`, czy dany klik/klawisz trafił w UI, zamiast też reagować na niego w świecie gry.

---

## Ściąga (cheat sheet)

```ts
// Setup
Navi.initialize();
Navi.updateSystem(); // co klatkę
Navi.drawSystem(); // co klatkę, po update
Navi.resize(); // przy zmianie rozmiaru canvasu

// Węzeł
class Foo extends UINode {
  protected styleDefaults() {
    return {
      backgroundColor: [255, 0, 0, 255] as RGBA,
      layout: "stack" as const,
    };
  }
  onPress(mouse: Position2D) {
    /* ... */
  }
}
const foo = new Foo({
  size: { width: px(100), height: px(40) },
  focusable: true,
});
Navi.append(foo);
Navi.remove(foo, foo.parent!);

// Wyszukiwanie
foo.tags.add("hud");
Navi.find("hud");
Navi.findFirst("hud");

// Focus
Navi.focus(foo);
Navi.blur();

// Animacja
foo.play(Tweens.popIn());
```

# NAVI — notatki developerskie (jak to działa od środka)

Ten dokument opisuje wewnętrzne bebechy modułu z [`src/core/navi`](../src/core/navi) — rdzeń (`navi.ts`, `node.ts`, `style.ts`, `units.ts`, `tween.ts`). Nie opisuje konkretnych gotowych elementów z [`src/core/navi/elements`](../src/core/navi/elements) (to osobna warstwa zbudowana na tym rdzeniu).

Pliki:

| Plik                                    | Rola                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [`navi.ts`](../src/core/navi/navi.ts)   | Statyczny manager: drzewo, kolejka mount/unmount, wszystkie fazy `updateSystem`/`drawSystem`, hit-testing, focus, portale |
| [`node.ts`](../src/core/navi/node.ts)   | `UINode` — layout (measure/arrange), stan wizualny (`activeStyle`/`paintStyle`), blending stylu, tweeny na poziomie węzła |
| [`style.ts`](../src/core/navi/style.ts) | Definicja `Style`, `BASE_STYLE`, `createStyle`/`mergeStyle` (oparte o `deepMerge`)                                        |
| [`units.ts`](../src/core/navi/units.ts) | `Unit`/`Units` (`px`/`pw`/`ph`/`auto`) i `toPx()`                                                                         |
| [`tween.ts`](../src/core/navi/tween.ts) | `Tween` (kształt danych) + `Tweens` (fabryki gotowych animacji)                                                           |

---

## `Navi.updateSystem()` — dokładna kolejność faz

```
InputManager.suspendClaim(); InputManager.suspendKeyboardClaim();  // patrz sekcja "Claim"
scrolledThisFrame = false;

1. nodeManipulationPhase()  // zrealizuj append/remove z kolejki, ustaw layoutDirty
2. contentPhase()           // tick(dt) całego drzewa (aktywnych węzłów), zbierz contentChanged -> layoutDirty
3. dragPhase()               // delta myszy -> onDrag na pressTarget
4. scrollPhase()             // kółko myszy -> applyWheel (z uwzględnieniem Shift = oś pozioma)
5. measurePhase()            // jeśli layoutDirty: measureTree (dzieci przed rodzicem)
6. arrangePhase()            // jeśli layoutDirty: arrangeTree (rodzic przed dziećmi), layoutDirty = false
7. reflowPhase()             // jeśli ktoś wywołał requestReflow(): measure+arrange jeszcze raz, w TEJ klatce
8. portalPhase()             // przelicz listę portali (offsety, transformacje, dopasowanie do ekranu)
9. hitTestPhase()            // hit-test, hover/press/klik/focus
10. consumed = focusPhase()  // Escape blur / przekazanie tekstu-klawiszy do focusedNode.onKeys
11. animationPhase()         // tick blendingu stylu + tweenów dla zarejestrowanych węzłów

InputManager.setMouseClaim(hoveredNode !== undefined);
InputManager.setKeyboardClaim(consumed || focusedNode?.wantsKeys === true);
```

`drawSystem()` to osobne wywołanie `drawPhase()` — rysuje główne drzewo, potem po kolei portale, na końcu `Draw.popClip()`.

Kluczowe: **measure/arrange liczą się tylko, gdy `layoutDirty`** — więc `tick()`/`contentChanged()` to jedyny sposób, by treść ustawiona z zewnątrz (np. tekst pobrany z gry) wymusiła przeliczenie layoutu; sam fakt zmiany pola na węźle nic nie triggeruje, dopóki `contentChanged()` nie zwróci `true`.

---

## Mechanizm "Claim" w `InputManager`

NAVI nie blokuje inputu grze bezpośrednio — **negocjuje** to przez `InputManager`:

- `suspendClaim()`/`suspendKeyboardClaim()` na **początku** klatki cofają poprzednie zgłoszenie (żeby stan sprzed layoutu nie "zaklinował" inputu, gdyby UI akurat nic nie miało do powiedzenia).
- Na **końcu** klatki `setMouseClaim(hoveredNode !== undefined)` i `setKeyboardClaim(consumed || focusedNode?.wantsKeys)` mówią `InputManager`, czy w tej klatce mysz/klawiatura należy do UI.
- `InputManager` po swojej stronie **latchuje** to per-przycisk/klawisz (`claimLatch`/`keyClaimLatch`): jeśli przycisk zaczął być wciśnięty w klatce, w której UI go "zaklaimowało", to całe wciśnięcie (aż do puszczenia) zostaje zaklaimowane, nawet jeśli mysz zjedzie z UI w międzyczasie. Zapobiega to sytuacji "wcisnąłem na przycisku UI, zjechałem, puściłem nad światem gry — i gra też zareagowała".

Efekt: gra powinna sprawdzać `InputManager.isMouseClicked/isKeyPressed` **wiedząc**, że NAVI mogło je "przejąć" — ale to `InputManager` decyduje o faktycznym filtrowaniu (`isClaimed`/`isKeyClaimed`), NAVI tylko ustawia dwie flagi raz na klatkę.

---

## `hitTestPhase()` i drzewo hit-testu

`hitTree(node, mouse, clip, offset)`:

1. Pomija węzeł nieaktywny (`!node.active`) lub z `input === "disabled"` (całe poddrzewo).
2. Przelicza `childClip` (przycinanie potomków wg `overflowX`/`overflowY` węzła) — jeśli przycięcie daje pustą powierzchnię, poddrzewo jest pomijane.
3. `input === "absorb"` **nie testuje dzieci** — jeśli punkt trafia w sam węzeł, to on jest wynikiem, koniec.
4. W przeciwnym razie testuje dzieci **w kolejności odwrotnej do rysowania** (`orderedChildren` posortowane po `zIndex`, iterowane od końca) — dziecko narysowane na wierzchu wygrywa hit-test. Portale dzieci (`child.portal`) są pomijane tutaj — mają własny przebieg (patrz `hitTestPhase`, iteruje po `portals` od końca **przed** testem głównego drzewa, więc portal zawsze "wygrywa" z tym, co pod nim).
5. Jeśli żadne dziecko nie trafione i `input !== "none"`, testuje sam węzeł.

Po znalezieniu `target`, jeśli akurat trwa przeciąganie (`pressTarget`/`rightPressTarget` ustawione, a `target` to coś innego), wynik jest **wygaszany do `undefined`** — trzymanie przycisku "zamraża" efektywny target na oryginalnym węźle, niezależnie gdzie teraz wskazuje kursor (patrz `applyLeftButton`/`applyRightButton`, które i tak operują na zapamiętanym `pressTarget`, nie na przekazanym `target`).

### Hover/focus jako "ścieżka"

`hoveredNode`/`focusedNode` to pojedynczy węzeł, ale każda zmiana aktualizuje też **całą ścieżkę do korzenia** (`hoverPath`/`focusPath`): flagi `*Within` na przodkach. Algorytm liczy `common` — długość wspólnego prefiksu starej i nowej ścieżki — i przełącza tylko różniący się ogon, więc wspólny przodek (np. panel zawierający dwa hoverowane po kolei przyciski) nie "mruga" (`leftWithin`/`enteredWithin` fałszywie).

### Klik i podwójny klik

`fireClick` ustawia `clicked`/`clickedWithin` na ścieżce i sprawdza `now - lastClickTime <= DOUBLE_CLICK_MS` (280 ms) **na tym samym węźle** (`node === lastClickNode`) — trzeci klik z rzędu **nie** robi potrójnego triple-double: po wykryciu podwójnego `lastClickNode` jest czyszczone, więc kolejny klik liczy się jako nowy pojedynczy.

---

## Blending stylu vs tweeny — dwa niezależne systemy motion

Łatwo je pomylić, bo oba wpływają na to samo (`renderScaleX/Y`, `renderNudgeX/Y`, alfa), ale mają zupełnie inny cykl życia:

- **Blending stylu** (`node.tickStyle`, w `node.ts`) — reaguje na **zmianę `activeStyle`** (czyli zmianę stanu hover/pressed/focused/disabled/bazowy). Interpoluje **pełny obiekt stylu** (`backgroundColor`, `textColor`, `rounded`, `scale`, `nudge`) między `blendFrom` i `blendTo` w czasie `transitionMs` **stylu docelowego**. Wynik trafia do `this.painted`, czytanego przez getter `paintStyle`.
- **Tweeny** (`node.tickTweens`, sterowane przez `Tweens`/`node.play`) — niezależny stos efektów **czasowych**, nie stanowych: nie wiedzą nic o hover/press, tylko o czasie od uruchomienia. Piszą do `this.motion` (`scale`/`offset`/`alpha`), **osobnego** pola od `this.painted`.
- Finalny render (`drawTree` w `navi.ts`) **mnoży/dodaje oba**: `renderScaleX = paintStyle.scale.x * motion.scale.x`, `renderNudgeX = paintStyle.nudge.x + motion.offset.x`, `renderAlpha = motion.alpha` (blending stylu nie ma osobnej alfy — tylko `motion` ją niesie).

Konsekwencja: możesz mieć węzeł, który **jednocześnie** płynnie zmienia kolor tła po hoverze (blending stylu) **i** podskakuje przy kliknięciu (tween `hop`) — nie kolidują, bo piszą do różnych pól.

Oba mechanizmy są tickowane tylko dla węzłów w `Navi.styleAnimated` (`Set<UINode>`). Rejestracja dzieje się automatycznie:

- w konstruktorze `UINode`, jeśli `wantsStyleAnimation()` wykryje `transitionMs > 0` na którymś ze stanów (lub stylu bazowego, jeśli **jakikolwiek** stan istnieje),
- w `node.play(tween)`, przy dodaniu pierwszego tweenu.

Węzeł **nigdy nie jest wyrejestrowywany** z `styleAnimated` po dodaniu (nawet gdy tweeny się skończą) — `tickTweens`/`tickStyle` po prostu nic nie robią, gdy nie mają nic do policzenia. To tania operacja (early return), ale warto wiedzieć, że `styleAnimated` tylko rośnie w trakcie życia węzła (czyszczone dopiero w `releaseNode` przy usunięciu z drzewa).

---

## Layout — dwuprzebiegowy measure/arrange

`measureTree` (post-order: dzieci przed rodzicem) woła `node.measureSelf(scale)`, które:

1. liczy `contentSize` na podstawie **już zmierzonych dzieci** (`measureContentAxis`, osobna ścieżka per `layout` — `stack`/`grid`/`none`),
2. liczy `measured` (rozmiar, jaki węzeł **chciałby** zająć) z `size` (jednostka `px`/`pw`/`ph` — parent jeszcze nieznany na tym etapie, więc `pw`/`ph` tu nie mają relatywnego punktu odniesienia i efektywnie liczą się względem 0 dopóki nie przyjdzie `layoutChildren` rodzica) — jedyny w pełni "gotowy" tu przypadek to `auto` (= `contentSize`).

`arrangeTree` (pre-order: rodzic przed dziećmi) woła `node.layoutChildren(scale)`, które **rzeczywiście** rozwiązuje `pw`/`ph` dzieci względem znanego już `pixelBox` rodzica i ustawia `child.pixelBox` przez `child.setBox(...)`. Trzy prywatne metody (`layoutFree`/`layoutStack`/`layoutGrid`) odpowiadają trybom `style.layout`.

> To dwuetapowe rozdzielenie (measure nie zna rozmiaru rodzica, arrange go zna) jest źródłem częstej pułapki: rozmiar w `%` (`pw`/`ph`) **działa poprawnie w finalnym `pixelBox`**, ale `measured` policzone w fazie measure dla węzła z rozmiarem procentowym jest tylko przybliżeniem (liczonym jak dla 0×0 rodzica) — nie polegaj na `node.measured` dla węzłów z `pw`/`ph`, jeśli potrzebujesz dokładnej wartości przed `arrangeTree`.

---

## Portale — `collectPortals`/`fitPortal`

`portalPhase()` czyści `portals` i zbiera je **od nowa co klatkę**, rekurencyjnie schodząc po drzewie (`collectPortals`), przenosząc bieżącą transformację (`offset`/`transform`/`alpha` — te same wyliczenia co w `drawTree`, zduplikowane, bo portal musi znać swoją **finalną pozycję ekranową** zanim `drawPhase` w ogóle się zacznie, żeby hit-test w `hitTestPhase` mógł jej użyć). Po zebraniu węzła-portalu, **portale zagnieżdżone w portalach też są zbierane** — pętla `for` czyta `this.portals.length` na bieżąco, więc dopisywanie w trakcie iteracji faktycznie obejmuje nowo dodane wpisy.

`fitPortal` dopasowuje portal do ekranu:

- najpierw próbuje **odbić** (`flippedX`/`flippedY`) w stronę, gdzie jest miejsce, jeśli normalna pozycja wystawałaby poza krawędź,
- jeśli odbicie i tak nie wystarcza (albo nie było miejsca na odbicie), **dosuwa** (`dx`/`dy`) tak, by zmieścić się w oknie.

`flippedX`/`flippedY` wpływają też na `renderOriginX`/`renderOriginY` węzła (odwracają origin, żeby transformacje skali/nudge nadal wyglądały spójnie po odbiciu).

Hit-test portali (`hitTestPhase`) idzie **od ostatniego zebranego do pierwszego** (`for i = portals.length-1; i >= 0`) — ostatnio narysowany portal (czyli najbardziej "na wierzchu") wygrywa, zanim w ogóle sprawdzone zostanie główne drzewo.

---

## Znane miejsca warte uwagi

1. **NAVI nie jest wpięte w żadną istniejącą pętlę silnika.** Nic w repo dziś nie woła `Navi.initialize()`/`updateSystem()`/`drawSystem()` poza samym modułem `navi` i elementami w `elements/`, które z niego korzystają. Integrację (kiedy dokładnie w klatce silnika wywołać `updateSystem`/`drawSystem` względem `Pragma.update()`/`Dogma.tickAll()`) trzeba dodać ręcznie w miejscu, gdzie spina się główna pętla.
2. **`measured` węzłów z rozmiarem procentowym jest tylko przybliżone w fazie measure** — patrz sekcja Layout wyżej. Może to zaskakiwać przy pisaniu własnej logiki `measureContentAxis`-podobnej, jeśli ktoś kiedyś zechce ją rozszerzyć.
3. **`styleAnimated` tylko rośnie** — węzeł raz zarejestrowany (bo miał tweenowalny stan albo choć raz użył `play()`) zostaje w zbiorze do usunięcia z drzewa. Tanie w praktyce, ale przy bardzo dużej liczbie węzłów UI warto o tym pamiętać przy profilowaniu `animationPhase`.
4. **Podwójny klik liczy się per węzeł, nie per pozycja ekranu** — jeśli w trakcie okna 280 ms węzeł pod kursorem się zmieni (np. UI się przelayoutowało), drugi klik na innym węźle nie złoży się w podwójny, nawet jeśli fizycznie kursor się nie ruszył.
5. **`onDrag` nie sprawdza, czy `pressTarget` wciąż jest aktywny/w drzewie** — jeśli węzeł zostanie usunięty w trakcie trzymania przycisku bez przejścia przez `Navi.remove`/`releaseNode` (np. ręczne odczepienie od rodzica), `dragPhase` może wciąż próbować wywołać na nim `onDrag`. Zawsze usuwaj węzły przez `Navi.remove`, nie ręcznie przez `children.splice`.

---

## Jak rozszerzać

**Nowy typ węzła:** klasa `extends UINode`, nadpisz `styleDefaults()` dla domyślnego wyglądu i te hooki (`draw`/`tick`/`onPress`/`onDrag`/`onKeys`/`contentChanged`), które są potrzebne. Jeśli węzeł ma własną logikę zależną od danych z gry, ustaw pole w `tick()` lub w metodzie ustawianej z zewnątrz i zwróć `true` z `contentChanged()`, gdy trzeba przeliczyć layout.

**Nowy tryb layoutu:** dodaj wariant do `Style["layout"]`, obsłuż go w `layoutChildren` (nowa prywatna metoda `layoutX` w `node.ts`) **i** w `measureContentAxis` (odpowiadająca metoda `measureXAxis`) — oba miejsca muszą być spójne, inaczej `auto()` będzie liczyć zły rozmiar.

**Nowy tween:** dopisz fabrykę do `Tweens` w `tween.ts`, zwracającą `make(ms, sample, loop?, onDone?)`, gdzie `sample(t)` zwraca częściowy `TweenSample` (`scaleX`/`scaleY`/`x`/`y`/`alpha`) dla znormalizowanego czasu `t ∈ [0,1]`.
