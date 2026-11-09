# ConferenceHub

Arbejdstitel. En kurateret oversigt over konferencer i plastik- og rekonstruktiv kirurgi, med datoer, abstract- og tilmeldingsfrister, kildecitater og deltagelse pr. gruppe.

Pilot: Plastikkirurgisk Afdeling, Herlev Hospital (læger og sygeplejersker).

Planen for version 1: https://claude.ai/artifact/DdEGUCu7NkkLsE1WwgLfk7

## Indhold

| Sti | Indhold |
| --- | --- |
| `data/editions.json` | Konferenceudgaver i pilot-scope. Hver udgave har et fast id (fx `dspr-efteraarsmoede-2026`), som deltagelse hænger på |
| `data/series.json` | Konferenceserier med korte navne |
| `supabase/schema.sql` | Databaseskema med rækkesikkerhed |
| `site/` | Den læsbare side (HTML, CSS, JS, egne skrifttyper) |
| `scripts/build.mjs` | Bygger `dist/` til Cloudflare Pages |

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
- [ ] Fase 0: Supabase-projekt (EU-region) og synkronisering
- [x] Fase 1: læsbar side (filtre, søgning, tidslinje, frister, kalenderfil pr. konference)
- [ ] Fase 1: offentliggørelse på Cloudflare Pages
- [ ] Fase 2: overvågning
- [ ] Fase 3: login, grupper og deltagelse
