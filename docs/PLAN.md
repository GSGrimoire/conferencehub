# ConferenceHub: plan, beslutninger og status

Opdateret 16. november 2026.

- Opgaver og ansvarlige: Asana-projektet [ConferenceHub](https://app.asana.com/1/1199525921817881/project/1220566207179174)
- Fuld plan for version 1: [plandokument](https://claude.ai/artifact/DdEGUCu7NkkLsE1WwgLfk7)
- Siden: https://conferencehub.goofyspook.workers.dev

## Formål

En kurateret oversigt over konferencer i plastik- og rekonstruktiv kirurgi, hvor nye datoer og frister fanges kort efter de kommer online, og hvor kolleger kan melde deltagelse og se, hvem fra deres gruppe der skal afsted. Pilot: Plastikkirurgisk Afdeling, Herlev Hospital, læger og sygeplejersker.

## Beslutninger

| Dato | Beslutning |
| --- | --- |
| 3. nov. 2026 | Start med en pilot. Overvågning bygges før login, så data er pålidelige fra start |
| 8. nov. 2026 | Arbejdstitel ConferenceHub. Scope kun plastik- og rekonstruktiv kirurgi (kalenderens fane "Plastik & rekonstruktion") |
| 8. nov. 2026 | Offentligt repo på GSGrimoire-kontoen i piloten |
| 8. nov. 2026 | "Vis aktivitet" er en brugerindstilling: alle / min gruppe / ingen. Standard: min gruppe |
| 9. nov. 2026 | Login og tilmeldinger før redaktøren. Redaktøren kører med den eksisterende conference-calendar-skill ugentligt eller månedligt |
| 9. nov. 2026 | Google-login i betaen. Mail-login venter på eget domæne, fordi Supabase' indbyggede mailafsender kun sender til projektets team (højst 2 mails i timen) |

## Arkitektur

```
Konferencesider ──► Daglig overvågning (GitHub Action, scripts/watch.mjs)
                          │  ændringer og døde links
                          ▼
                    queue/<dato>.json ──► Redaktør (Claude + conference-calendar-skill)
                                                │  opdaterer
                                                ▼
                                          data/*.json ──► sync.yml ──► Supabase (database, login, regler)
                                                                              ▲
Brugere ◄──► Siden (Cloudflare Worker, site/) ────────────────────────────────┘
```

- **Data** ligger som JSON i `data/`, så hver ændring har en historik i git. `data/` er sandheden; databasen er en kopi.
- **Supabase** (projekt `vczueyxesistyzwyotyv`, EU) holder login, profiler, grupper og deltagelse. Migrationer i `supabase/migrations/` køres af Supabase' GitHub-kobling ved push til `main`.
- **Cloudflare Worker** `conferencehub` bygger siden med `node scripts/build.mjs` ved hvert push.
- **GitHub-secrets:** `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (bruges kun af `sync.yml`).

## Sikkerhedsmodel

Alle regler håndhæves i databasen med rækkesikkerhed (RLS), ikke kun på siden. Testet i Postgres (PGlite) 9. nov.

- Anonyme kan kun læse konferencedata (`series`, `editions`, `evidence`).
- En profil oprettes af en trigger ved første login. Brugeren kan kun ændre navn, rolle og "Vis aktivitet", aldrig `is_site_admin`.
- Deltagelse er synlig efter ejerens "Vis aktivitet". "Ingen" skjuler også personen på gruppens liste.
- Grupper oprettes og joines kun via `create_group` og `join_group`. Gruppe-admin kan fjerne medlemmer.
- Forslag kan ikke godkendes af brugeren selv.
- Den publishable key i `site/config.js` er offentlig af design. Secret key ligger kun i GitHub-secrets.

## Overvågning

- Kører dagligt. Udgaver med manglende felter eller frister/start inden for 90 dage tjekkes dagligt, andre ugentligt. Overståede udgaver tjekkes ikke.
- Respekterer robots.txt (bbm.cat forbyder robotter og tjekkes manuelt), egen user-agent, 1,5 s pause mellem sider.
- 16. nov.: korte linjer uden tal (formularfelter, menupunkter) ignoreres, fordi deres rækkefølge skifter fra besøg til besøg og gav falske ændringer på iCALS- og ICOPLAST-siderne. Datoer har altid tal og berøres ikke.

## Status

| Del | Status |
| --- | --- |
| Fase 0: repo, pilotdata (21 udgaver, 18 serier), skema | Færdig |
| Fase 1: læsbar side | Online |
| Fase 2: daglig overvågning (html, pdf) | Kører |
| Fase 2: seriesider, browserhentning, redaktør, godkendelseskø | Mangler |
| Fase 3 beta: login, grupper, deltagelse, Vis aktivitet, forslag | Bygget; venter på Google-opsætning |
| Mail-login, personligt kalenderfeed, admin-side | Mangler |
