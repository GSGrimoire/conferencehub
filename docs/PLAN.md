# ConferenceHub: plan, beslutninger og status

Opdateret 23. november 2026.

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
| 16. nov. 2026 | Overvågningen kører ugentligt. Over 160 kommende udgaver deles de i hold, ét hold pr. kørsel; frister og starter inden for 6 uger tjekkes altid |
| 16. nov. 2026 | Ingen medadmin, før platformen kører. Gus koder og fletter ikke; Claude eller ChatGPT fletter efter kontrol |
| 16. nov. 2026 | Branches: `test` til alt nyt, `main` er det, der er online |
| 16. nov. 2026 | Gratis drift: Cloudflare (siden) og Supabase gratis (login og database). GitHub Actions-minutterne er brugt op til 1. dec., så alt bygges og kontrolleres lokalt, og overvågningen kører i Claude-redaktørens opgave |
| 16. nov. 2026 | Den månedlige Excel-opgave stoppes, når platformen er klar |
| 16. nov. 2026 | Asana-opgaver til Gus lægges både i ConferenceHub → "Til Gus" og i Gustav Day To Day → "Vigtigste opgave, 25 min". Gus ser kun Day To Day |
| 23. nov. 2026 | Supabase varslede pause ved lav databaseaktivitet. Den skrivebeskyttede kontrol `node scripts/check-supabase.mjs` er integreret på `test` og afprøvet mod den aktive database. Redaktørens køreplan afventer aktivering. |
| 16. nov. 2026 | Behold Supabase til SurgicalConferenceHub og GS QR Bar foreløbigt, uden tidlig opdeling. Ved delt `auth.users` fjerner kontosletning også GS QR Bar-login. Kræv tydelig advarsel, teknisk verifikation og uafhængig sikkerhedsreview før lancering. [Beslutningsnotat](decisions/0001-shared-supabase.md) |
| 23. nov. 2026 | Pilotønske: bevar Google-login og tilbyd engangskode via e-mail (også @regionh.dk). Kode og test forberedt på særskilt udviklingsbranch; produktionsfunktion forbliver slået fra, indtil verificeret mailafsender, skabelon, integrationstest og Full review er gennemført. [Opsætning](EMAIL_LOGIN.md). |
| 23. nov. 2026 | Claude gennemførte uafhængig Full review af e-mail-login (SHA 4cb9063): **REVISE PLAN**. Krav: nybruger-skabelon, kodeudløb 600 s, reel server-side rollback, genafsendelse og dialogreset. Disse rettelser er forberedt på samme featurebranch; **anden review og live-test mangler**. [Review](reviews/2026-11-23-pr6-claude.md). |

## Arkitektur

