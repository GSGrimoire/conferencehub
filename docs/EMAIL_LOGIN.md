# E-mail-login med engangskode

> **Uafhængig Claude-review modtaget 23. november:** *REVISE PLAN*, med tre obligatoriske rettelser og to kodeforbedringer. Se [reviewrapporten](reviews/2026-11-23-pr6-claude.md) og [den oprindelige reviewbrief](CLAUDE_REVIEW_EMAIL_SIGNIN_2026-11-23.md). Rettelserne ligger kun på udviklingsbranchen; dokumenteret ny review og tests kræves før lancering.

Status 23. november 2026: koden er rettet efter Claudes første uafhængige Full review, men **er ikke godkendt til produktion og ikke slået til**. Første review gav *REVISE PLAN*. Kræver ny uafhængig kontrol af rettelserne, konfiguration af afsender og dokumenterede ende-til-ende-tests.

## Formål

Behold Google-login og tilbyd e-mail-login via en sekscifret engangskode. Kollegers `@regionh.dk`-adresser skal kunne anvendes, men er ikke et krav for at logge ind, og domænet alene giver **ingen** adgang til en gruppe. Gruppemedlemskab styres fortsat af invitationslink/kode.

Brugeren angiver sin mailadresse, modtager en kode og indtaster den på samme side. En mail-klient, der følger links automatisk, kan derfor ikke bruge koden ved blot at besøge et link. Supabase sørger for kodevalidering, udløb og sessionsstyring.

## Opsætning af Supabase (kræver adgang til projektet)

1. Inden ændringer: tag private skærmbilleder af de nuværende indstillinger for SMTP, skabeloner, mail-rategrænser og e-mail-udbyder. Gem dem sikkert som rollback-reference, ikke i repo'et. Supabase → **Authentication → Providers → Email**: behold e-mail-udbyderen aktiv, slå **Email OTP expiration til 600 sekunder (10 minutter)**, og kontroller e-mail-bekræftelse og registrering af nye brugere. Sæt **Authentication → Rate Limits → Emails per hour** konservativt til cirka **10–30 mails pr. time**, afhængigt af projektets eksisterende legitimt brug, **inden** SMTP-adgangskoden tilføjes. Disse er serverside-begrænsninger, ikke klientkontroller. Indstillingerne er endnu ikke kontrolleret live.
2. Vælg mailafsender: **A) pilot uden eget domæne:** brug den eksisterende `surgicalconferencehub@gmail.com` med Googles SMTP (se afsnittet nedenfor); **B) mere driftsikker løsning:** brug en dedikeret mailtjeneste såsom Resend eller Postmark med et domæne, I selv kontrollerer og verificerer. `@regionh.dk` er her **modtagerdomæne**, ikke et domæne ConferenceHub må sende på vegne af. Projektadresser under `*.supabase.co`, `github.io` og `*.workers.dev` giver ikke kontrol over et afsenderdomænes DNS.
3. Først efter rategrænse og kodeudløb er sat: Supabase → **Authentication → SMTP Settings**: konfigurér værtsnavn, port, brugernavn, adgangskode og en godkendt afsenderadresse for den valgte tjeneste. Brug **kun** Supabases sikre administrationsflade til adgangskoder. Skriv dem aldrig i GitHub, Asana eller chat. Når SMTP er aktiv, kan API-kald fra andre end den synlige webformular stadig udløse udsendelse.
4. Supabase → **Authentication → Email Templates**: installér **to** kodeskabeloner: **Confirm signup** fra `supabase/templates/confirm_signup_code.html` til nye kolleger og **Magic Link** fra `supabase/templates/magic_link_code.html` til eksisterende konti. Begge skal indeholde `{{ .Token }}` og teksten om, at koden er gyldig i **10 minutter**. Uden Confirm signup-skabelonen kan nye brugere modtage et login-link frem for en kode. Kontrollér at Supabase accepterer skabelonerne med den valgte egen SMTP-tjeneste.
5. Bevar **Site URL** og tilladte redirect-adresser for den faktiske ConferenceHub-adresse, og kontrollér samtidig at **Google** under Social Providers er aktiv. Google-login ændres ikke af denne udvikling. Den faktiske Google-udbyderstatus er endnu **ikke** verificeret via den tilsluttede Supabase-integration.
6. Før produktionsaktivering: test fra et lokalt eller andet isoleret frontend-miljø med `emailLogin: true`, mens live-frontend forbliver `false`. Verificér separat (a) **helt ny adresse** modtager **kode, ikke link**, (b) eksisterende konto får kode, (c) en samtykkende `@regionh.dk`-kollega får mailen inden for cirka to minutter uden karantæne, (d) forkert og udløbet kode afvises på dansk, (e) ny kode kan sendes efter 60 sekunder, (f) Google-login virker fra start til slut, (g) `?join=` fungerer med kodelogin og (h) uvedkommende kan ikke se gruppeoplysninger. Test kun godkendte adresser og ikke kliniske data.
7. Gennemfør **ny uafhængig Full review** af rettelser og testresultater før deployment. Efter alle beståede kontrolpunkter kan `emailLogin` i `site/config.js` ændres fra `false` til `true` ved særskilt release. **Vigtig rettelse fra review: `emailLogin: false` skjuler kun formularen; det afbryder ikke Supabases offentligt tilgængelige mail-login-endpoint.** Ved misbrug: (1) fjern/deaktivér **custom SMTP** i Supabase, så den indbyggede afsender med projektteam-begrænsning bruges, (2) tilbagekald Gmail-appadgangskoden. Gendan derefter de tidligere indstillinger og templates fra det private rollback-grundlag, efter konsekvenser for alle legitime brugere er vurderet. **Deaktivér ikke Email-udbyderen som generel rollback**, da det kan låse eksisterende e-mailbrugere ude. Stop ikke med at overvåge misbrug, selv om knappen er skjult.

