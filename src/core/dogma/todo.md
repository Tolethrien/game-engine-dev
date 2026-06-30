# Ficzery

system musi miec mozliwosc pakowania encji znowu w jeden plik i przesylania ich miedzy scenami
system singletone komponentow na Scene, np takie ktore nie musza byc przypisane do niczego,globalne jak czas swiata
system relacji parent/child i propagacja danych i odpowiednia kolejnosc obliczen
dodaj on frameStart i end do dogmy glownej by mozna np tam wstawaic debugowanie i profilowanie (jest w system)
system eventow z opcja imidieate i deferred

# Ulepszenia

pooling obiektow/komponentow? po co mam tworzyc setki transformow dla nowych obiektow jak moge po prostu przypisac juz istniejacy do nowej encji

## potencjalne przemyslenia

- powinienem czyscic querisy jak sie usuwaja encje wszystkie z nich
- obecnie entityMarker jest [] by miec mutowalnosc i kazdy komponent mial referencje do tej samej listy i markera ALE w sumie nie mam mozliwosci obecnie zmieniania markera ani dodawania i usuwania komponentow z encji w locie! wiec teorytycznie to moze byc przekazywane jako string do komponentu, ale pewnie bede chcial mozliwosc dodawania usuwania komponentow w locie
- klasa entityManager w sumie moze byc zbedna niedługo jesli wprowadze eventy bo spawn destroy moze byc w niej
- czy ja chce lepiej ogarnac gettery na rzeczy jak isActive by faktyczne to gettery byly
- w getComponentsGroup nie podobam i sie to const w typach, ulepszyc to jakso moge potem
- zrobic jakos omit na subkryberze fazy by nie bylo eventu fazy
