# AXIOM — spis możliwości

**AXIOM** to nie system z własnym cyklem życia, tylko zbiór niezależnych, w większości statycznych klas narzędziowych: matematyka, wektory/macierze, kolizje 2D, kolor, easing, struktury przestrzenne (siatka/quadtree), proste sygnały/eventy, drobne utilsy. Importujesz z konkretnego pliku to, czego potrzebujesz — nic tu nie trzeba inicjalizować ani spinać z pętlą silnika.

Poniżej spis zawartości każdego pliku (sygnatury + jednolinijkowe "co robi"), nie pełna dokumentacja koncepcyjna — dla prostej biblioteki utilsów to więcej szumu niż pożytku.

Współdzielone typy (`type.d.ts`, globalne, bez importu): `Position2D`, `Position3D`, `Size2D`, `RGB`/`RGBA`, `HSL`/`HSLA`, `HEX`, `Box` (`{x,y,w,h}`), `BoxAABB` (`{min,max}`), `Circle` (`{x,y,r}`), `Rect` (`{x,y,w,h,rotation}`), `Capsule` (`{a,b,radius}`).

---

## `math.ts` — `AxiomMath`

| Funkcja | Co robi |
|---|---|
| `clamp(value, min, max)` | przycina do zakresu |
| `map(value, fromMin, fromMax, toMin, toMax, clamp?)` | przemapowuje zakres na zakres |
| `lerp(a, b, t)` / `lerpInt` | interpolacja liniowa (int = zaokrąglona) |
| `lerpPos2D` / `lerpPos3D` / `lerpSize2D` | lerp na strukturach `Position2D`/`3D`/`Size2D` |
| `inverseLerp(a, b, value)` | odwrotność lerp — zwraca `t` dla danej wartości |
| `lerpAngle(a, b, t)` | lerp kąta (radiany) po najkrótszej drodze, z zawinięciem |
| `lerpRGB` / `lerpRGBA` | lerp koloru per kanał |
| `randomFloat(min, max)` / `randomInt(min, max)` | losowa liczba w zakresie (int jest inclusive na obu końcach) |
| `pickRandomN(arr, n)` | `n` losowych, unikalnych elementów tablicy (bez powtórzeń) |
| `degToRad` / `radToDeg` | konwersja kątów |
| `approxEquals(a, b, epsilon?)` | porównanie z tolerancją (domyślny epsilon 0.0005) |
| `randomSign()` | `-1` albo `1` |
| `randomBool(chance?)` | `true` z podanym prawdopodobieństwem (domyślnie 50%) |
| `weightedRandom(items, weights)` | losowy element z wagami |
| `randomArrayIndex(array)` | losowy indeks tablicy |
| `randomInCirclePoint(center, radius)` | losowy punkt **wewnątrz** koła (rozkład jednostajny po powierzchni) |
| `randomInRectPoint(shape)` | losowy punkt wewnątrz `Box`/`BoxAABB` |
| `distanceSquared2d/3d` / `distance2d/3d` | odległość (kwadrat — bez `sqrt`, do porównań) |

---

## `vec2.ts` / `vec3.ts` — `Vec2`, `Vec3`

Klasy wektorowe z **prywatnym konstruktorem** — tworzysz przez fabryki, nie `new`. Większość metod instancji **mutuje `this` i zwraca `this`** (łańcuchowanie: `v.add(1,0).scale(2).normalize()`); operacje statyczne (`Vec2.add(a,b)`) są czyste i zwracają nowy wektor.

**Fabryki (statyczne):** `Zero`/`One`/`XAxis`/`YAxis` (+`ZAxis` w Vec3) jako gettery, `create(x,y[,z])`, `fromArray([...])`.

**Czyste statyczne:** `add(a,b)`, `sub(a,b)`, `lerp(a,b,t)` (obie klasy), `cross(a,b)` (tylko `Vec3` — w `Vec2` `cross` jest metodą instancji zwracającą skalar, pseudo-cross 2D).

**Metody instancji (mutujące, zwracają `this`):** `clone`, `set`, `setAxis`, `copy`, `add`/`sub` (przyjmują wektor **albo** liczby osobno), `scale`, `divideScalar` (rzuca przy dzieleniu przez 0), `negate`, `negateAxis`, `normalize`, `lerp` (do celu, in-place), `round`, `rotate(angle)` (`Vec3.rotate(axis, angle)` — obrót wokół dowolnej osi, Rodrigues), `clampLength(max)`, `reflect(normal)`.