## Mulighed A: Gmail uden eget domæne (lille pilot)

**Forudsætning:** Kontoen `surgicalconferencehub@gmail.com` skal være under ejerens kontrol. Denne mulighed er **ikke valgt, konfigureret eller testet endnu**.

1. Slå Googles totrinsbekræftelse til for mailkontoen. Opret derefter en særskilt **appadgangskode** til Supabase under Google Account → Security → App passwords (kun hvis Google tilbyder funktionen for kontoen). Del den ikke i chat eller kildekode.
2. I Supabase → Authentication → SMTP Settings: brug server `smtp.gmail.com`, port `465` (krypteret) eller `587` (STARTTLS), brugernavn `surgicalconferencehub@gmail.com`, og appadgangskoden som adgangskode. Afsender: `ConferenceHub <surgicalconferencehub@gmail.com>`.
3. Inden SMTP-adgangskoden indtastes: gem den nuværende opsætning privat, sæt **Emails per hour** konservativt til **10–30**, og **Email OTP expiration** til **600 sekunder**. Derefter indsættes **begge** kodeskabeloner: `supabase/templates/confirm_signup_code.html` og `supabase/templates/magic_link_code.html`. Skabelonændringerne er globale for projektets login.
4. Test først til en konto ejet af projektet, dernæst med udtrykkelig accept fra en kollega på `@regionh.dk`. Kontroller indbakke, spamfilter, engangskode og reelt login, før noget udgives.

**Supabase Free-plan (opdatering juni 2026):** Nye gratis projekter kan ikke redigere auth-mailskabeloner med Supabases indbyggede afsender. Egen SMTP (her Gmail) gør det muligt at tilpasse skabelonen, så `{{ .Token }}` kan bruges i stedet for et login-link. Konfigurér og test SMTP **før** du forsøger at aktivere kodeskabelonen. Kilde: https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier.

