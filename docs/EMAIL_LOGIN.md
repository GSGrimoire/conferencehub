# E-mail-login med engangskode

Status 23. november 2026: klar som kode på `chatgpt/regionh-email-code-login`, **ikke aktiv i produktion**. Kræver uafhængig Full review af ændringer i login og en dokumenteret ende-til-ende-test.

## Formål

Behold Google-login og tilbyd e-mail-login via en sekscifret engangskode. Kollegers `@regionh.dk`-adresser skal kunne anvendes, men er ikke et krav for at logge ind, og domænet alene giver **ingen** adgang til en gruppe. Gruppemedlemskab styres fortsat af invitationslink/kode.

Brugeren angiver sin mailadresse, modtager en kode og indtaster den på samme side. En mail-klient, der følger links automatisk, kan derfor ikke bruge koden ved blot at besøge et link. Supabase sørger for kodevalidering, udløb og sessionsstyring.

## Opsætning af Supabase (kræver adgang til projektet)

1. Supabase → **Authentication → Providers → Email**: behold e-mail-udbyderen aktiv, og kontrollér e-mail-bekræftelse, kodeudløb, rate limits og indstillinger for nye brugere. Opret ikke prøvebrugere på produktionsprojektet for at kontrollere indstillingerne.
2. Vælg en mailtjeneste, der understøtter Simple Mail Transfer Protocol (SMTP), eksempelvis Resend eller Postmark. Bekræft og verificér **et afsendelsesdomæne, I ejer og har lov at bruge**. `@regionh.dk` er her **modtagerdomæne**, ikke et domæne ConferenceHub må sende på vegne af. Hostnavnet `*.workers.dev` er ikke i sig selv et kontrollerbart afsendelsesdomæne.
3. Supabase → **Authentication → SMTP Settings**: konfigurér SMTP-host, port, bruger, adgangskode samt en afsenderadresse på det verificerede domæne. Opbevar altid adgangskoder **kun** i mailleverandørens/Supabases administrationsflade, aldrig i GitHub eller Asana.
4. Supabase → **Authentication → Email Templates → Magic Link**: erstat linkskabelonen med indholdet i `supabase/templates/magic_link_code.html`. Den væsentlige skabelonvariabel er `{{ .Token }}`, som sender en sekscifret kode i stedet for et login-link. Den samme `signInWithOtp`-funktion anvendes i begge flows; skabelonen afgør oplevelsen.
5. Bevar **Site URL** og tilladte redirect-adresser for den faktiske ConferenceHub-adresse, og kontrollér samtidig at **Google** under Social Providers er aktiv. Google-login ændres ikke af denne udvikling. Den faktiske Google-udbyderstatus er endnu **ikke** verificeret via den tilsluttede Supabase-integration.
6. Kør en afgrænset pilot med en godkendt testadresse (gerne `@regionh.dk`) og en anden ekstern adresse: modtagelse, seks cifre, udløb/fejlkode, fejlbeskeder, invitation til en gruppe og at Google-login fortsat virker. Test på et separat testmiljø, hvis muligt. Undgå ægte patientdata.
7. Gennemfør uafhængig **Full review** før `main`. Efter dokumenteret vellykket pilottest skal `emailLogin` i `site/config.js` skiftes fra `false` til `true` i en separat, kontrolleret release. En funktion, der er deaktiveret på produktionssiden, skaber ikke mulighed for at sende mail.

## Tekniske noter

- `site/email-login.js` kalder `signInWithOtp({ email, options: { shouldCreateUser: true } })` og `verifyOtp({ email, token, type: "email" })`. Dermed kan en ny kollega oprette en konto via en verificeret mailadresse.
- Der indføres **ingen** automatisk domæneafgrænsning, ingen rolle baseret på e-maildomænet og ingen nye databasegrants. Maildomæner må ikke i sig selv give site-admin- eller gruppemedlemskab.
- Aktivér og overvåg passende e-mail-ratebegrænsning og botbeskyttelse før offentlig lancering. Supabase' indbyggede mailafsender sender som udgangspunkt kun til godkendte projektteamadresser og er ikke egnet til dette formål.
- Loginændringer kræver uafhængig Full review efter `AGENTS.md`. **Bland ikke** denne release sammen med de særskilt uafsluttede ændringer til kontosletning og databasens rettigheder.
- Lokale tests: `node --test tests/email-login.test.mjs`. Browser- og leverancetest er fortsat nødvendige.

Kilder:
- https://supabase.com/docs/guides/auth/auth-email-passwordless
- https://supabase.com/docs/guides/auth/auth-smtp
