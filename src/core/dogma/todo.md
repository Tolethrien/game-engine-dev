Cały system składa sie z kilku modułów

# Moduły

Dogma - glowny moduł zarzadzajacy scenami itp, glowna klasa obiektu
Scene - sceny ktore trzymaja swoje listy komponentow i systemow
Config - ustawienia Dogmy
System - zarzadza komponentami i modyfikuje dane
Entity - pojemnik na komponenty, plus ID
komponent - dane wszelakie np Transform
EntityManager - centralne miejsce zarzadzania cyklem zycia encji, dodaje i usuwa encje na poczatku klatki w swiatach lub w trakcie dzialania w specyficznych przypadkach

# Działanie

Cykl zycia wyglada nastepujaco, tworzysz swiat, w swiecie masz listy komponentow jako mapy oraz liste systemow tez jako mapy
systemy te beda loopowac na tych listach komponentow i wykonywac obliczenia
entity tak na prawde tylko przypisuje to samo ID do wszystkich komponentow danej encji
komponenty sa przechowywane w tych wlasnie listach tylko

na poczatku klatki EM leci przez wszystkie encje ktore sa zapisane do dodania i usuwania w danych scenach i je ogarnia
nastepnie Dogma leci przez wszystkie cykle zycia systemu: preUpdate,fixedUpdate,update,LateUpdate,Render, poza tym sa jeszcze onStart dla inicjacji sytemu i onDestroy

# Ficzery

system musi miec mozliwosc pakowania encji znowu w jeden plik i przesylania ich miedzy scenami
world ma shader data jesli musisz przekazac cos miedzy systemami
systemy moga miec aktywnosc i jak sa aktywne/nie to sie wykonuja lub nie
Dogma musi miec system dynamicznego przeskakiwania miedzy swiatami w locie
system singletone komponentow na Scene, np takie ktore nie musza byc przypisane do niczego,globalne jak czas swiata
system relacji parent/child i propagacja danych i odpowiednia kolejnosc obliczen

# Ulepszenia

pooling obiektow/komponentow? po co mam tworzyc setki transformow dla nowych obiektow jak moge po prostu przypisac juz istniejacy do nowej encji
