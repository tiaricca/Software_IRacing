# Track Academy — Shadow Lap spike

Esperimento per validare lo **Shadow Lap**: tieni il telefono come un volante e fai un giro di pista a memoria. Il telefono registra le rotazioni e le confronta con un riferimento.

Pista: **Oulton Park International** (iRacing · Ray FF1600).

## Struttura

```
web/                  app statica (nessun build): HTML + moduli JS
  js/steering.js      sterzo dal vettore gravità (+ mouse/frecce su computer)
  js/detector.js      flusso di angoli -> curve destra/sinistra
  js/scoring.js       allineamento con il riferimento + punteggio
  data/*.json         riferimento generato (non modificare a mano)
tools/build_track.py  OSM -> curve, tempi stimati, mappa
tests/                test di rilevamento e punteggio
```

## Comandi

```
python tools/build_track.py           # rigenera web/data/oulton-international.json
node --test tests/*.test.mjs          # test
python -m http.server -d web 8000     # prova locale su http://localhost:8000
```

Su telefono i sensori funzionano solo in HTTPS: usare GitHub Pages (workflow in `.github/workflows/pages.yml`, Settings → Pages → Source: GitHub Actions).

## Limiti noti

- Tempi, velocità e frenate sono **stime** da un modello fisico semplificato sulla geometria OpenStreetMap, non un giro reale. Da sostituire con telemetria `.ibt`.
- iPhone: niente blocco dell'orientamento né vibrazione dal browser.

Geometria © OpenStreetMap contributors (ODbL). Progetto non affiliato a iRacing.
