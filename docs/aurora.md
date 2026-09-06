# AURORA — dokumentacja dla użytkownika

**AURORA** to renderer 2D na WebGPU: batchowanie sprite'ów/kwadratów/tekstu, światła punktowe z globalną iluminacją, bloom, tone mapping i osobny pipeline na UI. Ta wersja jest przejściowa (idzie do przebudowy na V3) — dokument skupia się na tym, jak z niej korzystać dzisiaj, nie na jej wewnętrznych niedoróbkach.

- **`Aurora`** (`core.ts`) — cienka warstwa nad WebGPU: device/adapter/context, tworzenie buforów/tekstur/shaderów/pipeline'ów. Zwykle nie dotykasz jej bezpośrednio w kodzie gry.
- **`Renderer`** — orkiestrator: inicjalizacja z configu, zarządzanie zasobami (bufory, tekstury, fonty, samplery), kolejność pipeline'ów, `beginBatch()`/`endBatch()` co klatkę.
- **`Draw`** — API, którego realnie używasz w grze: `rect`, `circle`, `sprite`, `text`, `pointLight`, `guiRect`, `guiText`, `clip`.
- **`AuroraCamera`** — pozycja/zoom kamery 2D, konwersje świat↔ekran, opcjonalne wbudowane sterowanie (WASD+scroll).

---

## Szybki start

```ts
import Renderer from "@aurora/renderer/renderer";
import auroraConfig from "@aurora/renderer/config";
import Aurora from "@aurora/core";
import Draw from "@aurora/draw";

// 1. Aurora.init(canvas) — robi to za Ciebie Engine.initialize(), patrz engine.md

// 2. Skonfiguruj i zainicjalizuj renderer (w preload())
const config = auroraConfig({
  userTextures: [{ name: "player", url: "assets/player.png" }],
  userFonts: [],
  feature: { bloom: true, lighting: true },
  camera: { builtInCameraInputs: true, speed: 15, zoom: { min: 0.5, max: 3 } },
  rendering: {
    sortOrder: "y",
    renderRes: "1920x1080",
    toneMapping: "aces",
    drawOrigin: "center",
    canvasColor: [0, 0, 0, 255],
  },
});
await Renderer.initialize(config);

// 3. Co klatkę (robi to Engine — patrz engine.md), między beginBatch/endBatch:
Renderer.beginBatch();
Draw.rect({
  position: { x: 100, y: 100, z: 1 },
  size: { width: 64, height: 64 },
  tint: [255, 80, 80, 255],
});
Draw.sprite({
  position: { x: 200, y: 100, z: 1 },
  size: { width: 32, height: 32 },
  crop: { x: 0, y: 0, width: 32, height: 32 },
  textureToUse: "player",
});
Renderer.endBatch();
```

`auroraConfig(props)` scala Twój (częściowy) config z sensownymi domyślnymi (`DeepPartial<AuroraConfig>` → pełny `AuroraConfig`) i dokłada wbudowaną teksturę (`colorRect`, do rysowania czystego koloru) oraz dwa wbudowane fonty (`lato`, `jersey`) — masz je od razu dostępne bez własnego configu.

---

## Konfiguracja (`AuroraConfig`)

| Sekcja | Pola | Znaczenie |
|---|---|---|
| `feature` | `bloom`, `lighting` | włącz/wyłącz cały pipeline blooma / oświetlenia |
| `bloom` | `numberOfPasses`, `threshold`, `knee`, `intense` | parametry efektu bloom |
| `rendering` | `renderRes` (`"1920x1080"` \| `"1280x720"` \| `"854x480"` \| `"640x360"`), `drawOrigin` (`"center"` \| `"topLeft"`), `toneMapping` (`"none"` \| `"rainhard"` \| `"aces"` \| `"filmic"`), `sortOrder` (`"none"` \| `"y"` \| `"y+x"` \| `"y+x+z"`), `transparentCanvas`, `canvasColor`, `computeGroupSize` | rozdzielczość wewnętrznego renderu (skalowana potem na canvas), punkt odniesienia rysowania, tone mapping HDR→LDR, sortowanie sprite'ów do rysowania w batchu |
| `camera` | `builtInCameraInputs`, `zoom: {min,max}`, `speed` | wbudowane sterowanie kamerą (WASD/strzałki + scroll na zoom) |
| `debugger` | `"none"` \| `"minimal"` \| `"normal"` \| `"extended"` | poziom szczegółowości danych wysyłanych do profilera |
| `userTextures` | `{name, url}[]` | tekstury gry, ładowane do jednej tablicy tekstur (texture array) |
| `userFonts` | `{fontName, img, json}[]` | fonty MSDF (bitmapa + metadane wygenerowane narzędziem MSDF) |

