# ConferenceHub: regler for Claude og ChatGPT

## Fælles udviklingsregler

Læs altid den aktuelle [GS Tools Hub AGENTS.md](https://github.com/GSGrimoire/gs-tools-hub/blob/main/AGENTS.md) og de relevante dokumenter, den henviser til. De fælles regler vedligeholdes dér; nedenstående lokale tekniske krav, test, sikkerhed og udgivelsesregler gælder stadig. Hvis Hub ikke kan læses, behold de lokale sikkerhedsregler og udsæt handlinger, der kræver ubekræftet tilladelse. Se [Hub #4](https://github.com/GSGrimoire/gs-tools-hub/issues/4) og [Hub #69](https://github.com/GSGrimoire/gs-tools-hub/pull/69). Ingen ændring af automatisering eller udgivelsesrettigheder.

Læs [docs/PLAN.md](docs/PLAN.md) (beslutninger og status) og [docs/EDITOR.md](docs/EDITOR.md) (redaktørens procedure) før arbejde i repo'et.

## Ejer og arbejdsdeling

- Gus koder og fletter ikke selv. Claude eller ChatGPT bygger, kontrollerer og fletter.
- Branches: alt nyt lander på `test`. Efter bestået kontrol (tests, build, browsertjek) flettes `test` ind i `main` med fast-forward. `main` er kilde til produktion. Kontrollér den faktiske publicering i Cloudflare og migrationsstatus i Supabase. Se [udgivelsesstatus](docs/PLAN.md#udgivelsesstatus).
- Review: Mini (egen kontrol) til indhold, data og visning. Full review af en anden end forfatteren (ChatGPT eller en separat Claude-session) før `main` for login, rettigheder, migrationer og alt, der sletter eller viser brugerdata. Samme regler som i GS Tools Hub (`docs/REVIEW_PLAYBOOK.md` i gs-tools-hub).
- Én session ad gangen arbejder i repo'et. Skriv status i `docs/PLAN.md` og i Asana, så den næste kan fortsætte.

## Asana

- Projekt: [ConferenceHub](https://app.asana.com/1/1199525921817881/project/1220566207179174). Sektioner: "Til Gus" (1220566207179205), "Udvikling (Claude)" (1220566224074434), "Færdigt" (1220566157120743).
- **Opgaver til Gus skal ligge to steder:** i ConferenceHub → "Til Gus" OG i projektet Gustav Day To Day (1199536353162791) → sektionen "Vigtigste opgave, 25 min" (1199539447157197). Gus ser kun Day To Day. Opret opgaven i ConferenceHub og tilføj den til Day To Day med `add_projects`. Tildel Gus.
- Gus svarer ved at skrive i opgavens beskrivelse. Ret aldrig hans svar.
- Agentopgaver ligger kun i ConferenceHub → "Udvikling (Claude)".

## Grænser

- Ingen hemmelige nøgler i repo'et, Asana eller beskeder. Den publishable key i `site/config.js` er offentlig af design.
- Følg Hub-reglerne om GitHub Actions og lokale kontroller. [Redaktørens procedure](docs/EDITOR.md) beskriver overvågningen og dens planlagte kørsel. Kontrollér de faktiske udløsere for Cloudflare-bygning og Supabase-synkronisering før fletning.