**Tylko `Vec2`:** `perpendicular()` (obrót o 90°, in-place).

**Odczyty (nie mutują):** `length`/`lengthSquared`, `dot`, `cross` (tylko `Vec2`, skalar), `distanceTo`/`distanceToSquared`, `isZero`, `equals`, `equalsApprox(v, epsilon?)`, `toArray()`, gettery `.x`/`.y`(/`.z`)/`.value` (`{x,y[,z]}`); `Vec2.angle()` (kąt wektora); `Vec3.angleTo(v)` (kąt między dwoma wektorami), `Vec3.xy` (rzut na 2D).

---

## `mat2.ts` / `mat4.ts` — `Mat2`, `Mat4`

Macierze transformacji jako `Float32Array` (`elements`), prywatny konstruktor. `Mat2` to macierz 2D afiniczna (3×2, kolumnowa: `[a,b,c,d,tx,ty]`) do transformacji 2D (rotacja+skala+translacja); `Mat4` to pełna macierz 4×4 (kolumnowa) do projekcji/kamery 3D.

**`Mat2` — fabryki:** `identity` (getter), `translation(x,y)`, `rotation(angle)`, `scaling(x,y)`, `fromTRS(position: Vec2, rotation, scale: Vec2)`.
**`Mat2` — metody (mutujące, zwracają `this`):** `clone`, `translate`, `rotate`, `scale`, `multiply(other)` (`this = this * other`), `invert` (rzuca, gdy wyznacznik ≈ 0).
**`Mat2` — odczyty:** `transformPoint(vec)` (z translacją), `transformVector(vec)` (**bez** translacji — do kierunków/prędkości), `getPosition`, `getRotation`, `getScale`.

**`Mat4` — fabryki:** `identity` (getter), `ortho(left,right,bottom,top,near,far)`, `perspective(fovYRadians, aspect, near, far)`, `lookAt(eye, center, up)` (tuple `[x,y,z]`, zwraca `identity`, jeśli `eye`≈`center`).
**`Mat4` — metody (mutujące):** `clone`, `translate([x,y,z])`, `scale(scalar)` (jednolita skala, nie per-oś), `multiply(other)`, `invert` (rzuca przy wyznaczniku ≈ 0), `rotateX`/`rotateY`/`rotateZ(angle)`.
**`Mat4` — odczyty:** `transform([x,y,z,w])` — mnożenie macierz × wektor jednorodny.

---

## `AABB.ts` — `AABB` (statyczna, przyjmuje `Box` lub `BoxAABB` zamiennie)

| Funkcja | Co robi |
|---|---|
| `overlaps(a, b)` | czy dwa prostokąty (osiowo wyrównane) się przecinają |
| `contains(a, b)` | czy `a` w całości zawiera `b` |
| `containsPoint(shape, point)` | czy punkt jest wewnątrz |
| `closestPoint(shape, point)` | najbliższy punkt na/w kształcie do zadanego punktu |
| `intersectsCircle(shape, circle)` / `containsCircle(shape, circle)` | test AABB vs koło |
| `getCenter(shape)` | środek prostokąta |
| `getIntersection(a, b)` | część wspólna dwóch prostokątów jako `BoxAABB`, albo `null` |

---

## `collision.ts` — `Collision` (statyczna)

Testy kolizji i raycasty dla kształtów 2D: `Circle`, `Rect` (z rotacją!), `Capsule` (odcinek + promień), punkt. Każdy test zwraca `CollisionManifold` (`{collided, normal, penetration}`) — `normal` i `penetration` sensowne tylko gdy `collided: true`, zorientowane od `a` do `b`. Raycasty zwracają `RaycastHit` (`{hit, point, distance, normal}`).

| Funkcja | Kolizja |
|---|---|
| `pointVsCircle`, `pointVsRect`, `pointVsCapsule` | punkt vs kształt |
| `circleVsCircle`, `circleVsRect`, `circleVsCapsule` | koło vs kształt |
| `rectVsRect` (SAT, obsługuje rotację obu prostokątów), `rectVsCapsule` | prostokąt vs kształt |
| `capsuleVsCapsule` | kapsuła vs kapsuła |
| `raycastCircle`, `raycastRect`, `raycastCapsule` | promień vs kształt |

