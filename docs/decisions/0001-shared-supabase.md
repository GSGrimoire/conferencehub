# Beslutning 0001: fælles Supabase foreløbigt

**Dato:** 16. november 2026  
**Status:** Accepteret produktbeslutning, teknisk projektfællesskab endnu ikke verificeret  
**Produkter:** SurgicalConferenceHub (ConferenceHub) og GS QR Bar  
**Beslutningsejer:** Produktejer  
**Implementeringsbranch:** `test` (ingen automatisk godkendelse til `main`)

## Beslutning

Behold Supabase som backend for begge værktøjer foreløbigt. Flyt ikke GS QR Bar og opret ikke et nyt Supabase-projekt til SurgicalConferenceHub alene af hensyn til en hypotetisk senere vækst. Fortsæt gratis drift, så længe kapacitet, driftssikkerhed, informationssikkerhed og gældende vilkår tillader det. Behold den eksisterende Supabase-GitHub-integration/adgang til GS QR Bar; foretag ikke ændringer i dens produktion uden selvstændig gennemgang.

Produkterne **forventes i denne beslutning at dele et Supabase-brugerregister**, men det er ikke dokumenteret ved verificerede projektreferencer eller adgang til GS QR Bars aktive Supabase-konfiguration. At to produkter anvender Supabase eller samme Supabase-ejerkonto betyder **ikke** automatisk, at de bruger samme projekt og `auth.users`. Dette skal dokumenteres inden lancering af kontosletning.

## Begrundelse

- Begge værktøjer har forventeligt få brugere i pilotfasen, og det er usikkert, om nogen af produkterne får omsætning.
- Gratis drift og mindst mulig administration vægtes højere end tidlig infrastrukturopsplitning.
- GS QR Bar eksisterede først. Ved en senere opsplitning er SurgicalConferenceHub den foretrukne kandidat til at blive flyttet, men migreringsrækkefølge skal revurderes ud fra faktisk datamodel.
- Selv ved meget få brugere er fælles login en tværgående konsekvens for en brugers ret til at slette sin konto. Lavt brugerantal er ikke i sig selv en sikkerhedsforanstaltning.

## Konsekvens ved 'Slet min konto'

SurgicalConferenceHubs `public.delete_my_account()` sletter `auth.users`-rækken identificeret ved `auth.uid()`, ikke kun en app-specifik profil. Hvis begge værktøjer anvender samme Supabase-projekt og den samme brugeridentitet, mister brugeren dermed også sit login til GS QR Bar.

Derfor skal **både knappen/sektionen og den endelige bekræftelsesdialog** give en tydelig advarsel om påvirkning af GS QR Bar. Brugeren skal aktivt bekræfte, før sletning udføres. Vær præcis: sletning af fælles login indebærer ikke nødvendigvis, at QR-links, statistikker eller andre GS QR Bar-data slettes. Afhængigt af QR Bars fremmednøgler og triggers kan sletningen også mislykkes eller have yderligere konsekvenser. Dette er ikke testet i det aktive GS QR Bar-miljø.

Indtil de tekniske forhold er verificeret, må grænsefladen ikke love, at **alle** data fra begge produkter slettes, og kontosletning må ikke merges til `main` uden godkendt uafhængig sikkerhedsreview.

## Afgrænsning af Supabase-GitHub-adgang

Supabases GitHub-integrations adgang til et repository er **ikke det samme** som databaseadgang eller delt brugerregister. Bevar den eksisterende adgang til `gs-qr-bar` som besluttet, men kontrollér særskilt rettigheder, installerede integrationer og hvilken deployment der faktisk anvender dem. Ændr ikke globale databaseprivilegier eller andre værktøjers `auth.users`-/dataskema på denne beslutnings baggrund.

## Før deploy af kontosletning

1. Bekræft begge applikationers faktiske Supabase-projektreference og om de deler `auth.users`; dokumentér det uden at gemme hemmelige nøgler.
2. Kortlæg GS QR Bars afhængigheder af brugeridentiteten, fremmednøgler, triggers og dataopbevaring. Det private GS QR Bar-repository er ifølge egen README endnu ikke genskabt fra live-applikationen.
3. Test `delete_my_account()` med en ægte, isoleret Supabase-installation under korrekt funktionsejer. Bekræft kun egen `auth.uid()`, at `anon` afvises, at sletning og kaskader lykkes, og at eventuelle GS QR Bar-afhængigheder er kendte.
4. Gennemgå advarsel, tekst om konsekvenser, privatlivspolitik og fejlhåndtering med mindst ét browserflow.
5. Få separat full review før sammenlægning til `main`. Ingen produktionsdata eller eksisterende QR-links må bruges som testmateriale.

## Hvornår beslutningen genovervejes

Revurder opdeling ved flere faktiske brugere, betalingsbehov, skærpede adgangskrav, krav om særskilt sletning af konti, selvstændig drift, databeskyttelseskrav eller andre væsentlige risici. Prisopgradering og opdeling er **to forskellige beslutninger**. En gratis løsning kan godt have to adskilte projekter; omvendt afhjælper en betalt plan ikke automatisk risikoen ved fælles `auth.users`.

## Sporbarhed

- GitHub review: https://github.com/GSGrimoire/conferencehub/issues/1
- ConferenceHub Asana: https://app.asana.com/1/1199525921817881/project/1220566207179174
- Tidligere Asana-afklaring om Supabase-GitHub-adgang: https://app.asana.com/1/1199525921817881/project/1199536353162791/task/1220566157074913
- GS QR Bar-kildestatus: https://github.com/GSGrimoire/gs-qr-bar/blob/main/README.md