Zmiana configu w locie (część opcji):

```ts
await Renderer.setRendererSettings({
  feature: { bloom: false },
  render: { renderRes: "1280x720", canvasColor: [0, 0, 0, 255] },
});
```

---

## Rysowanie świata (`Draw`)

Wszystko poniżej wywołujesz **między** `Renderer.beginBatch()` a `Renderer.endBatch()` (robi to `Engine` co klatkę — patrz [engine.md](./engine.md)). Współrzędne to przestrzeń świata (przechodzą przez kamerę), `position.z` steruje kolejnością/warstwą.

```ts
Draw.rect({ position, size, tint?, emissive?, rounded? });     // kolorowy prostokąt (z opcjonalnym zaokrągleniem rogów)
Draw.circle({ position, size, tint?, emissive? });               // kwadrat maskowany do koła (fragment shader dyskretuje róg)
Draw.sprite({ position, size, crop, textureToUse, tint?, emissive?, rounded? }); // wycinek tekstury z tablicy userTextures
Draw.text({ position, text, font, fontSize, fontColor?, emissive? }); // tekst MSDF w świecie (skaluje się z kamerą)
Draw.pointLight({ position, size, tint?, intensity });           // światło punktowe (tylko gdy feature.lighting === true)
```

- `tint` domyślnie `[255,255,255,255]` (bez przebarwienia); alfa `0` pomija cały draw call.
- `emissive` (domyślnie `1`) mnoży jasność — wartości `>1` "świecą" (widoczne przy włączonym bloomie).
- `crop` w `sprite` to wycinek **w pikselach** tekstury źródłowej (nie znormalizowany 0–1).
- `Renderer.setGlobalIllumination([r,g,b])` ustawia bazowe oświetlenie sceny (widoczne, gdy `feature.lighting` jest włączone) — wołane raz na klatkę, przed rysowaniem.

### Rysowanie UI (`guiRect`/`guiText`/`clip`)

Osobny pipeline (`GuiPipeline`) — rysuje **poza** przestrzenią kamery, wprost w przestrzeni ekranu (tego używa np. NAVI):

```ts
Draw.guiRect({ position, size, tint?, rounded?, background?, crop? }); // background = nazwa tekstury
Draw.guiText({ position: {x,y,mode}, text, font, fontSize: {size,mode}, fontColor? }); // mode: "pixel" | "percent"
Draw.clip({ position, size }); // ustawia scissor/clip rect na kolejne guiRect/guiText
Draw.popClip();                 // zdejmuje clip
```

---

## Fonty i tekst

Fonty to format **MSDF** (bitmapa + JSON z metrykami znaków) — dwa wbudowane (`"lato"`, `"jersey"`) są dokładane automatycznie przez `auroraConfig`. Własny font dodajesz przez `userFonts: [{ fontName, img, json }]` w configu (wygenerowany zewnętrznym narzędziem MSDF, np. `msdf-bmfont`).

```ts
Draw.text({
  position: { x: 400, y: 300, z: 1 },
  text: "Hello!",
  font: "lato",
  fontSize: 32,
  fontColor: [255, 255, 255, 255],
});
```

---

## Kamera (`AuroraCamera`)

```ts
AuroraCamera.getPosition;           // {x, y} — środek widoku w świecie
AuroraCamera.getZoom;               // aktualny zoom
AuroraCamera.getViewBox();          // Box widocznego obszaru świata
AuroraCamera.worldToScreen(pos);    // world -> ekran, z uwzględnieniem zoomu/pozycji
AuroraCamera.screenToWorld(pos);    // ekran -> world
```