`Rect.rotation` jest w radianach; testy z rotacją działają, transformując do lokalnego układu prostokąta.

---

## `color.ts` — `AxiomColor` (statyczna)

Konwersje między `RGB`/`RGBA` (kanały 0–255, alfa RGBA jako 0–1), `HSL`/`HSLA` (H w stopniach, S/L w %), `HEX` (string `#rrggbb`/`#rrggbbaa`):

`rgbToHex`, `rgbaToHex`, `rgbToHsl`, `rgbaToHsla`, `hexToRgb`, `hexToRgba`, `hexToHsl`, `hexToHsla`, `hslToRgb`, `hslaToRgba`, `hslToHex`, `hslaToHex`. Plus `randomRGB()`/`randomRGBA()` — losowy kolor.

---

## `easing.ts` — `Easing` (statyczna)

Standardowe funkcje `t ∈ [0,1] → [0,1]` (lub poza zakres dla `Back`), do animacji/tweenów: `linear`, `easeInQuad`/`easeOutQuad`/`easeInOutQuad`, `easeInCubic`/`easeOutCubic`/`easeInOutCubic`, `easeInSine`/`easeOutSine`/`easeInOutSine`, `easeInBack`/`easeOutBack`/`easeInOutBack` (przeszarżowanie poza `[0,1]`, efekt "podbicia").

---

## `events.ts` — drobne klasy pomocnicze (eksport nazwany, nie domyślny)

| Klasa | Do czego |
|---|---|
| `Signal<T>` | pojedynczy kanał `emit`/`connect`/`disconnect` (bez nazwy zdarzenia) |
| `EventBus` | wiele nazwanych kanałów: `emit(name, data)`/`on(name, cb)`/`off(name, cb)` |
| `Timer` | jednorazowy odliczacz: `new Timer(seconds, callback)`, `tick(dt)` co klatkę, woła `callback` raz po upłynięciu czasu |
| `IntervalTimer` | powtarzalny: `new IntervalTimer(interval, callback, duration?)`, `tick(dt)` może wywołać `callback` **kilka razy** w jednej klatce, jeśli `dt` jest duże; `duration: 0` = bez końca, inaczej `isDone()` po jego upłynięciu |
| `Collector<T>` | zbiera wyniki z zarejestrowanych źródeł (`connect(() => T)`), `collect()` woła wszystkie i zwraca tablicę wyników |
| `SharedData` | prosty magazyn klucz-wartość (`add` ostrzega o duplikacie, `set` nadpisuje po cichu, `get`/`delete`/`has`) |

---

## `seedRandom.ts` — `SeededRandom` (instancja, nie statyczna)

Deterministyczny PRNG (`sfc32`-podobny) — ten sam `seed` zawsze daje tę samą sekwencję, przydatne do powtarzalnej generacji proceduralnej.

```ts
const rng = new SeededRandom(12345);
rng.next();            // float [0,1)
rng.float(min, max);
rng.int(min, max);     // inclusive na obu końcach
rng.sign();            // -1 | 1
rng.bool(chance?);
rng.weightedRandom(items, weights);
rng.arrayIndex(array);
rng.inCirclePoint(center, radius);
rng.inRectPoint(shape);
```

Metody 1:1 odpowiadają losowym funkcjom z `AxiomMath` (`randomFloat`→`float`, `randomInt`→`int`, itd.) — różnica jest tylko w tym, że tu wynik zależy od `seed`, a nie od `Math.random()`.

---

## `utils.ts` — luźne funkcje (eksport nazwany)

| Funkcja | Co robi |
|---|---|
| `randomUUID()` | cienki wrapper na `crypto.randomUUID()` |
| `assert(condition, msg?)` | rzuca `Error`, jeśli `condition` jest fałszywe (typowane jako TS assertion function) |
| `loadImg(src)` | `Promise<HTMLImageElement>` — ładuje obrazek i czeka na `onload`/`onerror` |
| `deepMerge(target, source)` | głębokie scalenie obiektów (`source` nadpisuje `target`); **tablice nie są scalane, tylko podmieniane w całości** |
| `flatObjectToValues(obj)` | spłaszcza zagnieżdżony obiekt/tablice do jednej płaskiej tablicy liczb (rekurencyjnie) |

---

## `grid.ts` — `Grid` (statyczna)

