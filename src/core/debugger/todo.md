# Debugger - todo / pomysły na moduły

## performance

- fps, 1% low
- render time, ile zajmuje konkretny render pipeline
- zużycie zasobów apki (RAM, % CPU)
- graf czasowy: każdy system i faza mierzone czasem bezpośrednio w silniku, z tego budowany graficzny graf ile co trwało + % zmiany (lepiej/gorzej) w ciągu ostatniej minuty
- GC spikes - mierzenie ile zajmuje garbage collection i wskazywanie problematycznych miejsc

## logger

- rozszerzona wersja console.log
- logi kategoryzowane (np. pipeline logs), każda kategoria ma flagę bool czy faktycznie loguje
- podpięcie się pod przeglądarkowe error listenery (window.onerror, unhandledrejection) i przekazywanie tego do profilera
- przerobienie natywnych console.log/error/warn tak, by same w sobie były event listenerami, pod które można się podpiąć

## GPU

- podgląd tekstur/render targetów
- staty (draw calls, tris, verts, batches)
- błędy WebGPU: uncapturederror na device, device.lost, getCompilationInfo() dla shaderów (błędy/warningi kompilacji WGSL z linią)

## dogma/pragma debug
- osobna kategoria pod debugowanie i pozyskiwanie informacji bezpośrednio z systemów dogma i pragma

## gameInspector

- live podgląd scen/aktorów, ile ich jest, w jakiej fazie, enabled/visible itp

## build info

- adapter GPU, tryb dev/prod, wersja itp
- jakiego systemu (dogma/pragma) obecnie używa build

## probe / watch

- generyczny odpowiednik tego co robi performance, ale dla dowolnej wartości z dowolnego miejsca w kodzie (jak "plot value" w Tracy / custom counter w Unity)
- zgłaszasz wartość w danym miejscu, moduł zbiera historię (rolling window jak w performance)
- dwa tryby podglądu: jak wartość mutuje w czasie (wykres) albo suma/agregat (np. ile razy coś się odpaliło w klatce/sekundzie)

## input debug

- co zostało kliknięte, czy przechwycone przez naviUI czy poszło do gry
- klik czy trzymanie (i ile ms trzymania)
- jakie teksty były wprowadzane

## session log

- ile trwa obecna sesja
- ile minęło czasu od początku świata
- jaki jest obecny czas w grze (jeśli gra ma swój czas)
- jakie są mnożniki czasu itp

## konsola profilera

- własne komendy set/get do wartości w grze
- ustawienia zmieniane w czasie rzeczywistym z poziomu profilera

## asset tracker

- co jest załadowane, mapa assetów
- ile czasu zajęło ładowanie
- czy coś się nie wczytało/failnęło
- cache hit/miss

## cello debug (audio)

- czy dźwięki mają odpowiednie efekty
- czy pozycjonowanie działa poprawnie (np. słychać z lewej jak ma być z lewej)
- czy głośność reaguje poprawnie na zoom itp
- lista dźwięków aktualnie granych
- kategorie dźwięków i ich obecne poziomy głośności
- logowanie zdarzeń związanych z cello

## navi debug (UI tree)

- wizualizacja całego drzewa Navi
- gdzie jakie elementy są aktywne
- co jest disabled, co jest !active
- co nigdy nie przechodzi dalej (martwe elementy)
- obecny hover itp

## tween/animation debug

- lista aktywnych tweenów, progress
- jaka funkcja easingu jest użyta
- wizualizacja krzywej

## snap

- może być zarazem screenshotem i zrzutką całego stanu gry w danym momencie (dump)
- (screenshot testing / porównywanie czy coś wygląda tak samo to już kwestia bibliotek testowych, nie debuggera)

## dysk / I/O

- każdy odczyt/zapis na dysku - co to było i ile trwało

## dump / record

- dump do plików - możliwość zrzucenia danych z debuggera (logi, performance itp) na dysk
- record - klikasz i nagrywa się plik z tego co gra robi w jakimś oknie czasowym (coś jak black box recorder, bufor z ostatnich X sekund)