Z `camera.builtInCameraInputs: true` w configu kamera sama reaguje na WASD/strzałki (ruch) i scroll (zoom), bez podpinania niczego dodatkowego — przydatne do szybkich prototypów; do własnego sterowania zostaw `false` i steruj kamerą przez `AuroraCamera.setMatrix`/własną logikę.

---

## Tekstury

```ts
// wgrane raz przy starcie, przez config:
auroraConfig({ userTextures: [{ name: "enemy", url: "assets/enemy.png" }] });

// doładowanie/podmiana całej listy w locie:
await Renderer.reuploadUserTextures([{ name: "enemy2", url: "assets/enemy2.png" }]);
```

Wszystkie `userTextures` trafiają do jednej tablicy tekstur (`texture_2d_array`) tego samego rozmiaru (dopasowanego do największej) — `textureToUse`/`background` odwołują się do nich po nazwie.

---

## Pisanie własnych shaderów (WGSL)

Shadery to zwykłe pliki `.wgsl`, importowane w kodzie TypeScript jako surowy tekst (`?raw`, Vite) i kompilowane przez `Aurora.createShader(name, code)`:

```ts
import myShaderCode from "./shaders/myShader.wgsl?raw";
import Aurora from "@aurora/core";

const shader = Aurora.createShader("myShader", myShaderCode);
```

Każdy shader do rysowania (`createRenderPipeline`) ma dwa entry pointy w jednym pliku: `vertexMain` i `fragmentMain`. Poniżej realny shader silnika (`shaders/draw/drawQuad.wgsl`), który rysuje prostokąty/sprite'y w świecie — dobry wzór do własnego:

```wgsl
// grupa 0: kamera (mat4x4, wspólna dla wszystkich draw calli w tej klatce)
@group(0) @binding(0) var<uniform> camera: mat4x4<f32>;
// grupa 1: sampler + tablica tekstur (wszystkie userTextures naraz)
@group(1) @binding(0) var universalSampler: sampler;
@group(1) @binding(1) var userTextures: texture_2d_array<f32>;

// dane PER INSTANCJĘ (jeden wpis w buforze wierzchołków = jeden narysowany quad)
struct VertexInput {
    @builtin(vertex_index) vi: u32,       // 0..3 — który róg quada (silnik rysuje quady jako triangle-strip z 4 wierzchołków)
    @location(0) pos: vec3<f32>,          // pozycja w świecie (x, y, z)
    @location(1) size: vec2<f32>,         // rozmiar w pikselach świata
    @location(2) crop: vec4<f32>,         // wycinek tekstury w pikselach (x, y, w, h)
    @location(3) textureIndex: f32,       // indeks w tablicy userTextures
    @location(4) color: vec4<f32>,        // tint 0-255 per kanał
    @location(5) emissive: f32,           // mnożnik jasności
    @location(6) round: f32,              // >0.5 = maskuj do koła (patrz fragment)
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) crop: vec2<f32>,                              // UV w teksturze dla tego wierzchołka
    @location(1) @interpolate(flat) textureIndex: f32,
    @location(2) @interpolate(flat) color: vec4<f32>,
    @location(3) z: f32,
    @location(4) @interpolate(flat) emissive: f32,
    @location(5) localUV: vec2<f32>,                           // 0..1 lokalnie na quadzie, do maski koła
    @location(6) @interpolate(flat) round: f32,
};

// 4 rogi jednostkowego quada — vi (0..3) wybiera, który to wierzchołek
const quad = array(vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0), vec2f(1.0, 1.0));

@vertex
fn vertexMain(props: VertexInput) -> VertexOutput {
    // rozstaw róg quada wg rozmiaru, przesuń do pozycji w świecie, przepuść przez kamerę
    let worldPos = props.pos.xy + (quad[props.vi] * props.size);
    let translatePosition = camera * vec4<f32>(worldPos, props.pos.z, 1.0);

    var out: VertexOutput;
    out.position = vec4<f32>(translatePosition.xy, props.pos.z, 1.0);
    out.localUV = quad[props.vi];
    out.color = props.color;
    out.emissive = props.emissive;
    out.textureIndex = props.textureIndex;
    out.round = props.round;
    return out;
}

@fragment
fn fragmentMain(props: VertexOutput) -> @location(0) vec4<f32> {
    // maska koła: odrzuć piksele poza jednostkowym okręgiem wokół środka quada
    if (props.round > 0.5) {
        let centered = (props.localUV - vec2<f32>(0.5, 0.5)) * 2.0;
        if (dot(centered, centered) > 1.0) { discard; }
    }
    let texture = textureSampleLevel(userTextures, universalSampler, props.crop, u32(props.textureIndex), 0);
    if (texture.a < 0.001) { discard; }
    let color = props.color / 255.0;
    return vec4<f32>(texture.rgb * color.rgb * props.emissive, texture.a * color.a);
}
```