**Tværgående loginbeslutning:** Se [beslutning 0001 om fælles Supabase](decisions/0001-shared-supabase.md). ConferenceHub bruger Supabase Auth. Den publicerede GS QR Bar-version 6 bruger ChatGPT-login og Cloudflare D1 ifølge kilden til den publicerede version. Kontosletning har fortsat sin egen [udestående integrationstest og gennemgang](https://github.com/GSGrimoire/conferencehub/issues/1).

```
Konferencesider ──► Claude-redaktør, foreslået køreplan (docs/EDITOR.md)
                      │  1. scripts/watch.mjs: ugentlig ændringsdetektion → queue/
                      │  2. forslag med ordret citat → review/proposals.json
                      │  3. scripts/apply.mjs: kontrol i kode
                      ▼
                data/*.json (+ evidence.json) ──► test ──► main ──► udgivelse i Cloudflare
                      │                                         └─► sync.yml ──► Supabase (når der er Actions-minutter)
                      └─ ændringer og nye udgaver → review/pending.json → Asana "Til Gus" → godkend/afvis
Brugere ◄──► Siden (Cloudflare Worker, site/) ◄──► Supabase (login, grupper, deltagelse)
```
- **Data** ligger som JSON i `data/`, så hver ændring har en historik i git. `data/` er sandheden; databasen er en kopi.
- **Supabase** (projekt `vczueyxesistyzwyotyv`, EU) holder login, profiler, grupper og deltagelse. Projektet viser `main` som standardgren. Kontrollér anvendte versioner i Supabase frem for at udlede dem fra GitHub.
- **Cloudflare Worker** `conferencehub` serverer `dist/` fra den aktive version. `node scripts/build.mjs` bygger filerne fra den godkendte kilde.
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

- Overvågningen er bygget til en ugentlig redaktørkørsel. Sidste journalførte fulde redaktørkørsel var 16. november. Overståede udgaver tjekkes ikke.
- Over 160 kommende udgaver deles de i hold efter et fast fingeraftryk af id'et, og ISO-ugenummeret afgør, hvilket hold der er på. Udgaver med frist eller start inden for 6 uger tjekkes i hver kørsel.
- Respekterer robots.txt (bbm.cat forbyder robotter og tjekkes manuelt), egen user-agent, 1,5 s pause mellem sider.
- 16. nov.: korte linjer uden tal (formularfelter, menupunkter) ignoreres, fordi deres rækkefølge skifter fra besøg til besøg og gav falske ændringer på iCALS- og ICOPLAST-siderne. Datoer har altid tal og berøres ikke.

## Redaktørens kontrol

`scripts/apply.mjs` udgiver kun en værdi, når kilden ligger på konferencens egne domæner, citatet står ordret på siden, datoen kan læses ud af citatet, og en frist ligger før konferencens start. Tomme felter udgives automatisk; ændringer af eksisterende værdier og nye udgaver venter på godkendelse. Første lokale kørsel 16. nov.: 3 frister udgivet (iCALS abstract, WSRM abstract og early bird), 10 værdier bekræftet, 1 ændring til godkendelse (Düsseldorf early bird 12. → 15. jan. 2027). Opdigtede citater og fremmede domæner blev afvist.

## Status ved pilotgennemgangen 23. november

| Del | Status |
| --- | --- |
| Fase 0: repo, pilotdata (21 udgaver, 18 serier), skema | Færdig |
| Fase 1: læsbar side | Online |
| Fase 2: overvågning (html, pdf) | Ugentlig fra 16. nov.; køres lokalt indtil redaktøren er planlagt |
| Fase 2: redaktørens kontrol og godkendelsesliste | Bygget og testet lokalt 16. nov. |
| Fase 2: redaktøren som planlagt opgave, seriesider, browserhentning | Mangler |
| Fase 3 beta: login, grupper, deltagelse, Vis aktivitet, forslag | Google er slået fra i Supabase. Der var ingen registrerede konti ved kontrollen 27. nov. |
| Privatlivsside og "slet min konto" | I gang på `test` |
| Mail-login, personligt kalenderfeed, admin-side | E-mail-kode-login rettet efter første Claude Full review, der konkluderede **REVISE PLAN**. Nybruger-/Magic Link-skabeloner, 60-sekunders genafsendelse og 600-sekunders udløb er dokumenteret, men opsætning er **ikke aktiv**. Ny uafhængig godkendelse, mailafsender, live-dokumentation og browser-test mangler. Kalenderfeed og admin-side mangler. |
| Supabase-synkronisering | Venter på GitHub Actions-minutter (1. dec.); siden læser data direkte fra repo'et og påvirkes ikke |
| Supabase-aktivitet | Skrivebeskyttet læseprøve bestået. Automatisk redaktørkøreplan afventer godkendelse |

## Udgivelsesstatus

- Kontrol 27. november: Produktionen leverer `main` ved `3def461`. Den seneste aktive Cloudflare-udgivelse er fra 16. november. Den eneste fundne Cloudflare-udløser for denne Worker bygger en preview af mail-login-grenen. Kontrollér og verificér en særskilt produktionsudgivelse i Cloudflare efter en godkendt integration.
- Supabase havde ved kontrollen kun de oprindelige migrationer `init` og `auth_beta`. Verificér migrationshistorikken efter en fremtidig databaseudgivelse.
- `test` indeholder den udskudte kontosletning. Datakorrekturer, brand og katalogforbedringer kan gennemgås på egne grene. En samlet release fra `test` afventer en afklaring af den udskudte ændring.
- [Mail-login #6](https://github.com/GSGrimoire/conferencehub/pull/6), [katalog #7](https://github.com/GSGrimoire/conferencehub/pull/7) og [adgangsrettelser #8](https://github.com/GSGrimoire/conferencehub/pull/8) stod til uafhængig gennemgang 27. november. Kalenderfeed og redaktørens godkendelseskø mangler.
- `sync.yml` kan starte på dataændringer på `main`. Følg Hub-reglerne om lokale kontroller og GitHub Actions, og verificér databasen særskilt, når katalogdata skal synkroniseres.
