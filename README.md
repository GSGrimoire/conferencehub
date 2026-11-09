# ConferenceHub

Arbejdstitel. En kurateret oversigt over konferencer i plastik- og rekonstruktiv kirurgi, med datoer, abstract- og tilmeldingsfrister, kildecitater og deltagelse pr. gruppe.

Pilot: Plastikkirurgisk Afdeling, Herlev Hospital (læger og sygeplejersker).

Planen for version 1: https://claude.ai/artifact/DdEGUCu7NkkLsE1WwgLfk7

## Indhold

| Sti | Indhold |
| --- | --- |
| `data/editions.json` | Konferenceudgaver i pilot-scope. Hver udgave har et fast id (fx `dspr-efteraarsmoede-2026`), som deltagelse hænger på |
| `data/series.json` | Konferenceserier med korte navne |
| `supabase/migrations/` | Databaseskema med rækkesikkerhed. Køres af Supabase-GitHub-koblingen ved push til `main` |
| `scripts/sync.mjs` | Lægger `data/` ind i Supabase (kører i `.github/workflows/sync.yml`) |
| `site/` | Den læsbare side (HTML, CSS, JS, egne skrifttyper) |
| `scripts/build.mjs` | Bygger `dist/` til Cloudflare Pages |
| `data/watch.json` | Overvågningslisten: sider pr. udgave, hentemåde og evt. interval |
| `scripts/watch.mjs` | Daglig ændringsdetektion (kører i `.github/workflows/watch.yml`) |
| `state/` | Fingeraftryk og seneste tekst pr. overvåget side |
| `queue/` | Ændringer og døde links til Claude-redaktøren, én fil pr. dag |

## Kør lokalt

```
node scripts/build.mjs
cd dist && python3 -m http.server 8000
```

Åbn http://localhost:8000. Tilføj `?today=2027-01-15` for at se siden, som den ser ud på en anden dato.

Cloudflare Pages: build-kommando `node scripts/build.mjs`, output-mappe `dist`.

## Vis aktivitet

Hver bruger vælger, hvem der kan se deres deltagelse:

- **Alle**: alle indloggede brugere
- **Min gruppe** (standard): kun medlemmer af mine grupper
- **Ingen**: kun mig selv

Reglen håndhæves i databasen (`attendance read`-politikken), ikke kun på hjemmesiden.

## Datavej

1. En daglig GitHub Action finder ændringer på konferencernes egne sider.
2. Claude-redaktøren udtrækker nye værdier med ordret kildecitat og committer dem til `data/`.
3. En natlig synkronisering lægger `data/` ind i Supabase.

## Status

- [x] Fase 0: pilotdata og skema
- [x] Fase 0: Supabase-projekt, migration og synkronisering
- [x] Fase 1: online på https://conferencehub.goofyspook.workers.dev
- [x] Fase 1: læsbar side (filtre, søgning, tidslinje, frister, kalenderfil pr. konference)
- [x] Fase 2: daglig ændringsdetektion (html og pdf)
- [ ] Fase 2: browserhentning, seriesider for næste udgave, Claude-redaktør og godkendelseskø
- [ ] Fase 3: login, grupper og deltagelse
