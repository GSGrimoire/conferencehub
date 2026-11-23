# E-mail-login med engangskode

Status 23. november 2026: klar som kode på `chatgpt/regionh-email-code-login`, **ikke aktiv i produktion**. Kræver uafhængig Full review af ændringer i login og en dokumenteret ende-til-ende-test.

## Formål

Behold Google-login og tilbyd e-mail-login via en sekscifret engangskode. Kollegers `@regionh.dk`-adresser skal kunne anvendes, men er ikke et krav for at logge ind, og domænet alene giver **ingen** adgang til en gruppe. Gruppemedlemskab styres fortsat af invitationslink/kode.

Brugeren angiver sin mailadresse, modtager en kode og indtaster den på samme side. En mail-klient, der følger links automatisk, kan derfor ikke bruge koden ved blot at besøge et link. Supabase sørger for kodevalidering, udløb og sessionsstyring.

## Opsætning af Supabase (kræver adgang til projektet)

1. Supabase → **Authentication → Providers → Email**: behold e-mail-udbyderen aktiv, og kontrollér e-mail-bekræftelse, kodeudløb, rate limits og indstillinger for nye brugere. Opret ikke prøvebrugere på produktionsprojektet for at kontrollere indstillingerne.
2. Vælg mailafsender: **A) pilot uden eget domæne:** brug den eksisterende `surgicalconferencehub@gmail.com` med Googles SMTP (se afsnittet nedenfor); **B) mere driftsikker løsning:** brug en dedikeret mailtjeneste såsom Resend eller Postmark med et domæne, I selv kontrollerer og verificerer. `@regionh.dk` er her **modtagerdomæne**, ikke et domæne ConferenceHub må sende på vegne af. Projektadresser under `*.supabase.co`, `github.io` og `*.workers.dev` giver ikke kontrol over et afsenderdomænes DNS.
3. Supabase → **Authentication → SMTP Settings**: konfigurér værtsnavn, port, brugernavn, adgangskode og en godkendt afsenderadresse for den valgte tjeneste. Brug **kun** Supabases sikre administrationsflade til adgangskoder. Skriv dem aldrig i GitHub, Asana eller chat.
4. Supabase → **Authentication → Email Templates → Magic Link**: erstat linkskabelonen med indholdet i `supabase/templates/magic_link_code.html`. Den væsentlige skabelonvariabel er `{{ .Token }}`, som sender en sekscifret kode i stedet for et login-link. Den samme `signInWithOtp`-funktion anvendes i begge flows; skabelonen afgør oplevelsen.
5. Bevar **Site URL** og tilladte redirect-adresser for den faktiske ConferenceHub-adresse, og kontrollér samtidig at **Google** under Social Providers er aktiv. Google-login ændres ikke af denne udvikling. Den faktiske Google-udbyderstatus er endnu **ikke** verificeret via den tilsluttede Supabase-integration.
6. Kør en afgrænset pilot med en godkendt testadresse (gerne `@regionh.dk`) og en anden ekstern adresse: modtagelse, seks cifre, udløb/fejlkode, fejlbeskeder, invitation til en gruppe og at Google-login fortsat virker. Test på et separat testmiljø, hvis muligt. Undgå ægte patientdata.
7. Gennemfør uafhængig **Full review** før `main`. Efter dokumenteret vellykket pilottest skal `emailLogin` i `site/config.js` skiftes fra `false` til `true` i en separat, kontrolleret release. En funktion, der er deaktiveret på produktionssiden, skaber ikke mulighed for at sende mail.

## Mulighed A: Gmail uden eget domæne (lille pilot)

**Forudsætning:** Kontoen `surgicalconferencehub@gmail.com` skal være under ejerens kontrol. Denne mulighed er **ikke valgt, konfigureret eller testet endnu**.

1. Slå Googles totrinsbekræftelse til for mailkontoen. Opret derefter en særskilt **appadgangskode** til Supabase under Google Account → Security → App passwords (kun hvis Google tilbyder funktionen for kontoen). Del den ikke i chat eller kildekode.
2. I Supabase → Authentication → SMTP Settings: brug server `smtp.gmail.com`, port `465` (krypteret) eller `587` (STARTTLS), brugernavn `surgicalconferencehub@gmail.com`, og appadgangskoden som adgangskode. Afsender: `ConferenceHub <surgicalconferencehub@gmail.com>`.
3. Indsæt kodeskabelonen fra `supabase/templates/magic_link_code.html`, og kontrollér e-mail-udbyder, kodeudløb og ratebegrænsninger.
4. Test først til en konto ejet af projektet, dernæst med udtrykkelig accept fra en kollega på `@regionh.dk`. Kontroller indbakke, spamfilter, engangskode og reelt login, før noget udgives.

**Begrænsninger:** Google kan begrænse automatiseret afsendelse, tilbagekalde appadgangskoder eller kræve fornyet godkendelse. Institutionens mailfilter kan afvise eller forsinke breve fra en almindelig Gmail-afsender. Brug kun dette til en afgrænset prøve, ikke som antaget stabil produktionsinfrastruktur. Mailen bør ikke indeholde patientoplysninger eller interne hospitalsdata. Sikr relevant databeskyttelsesvurdering, inden kollegaers arbejdsmailadresser behandles.

Officielle vejledninger:
- https://supabase.com/kb/troubleshooting/using-google-smtp-with-supabase-custom-smtp-ZZzU4Y
- https://support.google.com/accounts/answer/185833

## Alternativ: Microsoft-login uden e-mailafsendelse

Region Hovedstadens medarbejdere bruger Microsoft Office, herunder Outlook og Teams. Supabase understøtter login gennem Microsoft Entra ID (`provider: "azure"`). Det er principielt bedre til eksisterende arbejdskonti end engangskoder, og kræver **hverken afsenderdomæne eller SMTP**. Men en Microsoft-applikation skal registreres, og regionens opsætning kan kræve administratorgodkendelse. Undersøg dette separat, inden vi implementerer eller aktiverer en Microsoft-knap. Regionens konti/tenant, tilladelser og branding må ikke antages.

Kilder:
- https://supabase.com/docs/guides/auth/social-sign-in/auth-azure
- https://learn.microsoft.com/en-us/troubleshoot/entra/entra-id/app-integration/troubleshoot-consent-issues

## Tekniske noter

- `site/email-login.js` kalder `signInWithOtp({ email, options: { shouldCreateUser: true } })` og `verifyOtp({ email, token, type: "email" })`. Dermed kan en ny kollega oprette en konto via en verificeret mailadresse.
- Der indføres **ingen** automatisk domæneafgrænsning, ingen rolle baseret på e-maildomænet og ingen nye databasegrants. Maildomæner må ikke i sig selv give site-admin- eller gruppemedlemskab.
- Aktivér og overvåg passende e-mail-ratebegrænsning og botbeskyttelse før offentlig lancering. Supabase' indbyggede mailafsender sender som udgangspunkt kun til godkendte projektteamadresser og er ikke egnet til dette formål.
- Loginændringer kræver uafhængig Full review efter `AGENTS.md`. **Bland ikke** denne release sammen med de særskilt uafsluttede ændringer til kontosletning og databasens rettigheder.
- Lokale tests: `node --test tests/email-login.test.mjs`. Browser- og leverancetest er fortsat nødvendige.

Kilder:
- https://supabase.com/docs/guides/auth/auth-email-passwordless
- https://supabase.com/docs/guides/auth/auth-smtp