**Begrænsninger:** Google kan begrænse automatiseret afsendelse, tilbagekalde appadgangskoder eller kræve fornyet godkendelse. Institutionens mailfilter kan afvise eller forsinke breve fra en almindelig Gmail-afsender. Brug kun dette til en afgrænset prøve, ikke som antaget stabil produktionsinfrastruktur. Mailen bør ikke indeholde patientoplysninger eller interne hospitalsdata. Sikr relevant databeskyttelsesvurdering, inden kollegaers arbejdsmailadresser behandles.

Officielle vejledninger:
- https://supabase.com/kb/troubleshooting/using-google-smtp-with-supabase-custom-smtp-ZZzU4Y
- https://support.google.com/accounts/answer/185833

## Alternativ: Microsoft-login uden e-mailafsendelse

Region Hovedstadens medarbejdere bruger Microsoft Office, herunder Outlook og Teams. Supabase understøtter login gennem Microsoft Entra ID (`provider: "azure"`). Det er principielt bedre til eksisterende arbejdskonti end engangskoder, og kræver **hverken afsenderdomæne eller SMTP**. Men en Microsoft-applikation skal registreres, og regionens opsætning kan kræve administratorgodkendelse. Undersøg dette separat, inden vi implementerer eller aktiverer en Microsoft-knap. Regionens konti/tenant, tilladelser og branding må ikke antages.

Kilder:
- https://supabase.com/docs/guides/auth/social-sign-in/auth-azure
- https://learn.microsoft.com/en-us/troubleshoot/entra/entra-id/app-integration/troubleshoot-consent-issues

## Vigtig tværgående risiko

Supabase Auth-konfiguration (afsender, SMTP-tjeneste og Magic Link-email-skabelon) gælder for **hele Supabase-projektet**, ikke kun ConferenceHubs frontend. Efterfølgende gennemgang 23. november af den kildegendannede GS QR Bar Site-version 6 (`GSGrimoire/gs-qr-bar`, branch `recovery/existing-site-source-20261109`, `docs/SOURCE_RECOVERY.md` og `docs/ARCHITECTURE.md`) viser **ChatGPT-hostet login og Cloudflare D1**, ikke Supabase Auth. Det taler imod at den dokumenterede QR Bar-version deler ConferenceHubs `auth.users`, men runtime-konfigurationen og eventuelle senere ændringer er ikke uafhængigt bekræftet. Afklar eventuelle øvrige apps på samme Supabase-projekt, før den globale e-mailskabelon ændres, og gennemfør uafhængig Full review. Ingen globale Auth-ændringer er udført.

## Tekniske noter

- `site/email-login.js` kalder `signInWithOtp({ email, options: { shouldCreateUser: true } })` og `verifyOtp({ email, token, type: "email" })`. Dermed kan en ny kollega oprette en konto via en verificeret mailadresse. Koden håndterer genåbning efter login/logout, dansk fejltekst og visning/nedtælling for genafsendelse efter 60 sekunder. Den lokale nedtælling er **ikke** en erstatning for Supabases serverbegrænsninger.
- Der indføres **ingen** automatisk domæneafgrænsning, ingen rolle baseret på e-maildomænet og ingen nye databasegrants. Maildomæner må ikke i sig selv give site-admin- eller gruppemedlemskab.
- Aktivér og overvåg passende e-mail-ratebegrænsning og botbeskyttelse før offentlig lancering. Supabase' indbyggede mailafsender sender som udgangspunkt kun til godkendte projektteamadresser og er ikke egnet til dette formål.
- Loginændringer kræver uafhængig Full review efter `AGENTS.md`. **Bland ikke** denne release sammen med de særskilt uafsluttede ændringer til kontosletning og databasens rettigheder.
- Lokale tests: `node --test tests/email-login.test.mjs`. Browser-, levering- og integrationstests er fortsat nødvendige. Claudes indledende Full review (4cb9063) rapporterede 23/23 tests og bestået build **før** disse rettelser; dette er ikke bevis for en godkendt rettet version. Se `docs/reviews/2026-11-23-pr6-claude.md`.

Kilder:
- https://supabase.com/docs/guides/auth/auth-email-passwordless
- https://supabase.com/docs/guides/auth/auth-smtp
