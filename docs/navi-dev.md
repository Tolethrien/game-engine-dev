# NAVI — notatki developerskie (jak to działa od środka)

Ten dokument opisuje wewnętrzne bebechy modułu z [`src/core/navi`](../src/core/navi) — rdzeń (`navi.ts`, `node.ts`, `style.ts`, `units.ts`, `tween.ts`). Nie opisuje konkretnych gotowych elementów z [`src/core/navi/elements`](../src/core/navi/elements) (to osobna warstwa zbudowana na tym rdzeniu).

Pliki:

| Plik | Rola |
|------|------|
| [`navi.ts`](../src/core/navi/navi.ts) | Statyczny manager: drzewo, kolejka mount/unmount, wszystkie fazy `updateSystem`/`drawSystem`, hit-testing, focus, portale |
| [`node.ts`](../src/core/navi/node.ts) | `UINode` — layout (measure/arrange), stan wizualny (`activeStyle`/`paintStyle`), blending stylu, tweeny na poziomie węzła |
| [`style.ts`](../src/core/navi/style.ts) | Definicja `Style`, `BASE_STYLE`, `createStyle`/`mergeStyle` (oparte o `deepMerge`) |
| [`units.ts`](../src/core/navi/units.ts) | `Unit`/`Units` (`px`/`pw`/`ph`/`auto`) i `toPx()` |
| [`tween.ts`](../src/core/navi/tween.ts) | `Tween` (kształt danych) + `Tweens` (fabryki gotowych animacji) |

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