Kilka konwencji widocznych powyżej, które warto zachować w nowych shaderach:

- **Kolor wchodzi jako 0–255**, nie 0–1 — dzielisz przez `255.0` w fragmencie.
- **`@interpolate(flat)`** na polach, które mają być identyczne dla całego trójkąta/quada (indeks tekstury, kolor, emissive) — bez tego GPU je interpoluje, co dla indeksów/flag jest błędem.
- **Jeden wpis w buforze wierzchołków = jedna instancja** (kwadrat/sprite/znak tekstu), nie jeden wierzchołek — `@builtin(vertex_index)` wybiera róg z tablicy `quad`, więc bufor CPU-side (patrz `Draw.rect`/`Draw.sprite` w `draw.ts`) zapisuje dane **raz na quad**, a GPU sam generuje 4 rogi.
- Grupa `0` to zawsze dane globalne dla klatki (kamera, viewport), grupa `1`+ to dane specyficzne dla danego shadera (tekstury, sampler).

Gotowy shader podłącza się do pipeline'u przez `Aurora.createRenderPipeline({ shader, buffers, ... })`, gdzie `buffers` (`GPUVertexBufferLayout`) opisuje dokładnie te same pola co `VertexInput` — patrz istniejące pipeline'y w `src/core/aurora/pipelines/` jako wzór (np. `sortedDraw.ts` dla layoutu pasującego do `drawQuad.wgsl`).

---

## Struktura wewnętrzna (orientacyjnie)

Kolejność pipeline'ów w jednej klatce (`Renderer` je spina): rysowanie świata (`SortedDraw`/`SequentialDraw`, zależnie od `sortOrder`) → światła (`Lights`) → bloom (`Bloom`) → korekcja koloru/tone mapping (`ColorCorrection`) → post-process LDR (`PostProcessLDR`) → UI (`Gui`) → prezentacja na canvas (`ScreenPipeline`). Shadery leżą w `src/core/aurora/shaders/`, pogrupowane wg tej samej roli (`draw/`, `lights/`, `post/`, `display/`, `general/` — downscale/upscale/blur używane przez kilka pipeline'ów naraz).

---

## Ściąga (cheat sheet)

```ts
const config = auroraConfig({ userTextures: [{ name: "hero", url: "hero.png" }] });
await Renderer.initialize(config);

Renderer.beginBatch();
Renderer.setGlobalIllumination([255, 255, 255]);
Draw.rect({ position: { x: 0, y: 0, z: 0 }, size: { width: 50, height: 50 }, tint: [255,0,0,255] });
Draw.sprite({ position: { x: 100, y: 0, z: 0 }, size: { width: 32, height: 32 }, crop: { x:0,y:0,width:32,height:32 }, textureToUse: "hero" });
Draw.text({ position: { x: 0, y: -50, z: 0 }, text: "HP: 100", font: "lato", fontSize: 20 });
Draw.pointLight({ position: { x: 0, y: 0, z: 0 }, size: { width: 300, height: 300 }, intensity: 50, tint: [255,200,150] });
Renderer.endBatch();

AuroraCamera.worldToScreen({ x: 0, y: 0 });
```
