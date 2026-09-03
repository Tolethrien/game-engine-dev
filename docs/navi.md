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

| Metoda | Do czego |
|--------|----------|
| `initialize()` | jednorazowy setup: oznacza `root` tagiem `"root"`, ustawia `root.input = "none"`, liczy skalę |
| `updateSystem()` | jedna klatka logiki: manipulacja drzewem, layout, input, focus, animacje (patrz niżej) |
| `drawSystem()` | rysuje całe drzewo (w tym portale) |
| `resize()` | przelicza `scale` z dopasowania canvasu do rozdzielczości bazowej 1920×1080 (mniejszy z dwóch stosunków) i ustawia `pixelBox` roota |
| `setUserScale(value)` | mnożnik skali sterowany przez użytkownika (dopasowania UI), przycinany do `[0.5, 2]`, łączony ze skalą automatyczną |
| `append(node, target?)` / `remove(node, target)` | kolejkuje dodanie/usunięcie węzła w drzewie (domyślny `target` to `root`) |
| `find(tag, root?)` / `findFirst(tag, root?)` | szuka potomków (włącznie z `root`) po tagu |
| `focus(node)` / `blur()` | ustawia/czyści focus klawiatury; `focus` szuka najbliższego przodka (lub samego węzła) z `focusable = true` |
| `markLayoutDirty()` | wymusza pełny re-measure + re-arrange w najbliższym `updateSystem` |
| `requestReflow()` | wymusza pojedynczy dodatkowy przelot measure+arrange **w tej samej klatce** (np. po zmianie treści węzła w trakcie fazy update) |
| `releaseInput(node)` | czyści hover/press/focus/lastClick, jeśli aktualnie wskazują na ten węzeł lub jego potomka |
| `releaseNode(node)` | jak wyżej + zatrzymuje tweeny i woła `onUnmount()` na całym poddrzewie — wywoływane automatycznie przy `remove` |
| `registerAnimated(node)` | dopisuje węzeł do zbioru tickowanego co klatkę pod kątem tweenów/blendingu stylu (dzieje się automatycznie, gdy węzeł ma tweenowalne stany lub gdy wywołasz `node.play(...)`) |

Gettery (stan bieżącej klatki): `getScale`, `getClicked`, `getRightClicked`, `getHovered`, `getFocused`, `getMousePos`, `didScroll`.

---

## `UINode` — bazowa klasa węzła

### Propsy konstruktora (`NodeProps`)

| Prop | Domyślnie | Znaczenie |
|------|-----------|-----------|
| `position` | `{x: px(0), y: px(0)}` | pozycja (jednostki, patrz niżej) |
| `size` | `{width: px(0), height: px(0)}` | rozmiar |
| `minSize` / `maxSize` | brak | ograniczenia rozmiaru |
| `input` | `"normal"` | `"normal"` (klika/hoveruje normalnie), `"absorb"` (przechwytuje trafienie bez sprawdzania dzieci), `"none"` (przezroczysty dla hit-testu, ale dzieci nadal testowane), `"disabled"` (całe poddrzewo pomijane w hit-teście) |
| `wantsKeys` | `false` | czy węzeł chce dostawać `onKeys` gdy ma focus |
| `focusable` | `false` | czy może być celem focusu klawiatury |
| `style` | `{}` | nadpisania nad domyślnym stylem (patrz `styleDefaults()`) |
| `states` | brak | style dla stanów `hovered`/`pressed`/`focused`/`disabled` |
| `inheritState` | `false` | czy `activeStyle` ma czerpać stan (hover/pressed/focus) z najbliższego przodka zamiast z siebie |
| `portal` | `false` | czy węzeł jest rysowany/hit-testowany poza normalnym przepływem rodzica (patrz sekcja Portale) |

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

| Grupa | Flagi |
|-------|-------|
| Hover | `hovered`, `hoveredWithin` (true też dla przodków hoverowanego węzła) |
| Enter/leave (jednoklatkowe) | `entered`, `enteredWithin`, `left`, `leftWithin` |
| Wciśnięcie | `pressed`, `rightPressed` |
| Klik (jednoklatkowe) | `clicked`, `clickedWithin`, `doubleClicked`, `doubleClickedWithin`, `rightClicked`, `rightClickedWithin` |
| Focus | `focusable` (ustawiasz sam), `focused`, `focusedWithin`, `focusGained`, `focusLost` (ostatnie dwa jednoklatkowe) |
| Widoczność | `active` (steruj przez `setActive`, nie bezpośrednio) |

„Jednoklatkowe" = `true` tylko w klatce zdarzenia, wyzerowane na początku kolejnego hit-testu.

### Aktywność

```ts
node.setActive(false); // wyłącza węzeł: releaseInput (zwalnia hover/press/focus), pomijany w layoucie/rysowaniu/hit-teście
node.setActive(true);  // włącza z powrotem, oznacza layout jako dirty
```

### Scroll

Kontener przewijalny: ustaw `style.overflowY`/`overflowX` na `"scroll"`. `contentSize` (liczone z layoutu dzieci) i `pixelBox` wyznaczają `maxScroll(axis)`; `scrollOffset` przesuwa dzieci przy rysowaniu i hit-teście. Kółko myszy nad hoverowanym, przewijalnym węzłem (albo najbliższym przewijalnym przodku) porusza `scrollOffset` automatycznie.

---

## Jednostki i layout

### Jednostki (`units.ts`)

```ts
px(120)   // piksele projektowe (skalowane przez Navi.getScale)
pw(50)    // % szerokości rodzica
ph(100)   // % wysokości rodzica
auto()    // rozmiar wynikający z treści/dzieci (contentSize)
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
node.play(Tweens.after(200, Tweens.fadeOut(150, undefined, () => node.setActive(false))));
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
Navi.drawSystem();   // co klatkę, po update
Navi.resize();       // przy zmianie rozmiaru canvasu

// Węzeł
class Foo extends UINode {
  protected styleDefaults() {
    return { backgroundColor: [255, 0, 0, 255] as RGBA, layout: "stack" as const };
  }
  onPress(mouse: Position2D) { /* ... */ }
}
const foo = new Foo({ size: { width: px(100), height: px(40) }, focusable: true });
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