Konwersje współrzędnych świat ↔ kafelek dla siatki kartezjańskiej **i** izometrycznej, plus generowanie całej siatki:

| Funkcja | Co robi |
|---|---|
| `worldToTile` / `tileToWorld` / `tileCenterToWorld` | konwersja pozycja ↔ indeks kafelka (kartezjańska) |
| `snapToGrid` / `snapToGridCenter` | przyciągnięcie dowolnej pozycji do siatki |
| `isoWorldToTile` / `isoTileToWorld` / `isoTileCenterToWorld` | to samo dla rzutu izometrycznego |
| `isoSnapToGrid` / `isoSnapToGridCenter` | przyciąganie w izometrii |
| `tileToIndex` / `indexToTile` | indeks 1D ↔ współrzędne kafelka 2D (dla płaskich tablic) |
| `generateGrid({gridSize, tileSize, callback?})` | generuje tablicę pozycji (albo wyników `callback`) dla całej siatki kartezjańskiej |
| `generateIsoGrid(...)` | to samo dla izometrii |

---

## `SpatialGrid.ts` / `spatialGridFrame.ts` — `SpatialGrid<T>`, `FrameSpatialGrid<T>`

Siatka przestrzenna do przybliżonego broad-phase (kto jest blisko kogo) — dzieli świat na komórki o stałym rozmiarze, obiekt trafia do wszystkich komórek, które przecina jego `bounds`.

- **`SpatialGrid<T>`** — **trwała**, śledzi obiekty po `id: Symbol`: `insert({id, bounds, data})`, `remove(id)`, `move(id, newBounds)` (przelicza tylko różnicę komórek, nie wszystko od zera), `query(range): T[]` (deduplikowane wyniki), `forEachCell(cb)` (debug/wizualizacja obłożenia komórek).
- **`FrameSpatialGrid<T>`** — **jednorazowa na klatkę**: `clear()` na początku klatki, potem same `insert()` (bez `id`, bez `remove`/`move`), `query(range)`. Tańsza, gdy i tak przebudowujesz całą strukturę co klatkę (np. do zapytań "kto jest w zasięgu" liczonych od zera).

Obie przyjmują `Box` lub `BoxAABB` zamiennie jako `bounds`/`range`.

---

## `quadTree.ts` / `quadTreeFrame.ts` — `QuadTree<T>`, `FrameQuadTree<T>`

Drzewo czwórkowe (dzieli się na 4 dzieci, gdy węzeł ma >8 obiektów i głębokość <6 — stałe `MAX_OBJECTS`/`MAX_DEPTH`) — lepsze niż siatka przy nierównomiernym rozłożeniu obiektów w przestrzeni.

- **`QuadTree<T>`** — **trwałe**, śledzi po `id: string | number`: `insert({id, bounds, data})`, `remove(id)`, `move(id, newBounds)` (jeśli nowe granice mieszczą się w tym samym węźle-rodzicu, przenosi tylko lokalnie; inaczej usuwa i wstawia od korzenia), `query(range): T[]`, `forEachNode(cb)` (debug: granice/głębokość/liczba obiektów węzła).
- **`FrameQuadTree<T>`** — **jednorazowe na klatkę**: `clear()` (resetuje obiekty **i** dzieci), `insert()` (bez `id`), `query(range)`, `forEachNode(cb)`.

W obu, obiekt trafia do **jednego** węzła — tego najgłębszego, który w całości zawiera jego `bounds` (`AABB.contains`); jeśli żadne dziecko go w pełni nie zawiera, zostaje w rodzicu.

### Kiedy `SpatialGrid` a kiedy `QuadTree`

- **`SpatialGrid`** — obiekty rozłożone w miarę równomiernie, znany sensowny rozmiar komórki (np. zbliżony do rozmiaru jednostek w grze).
- **`QuadTree`** — rozłożenie nierównomierne/nieznane z góry (duże puste obszary obok gęstych skupisk) — adaptacyjnie dzieli tylko tam, gdzie jest tłoczno.
- Wersja **bez `Frame`** (śledzenie po `id`, `move`/`remove`) — dla stanu, który żyje dłużej niż jedna klatka i zmienia się przyrostowo.
- Wersja **`Frame*`** — gdy i tak budujesz strukturę od zera co klatkę (prościej, mniej narzutu pamięciowego na rejestr `id`).
