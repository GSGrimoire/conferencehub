# ConferenceHub

Arbejdstitel. En kurateret oversigt over konferencer i plastik- og rekonstruktiv kirurgi, med datoer, abstract- og tilmeldingsfrister, kildecitater og deltagelse pr. gruppe.

Pilot: Plastikkirurgisk Afdeling, Herlev Hospital (læger og sygeplejersker).

- Regler for Claude og ChatGPT: [AGENTS.md](AGENTS.md)
- Plan, beslutninger, arkitektur og status: [docs/PLAN.md](docs/PLAN.md)
- Opgaver: Asana-projektet [ConferenceHub](https://app.asana.com/1/1199525921817881/project/1220566207179174)
- Plandokument for version 1: https://claude.ai/artifact/DdEGUCu7NkkLsE1WwgLfk7

## Indhold

| Sti | Indhold |
| --- | --- |
| `data/editions.json` | Konferenceudgaver i pilot-scope. Hver udgave har et fast id (fx `dspr-efteraarsmoede-2026`), som deltagelse hænger på |
| `data/series.json` | Konferenceserier med korte navne |
| `supabase/migrations/` | Databaseskema med rækkesikkerhed. Køres af Supabase-GitHub-koblingen ved push til `main` |
| `scripts/sync.mjs` | Lægger `data/` ind i Supabase (kører i `.github/workflows/sync.yml`) |
| `site/` | Siden (HTML, CSS, JS, egne skrifttyper). `auth.js` = login og deltagelse, `config.js` = Supabase-URL og publishable key |
| `scripts/build.mjs` | Bygger `dist/` til Cloudflare Pages |
| `data/watch.json` | Overvågningslisten: sider pr. udgave, hentemåde og evt. interval |
| `scripts/watch.mjs` | Ugentlig ændringsdetektion (kører i Claude-redaktørens planlagte opgave) |
| `scripts/apply.mjs` | Redaktørens kontrol i kode: kilde, ordret citat, dato, frist før start. Udgiver eller lægger til godkendelse |
| `data/evidence.json` | Kilden bag hvert felt: URL og ordret citat. Vises som "kilde" på siden |
| `review/` | `proposals.json` (redaktørens forslag), `pending.json` (venter på Gus), `decisions.json`, `last-run.md` |
| `docs/EDITOR.md` | Redaktørens ugentlige procedure |
| `docs/DESIGN_INSPIRATION.md` | Links til designinspiration til et fremtidigt redesign |
| `tests/` | `node --test tests/*.test.mjs`. Databasetest af migrationerne (PGlite): se `tests/db/rls.check.mjs` |
| `site/privatliv.html` | Privatlivsside: hvad der gemmes, hvem der ser det, og "Slet min konto" |
| `state/` | Fingeraftryk og seneste tekst pr. overvåget side |
| `queue/` | Ændringer og døde links til Claude-redaktøren, én fil pr. dag |

## Kør lokalt

```
node scripts/build.mjs
cd dist && python3 -m http.server 8000
```

Åbn http://localhost:8000. Tilføj `?today=2027-01-15` for at se siden, som den ser ud på en anden dato.

Cloudflare: build-kommando `node scripts/build.mjs`, output-mappe `dist`. Siden bygges fra `main`.

## Kontrollér Supabase-forbindelsen

Fra repoets rod kan redaktøren køre `node scripts/check-supabase.mjs`. Det laver præcis én læseforespørgsel mod højst én offentlig konferencerække i Supabase ved hjælp af den offentlige nøgle, der allerede ligger i `site/config.js`. Det kræver netadgang; returstatus og fejl vises, men der skrives ikke i databasen. En vellykket læsning er **ikke** garanti for, at et gratis Supabase-projekt undgår automatisk pause. Se `docs/EDITOR.md` for, hvordan kontrollen passer ind i redaktørens procedure.

## Branches

- `test`: alt nyt lander her først og kontrolleres lokalt (tests, build, browser).
- `main`: det, der er online. Claude eller ChatGPT fletter `test` ind i `main`, når kontrollen er bestået. Gus fletter ikke selv.

## Vis aktivitet

Hver bruger vælger, hvem der kan se deres deltagelse:

- **Alle**: alle indloggede brugere
- **Min gruppe** (standard): kun medlemmer af mine grupper
- **Ingen**: kun mig selv

Reglen håndhæves i databasen (`attendance read`-politikken), ikke kun på hjemmesiden.

## Datavej

1. Claude-redaktøren (planlagt opgave, se [docs/EDITOR.md](docs/EDITOR.md)) kører overvågningen ugentligt og finder nye værdier med ordret kildecitat.
2. `scripts/apply.mjs` kontrollerer hvert forslag. Tomme felter udgives, ændringer venter på Gus' godkendelse i Asana.
3. Ved push til `main` bygger Cloudflare siden. `sync.yml` lægger `data/` ind i Supabase, når der er GitHub Actions-minutter (ikke før 1. dec. 2026).

## Status

- [x] Fase 0: pilotdata og skema
- [x] Fase 0: Supabase-projekt, migration og synkronisering
- [x] Fase 1: online på https://conferencehub.goofyspook.workers.dev
- [x] Fase 1: læsbar side (filtre, søgning, tidslinje, frister, kalenderfil pr. konference)
- [x] Fase 2: ændringsdetektion (html og pdf), ugentlig fra 16. nov.
- [x] Fase 2: redaktørens kontrol i kode og godkendelsesliste (16. nov., testet lokalt)
- [ ] Fase 2: redaktøren som planlagt opgave, browserhentning, seriesider for næste udgave
- [x] Fase 3 (beta): login med Google, grupper med invitationslink, deltagelse, Vis aktivitet, forslag
- [ ] Fase 3: mail-login (kræver eget domæne + SMTP), personligt kalenderfeed
