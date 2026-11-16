# Claude-redaktøren: ugentlig procedure

Redaktøren er en planlagt Claude-opgave. Den kører overvågningen, finder nye værdier med ordret citat, lader koden kontrollere dem og udgiver det, der består. Den bruger ingen GitHub Actions-minutter.

Besluttet 16. nov. 2026: overvågningen kører ugentligt. Når der er flere end 160 kommende udgaver, deles de i hold, og hver kørsel tager ét hold (`ROTATE_ABOVE` i `scripts/watch.mjs`). Udgaver med frist eller start inden for 6 uger tjekkes altid.

## Hvornår

Mandag og torsdag kl. 06 dansk tid. Siderne hentes kun, når der er gået 7 dage siden sidste tjek, så torsdagskørslen tager sig af godkendelser og holder Supabase-projektet aktivt (gratis projekter sættes på pause efter en uges inaktivitet).

## Trin

1. **Hent repo'et og skift til `test`.** `git checkout test && git pull && git merge --ff-only origin/main`.
2. **Godkendelser.** Læs Asana-opgaven "[godkend] ConferenceHub-ændringer" (i "Til Gus" og i Gustav Day To Day). For hvert id, Gus har skrevet `ja` eller `nej` ud for: `node scripts/apply.mjs --approve id1,id2` og `--reject id3`. Skriv i opgaven, hvad der er gjort, og ret aldrig Gus' svar.
3. **Overvågning.** `node scripts/watch.mjs`. Ændringer og døde links lander i `queue/<dato>.json`.
4. **Find værdier.** For hver kommende udgave i køen eller med tomme felter: hent siderne i `links` og deres undersider på samme domæne ("Important dates", "Abstracts", "Registration"). Skriv forslag i `review/proposals.json`:
   ```json
   [{ "edition_id": "wsrm-2027", "field": "abstract_deadline", "value": "2026-12-01",
      "url": "https://www.wsrm2027.com/important-dates/", "quote": "1 December 2026 Abstract Submission Deadline" }]
   ```
   - Felter: `start`, `end`, `venue`, `abstract_deadline`, `early_bird_deadline`, `registration_deadline`.
   - Citatet kopieres ordret fra den hentede tekst, aldrig oversat eller omformuleret. Står etiket og dato på hver sin linje, sættes de sammen med ét mellemrum.
   - `venue` foreslås kun, når feltet er tomt, og skrives som på siden.
   - `registration_deadline` er sidste frist for tilmelding, ikke datoen for skift fra almindelig pris til pris på stedet.
   - Brugbare undersider tilføjes til `data/watch.json` (samme domæne, `mode: "html"`).
5. **Nye udgaver (første kørsel i måneden).** For serier uden en kommende udgave: se efter næste udgave på seriens eller selskabets egen side og foreslå den som `{ "type": "new_edition", "url": ..., "quote": <citat med startdatoen>, "edition": {...} }`. Nye udgaver venter altid på godkendelse.
6. **Kontrol.** `node scripts/apply.mjs review/proposals.json`. Scriptet udgiver tomme felter med gyldigt citat, lægger ændringer og sider, der ikke må hentes automatisk, i `review/pending.json` og afviser resten. Afviste forslag rettes ikke ved at gætte; de nævnes i rapporten.
7. **Test og byg.** `node --test tests/*.test.mjs && node scripts/build.mjs`. Fejler noget, stoppes der, og intet flettes til `main`.
8. **Udgiv.** Commit på `test` med beskeden `Redaktør <dato>`, push `test`, flet `test` ind i `main` (fast-forward) og push `main`. Cloudflare bygger siden fra `main`.
9. **Godkendelser til Gus.** Er der punkter i `review/pending.json`, opdateres én Asana-opgave "[godkend] ConferenceHub-ændringer" (tildelt Gus). Den skal ligge både i ConferenceHub → "Til Gus" og i Gustav Day To Day → "Vigtigste opgave, 25 min", fordi Gus kun ser Day To Day (se AGENTS.md). Hvert punkt får id, udgave, felt, gammel og ny værdi, citat og link, og en linje "Svar (skriv ja eller nej ud for hvert id):".
10. **Supabase.** Læs én række fra `editions` med den offentlige nøgle i `site/config.js`, så projektet ikke går i dvale.
11. **Besked.** Skriv kun til Gus, når der venter godkendelser, eller noget er gået i stykker. Ellers ingen besked.

## Regler

- Opfind aldrig værdier. Kan en værdi ikke findes på konferencens egen side, forbliver feltet tomt.
- Deltagelse, grupper og brugere røres aldrig af redaktøren.
- Ingen hemmelige nøgler i repo'et, i Asana eller i beskeder.
- Sider, der forbyder robotter (fx bbm.cat), tjekkes i hånden og ender i godkendelseslisten.
