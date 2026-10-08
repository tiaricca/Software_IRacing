# Track Academy

Web app mobile per imparare una pista di sim racing **prima** di guidarla: Studio a capitoli, quiz (in arrivo) e **Shadow Lap**, il giro a memoria con il telefono tenuto come un volante.

Stagione coperta: iRacing · Formula 1600 Rookie Series 2026 Season 4 · Ray FF1600. Oggi solo **Oulton Park International** ha un'Academy, ed è una versione pilota; le altre settimane compaiono come "in preparazione".

## Struttura

```
web/                          app statica, nessuno step di build (moduli ES)
  index.html, style.css       shell, temi chiaro/scuro su variabili CSS
  js/app.js                   router a hash, caricamento dati, tab Home · Piste · Shadow Lap
  js/views.js                 Home, Piste, pagina pista, impostazioni
  js/study.js                 indice Studio, lettore di capitolo, curve e note
  js/season.js                settimana corrente dal calendario (puro)
  js/store.js                 progressi locali + migrazione dallo spike (puro + IO)
  js/progress.js              stati derivati: capitoli, pista, statistiche (puro)
  js/theme.js                 Automatico / Chiaro / Scuro
  js/shadowlap.js             tab Shadow Lap: pista, modalità, calibrazione, giro, risultati
  js/steering.js              sterzo dal vettore gravità (+ mouse/frecce su computer)
  js/detector.js, scoring.js  curve rilevate e punteggio (puri)
  js/trackmap.js              mappa SVG, sequenze evidenziate, ghost
  data/seasons/*.json         calendario della stagione
  data/academies/*.json       contenuti per layout (circuito, layout, auto+layout)
  data/oulton-international.json   riferimento Shadow Lap GENERATO
  fonts/                      Archivo e JetBrains Mono (SIL OFL)
tools/build_track.py          OSM -> curve, tempi stimati, mappa
tests/                        node:test: logica, contenuti, punteggio, tentativi reali
```

## Comandi

```
node --test tests/*.test.mjs          # test
python tools/build_track.py           # rigenera il riferimento Shadow Lap di Oulton
python -m http.server -d web 8765     # prova locale su http://localhost:8765
```

Aggiungendo `?oggi=AAAA-MM-GG` all'indirizzo si simula un altro giorno della stagione (per la settimana corrente). Sul telefono i sensori funzionano solo in HTTPS: la versione online è pubblicata da GitHub Pages (`.github/workflows/pages.yml`).

## Limiti noti

- Calendario preliminare, da confrontare con l'interfaccia di iRacing.
- Shadow Lap: riferimento **stimato** dalla geometria OpenStreetMap con un modello semplificato, non un giro reale.
- I progressi restano solo nel browser del dispositivo: nessun account, nessuna sincronizzazione.

Geometria © OpenStreetMap contributors (ODbL). Progetto non affiliato a iRacing.
