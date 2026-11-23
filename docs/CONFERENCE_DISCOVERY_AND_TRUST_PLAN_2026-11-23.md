# ConferenceHub: discovery, organizer submissions and trust design

Status: **proposal for independent review**, 23 November 2026. Documentation only. No schema, user accounts, authentication, permissions, publishing controls or production data have been changed by this document.

## Product objective

Build a useful, international discovery service for verified medical and surgical conferences. A clinician should be able to see conferences relevant to selected subspecialties, keep track of newly announced meetings and changed deadlines, save/follow events, and find the organizer's authentic registration page. Individuals and organizers may propose additions without obtaining publishing privileges.

The existing deployment at https://conferencehub.goofyspook.workers.dev is live according to the owner. Its current scope is plastic and reconstructive surgery, not the whole of medicine. Source records currently cover 18 conference series and 21 editions. Expanding specialties before the verification workflow scales would create a large, unreliable directory.

## Existing capabilities and important limitations

Evidence from main branch:
- Public site has a timeline, dated conference listing, keyword search, hard-coded topic filters, visible citations for selected date/venue fields, abstract/registration deadlines and a calendar-file download for an edition. It does not yet offer personalized recommendations or automatic change notifications.
- Authenticated visitors can send a conference suggestion (name, link, note) through site/auth.js to public.suggestions with pending status. Suggestions **do not auto-publish**. There is currently no separate organizer submission flow and no live admin approval interface.
- The reviewer pipeline scripts/apply.mjs takes proposed source-backed changes, requires a quote that can be found on a page on a known official host, and routes **new editions** plus changed existing values to review/pending.json. Filling empty fields with source evidence can be automatic. This is helpful for trusted existing conference records, but **not enough to establish that a new organizer or new event is legitimate**: a fraudster controls the text on their own fraudulent domain.
- The main security migration enables row-level security (RLS) on public tables, but the existing permission model requires further review before inviting many users. Issue #3 concerns potentially exposed profiles.calendar_token; issue #4 concerns quotas for group/suggestion writes. Existing privileged functions are under separate security review.
- Google sign-in presently produces a live owner-reported Supabase error: "Unsupported provider: provider is not enabled". The frontend button exists, but the Google provider requires owner-only configuration in Supabase. The separate email-code login pull request #6 is a draft undergoing independent review; it must not be merged as part of this project.

## Design principle: admission to the catalog is editorial, not self-service

**Absolutely no direct path from any user, event organizer, external scraper or artificial intelligence proposal to a public conference listing without trusted review.** A submission is evidence for a curator to investigate, not a source of publication authority.

There are two independent questions:

1. **Is this person entitled to represent the organizer?** A matching email address is evidence of mailbox access, not proof of organizer authority.
2. **Is this conference a real event, and are its dates, program, location, costs and accreditation claims corroborated?** A well-made website alone is not proof.

An organizer verification badge, if introduced, must not imply that its scientific quality, educational credits, patient-care claims, pricing or registration safety have been endorsed.

## Submission and publishing workflow

### 1. Entry and staging

- Clinician suggestion: reuse the existing authenticated suggestion form and pending database row; optionally expand fields later to include conference location, expected dates and the reason for clinical relevance.
- Organizer request: create a distinct **Submit an event / Claim an event** workflow with organizer name, contact role, official event website, society/organization, conference dates, location, category, pricing or registration URL, and declared conflicts. The form must explain that submission is not publication.
- Keep **all** submitted text, links and attachments private to the submitter and authorized reviewers. No event pages or search-engine indexing for pending items. Enforce server-side input size limits, per-account quotas, bot protection and deduplication. Do not accept untrusted file uploads in version one.
- Separate organizer identity verification from event verification. Never let someone edit the public catalog solely because they claimed a conference title.

### 2. Independent legitimacy checks

- Determine the organizer's official identity from an established professional society, university, teaching hospital, recognized scientific organizer or independently located institutional listing, rather than accepting the submitted domain as the starting authority.
- From that independent source, corroborate the specific edition, dates, venue and authoritative conference/registration site. The strongest evidence is an official society/university calendar linking directly to the event or a link from the organization's long-established domain.
- If someone claims organizer status, verify control of the organizer's **independently established** official domain or contact channel. Contact via an address obtained independently from that organization, not only the contact in the submission. For a new independent organizer, demand stronger manual scrutiny or an alternate corroborating source. An email at @gmail.com is not itself disqualifying but not sufficient proof.
- Check for impersonation, look-alike domains, suspect redirects, inconsistent contact details, unverifiable addresses, unrealistic accreditation claims, payment instructions to unrelated parties and unusually urgent demands for money. These are risk indicators, not independent proof of fraud.
- Check for duplicate conference series, changed domains, cancellation notices and superseded editions. Never overwrite a previously verified payment or registration URL without fresh editorial review.
- Keep a dated evidence record for each substantive field: independent source URL, exact quote, date checked, responsible reviewer, and decision. Log material overrides and maintain a correction history.

### 3. Review decision and publication

- Submission states: **submitted -> needs_evidence -> under_review -> approved or rejected**. Only an authorized curator can move an approved item into the authoritative data catalog. High-risk decisions (new organizer, unfamiliar payment site, accreditation claims, changed registration destination) require a second reviewer where feasible.
- Publication status is **verified listing**, **needs recheck**, **cancelled**, or **withdrawn**. "Verified" means that the cited facts were checked on a recorded date, not that the event is medically or financially endorsed.
- Keep the production website reading only approved catalog records through the existing reviewed data pipeline. A direct authenticated submission must not insert or update public.series, public.editions or public.evidence.
- Every published entry links to the primary official source, shows **last verified** date and clearly distinguishes unknown deadlines from confirmed ones.
- The organizer can propose edits to their own event, but those edits are **staged for review**. No direct power to change registration URLs, dates, organizer identity, pricing or accreditation.

### 4. Corrections, community reporting and emergency response

- Add **Report incorrect or suspicious conference** to each public listing. Reports are private, rate-limited, and routed to the editor.
- When a credible impersonation or fraudulent payment page is reported, hide or flag the listing pending a rapid check. Preserve evidence internally, notify affected users if relevant and replace links only after independent verification.
- Track cancelled events, reschedules, broken links and post-publication corrections. Display a visible warning rather than silently deleting a record that users may have saved.
- Review older unverified listings on a schedule. Give greater scrutiny to new and recently changed registration destinations, and to deadlines within six weeks.

## Personalized usefulness roadmap

**Phase 1: make the existing directory trustworthy and navigable**

- Correct Google sign-in first; verify current security issues (calendar token, privileged function grants, write quotas) before inviting a large audience.
- Improve event data completeness, evidence display, cancellation state and freshness. Add a clear distinction between "not yet announced", "not checked" and "not applicable" for deadlines instead of using a single blank state.
- Use a durable hierarchical topic taxonomy: medical specialty -> subspecialty -> topic. Let a conference have multiple topic tags; avoid a single top-level "topic" string deciding relevance.
- Preserve the initial plastic/reconstructive surgery pilot. Expand into a second specialty only after editor capacity and validation standards are demonstrated.

**Phase 2: user interests and useful updates**

- Let each user follow topics, conference series and regions, plus choose whether to receive alerts. The database already has a follows table for conference series but no complete end-user follow-and-alert experience.
- Give each user "Relevant to me", "Upcoming deadlines", "Newly announced", and "Recently changed" views with understandable criteria. Start with transparent rules, not opaque personalization or paid ranking.
- For each change, record source, time verified and whether the deadline changed, the event was cancelled or registration opened. Notifications are opt-in and can be unsubscribed from. They must not imply conference information is guaranteed accurate.
- Offer calendar subscriptions only after the existing calendar_token exposure concern is resolved; a shareable calendar feed URL is a bearer credential and must be protected.

**Phase 3: organizer workflow**

- Add organizer submission and organizer-identity claims with independent review, admin queue, immutable audit history, corrections and report-abuse process. This is distinct from public event publishing.
- Do not collect conference registration payments, medical history, patient data or proof of professional identity unless a separate privacy/security review demonstrates necessity.

**Phase 4: wider global scope**

- Expand into additional surgical and medical specialties as editorial resources permit. Track source languages and region/timezone differences, organizer claims, country/city and specialty-taxonomy mappings.
- Measure **verified relevant upcoming events, fraction with confirmed deadlines, age of source checks, correction turnaround and reports of suspicious links**. Raw event count and login count are not suitable quality goals on their own.

## Technical security requirements before external submissions scale

- **Roles:** ordinary user, organizer-claim applicant, verified organizer, curator, site administrator. These are not equivalent roles. Organizer verification must never imply curator or site-administrator rights.
- **Database policy:** enforce authorization at database level, not merely by hiding buttons; keep pending submissions and contact details private. Use the minimum effective database grants, explicit ownership predicates and audit logs. Avoid overly privileged database functions reachable anonymously.
- **Quotas and anti-spam:** bound submissions per account and time window with atomic database-side limits. Use bot protection on unauthenticated public endpoints; never rely only on client-side cooldowns.
- **Link security:** treat all submitted addresses as hostile. On the client, only render vetted HTTPS hyperlinks with safe attribute escaping. If the server fetches a URL, prevent server-side request forgery: deny internal networks, loopback, link-local/metadata hosts, non-HTTPS schemes and redirects to prohibited targets; cap response size, time, redirects and content types. Do not assume a valid URI is a safe website.
- **Data integrity:** provenance, duplicate detection, idempotent publishing, immutable decision trail and selective re-verification for changed registration/payment links. Separate "official organizer identity" from "conference confirmed" and "organizer endorsement".
- **Transparency:** no sponsored results masquerading as independent verified recommendations; any paid placement, if ever introduced, must be clearly labeled and must never bypass review.
- **Privacy:** organizer contact details are not public unless explicitly intended; organizer accounts must not gain access to attendee identities, group membership or private interest preferences. The selection "Alle" for attendance may expose activity to any signed-in user: communicate this clearly.
- **Full review:** every authentication, role, row-level security, database migration or publication-path change needs independent Full review and synthetic multi-user tests. Do not bundle these changes with pending account deletion or email login work.

## Priority and action ownership

1. **Immediate operational blocker:** Google provider is disabled in live Supabase, evidenced by actual login error. The existing owner task is [Enable Google login](https://app.asana.com/0/0/1220566224358494), not a new implementation task. Owner must check current provider settings and the existing Google Cloud credentials. No source change can enable it on its own.
2. **Before inviting colleagues:** address [potential calendar token exposure](https://github.com/GSGrimoire/conferencehub/issues/3) and [privileged function grant review](https://app.asana.com/0/0/1220777448112917), with independent review.
3. **Before allowing broad submissions:** resolve [group and suggestion write quotas](https://github.com/GSGrimoire/conferencehub/issues/4).
4. **Editorial workflow:** extend the existing Asana [Admin-side and approval queue task](https://app.asana.com/0/0/1220566206830987) to add report abuse, organizer claims, verification evidence and audit history. The existing editor [task](https://app.asana.com/0/0/1220566156943451) continues to own source checking and publication.
5. **Email sign-in:** [draft pull request #6](https://github.com/GSGrimoire/conferencehub/pull/6) stays in independent review. The older Claude review visible on GitHub requires bot protection for open mail signups; do not call the draft approved or deploy as part of this work. Preview builds have reported failures that need explanation.

## Suggested independent review questions

- Is the proposed verification standard strong enough for previously unknown organizers, or does it create false trust badges?
- Should the pilot require two independent sources for a new conference, or one known authoritative society listing?
- Can we use the current pending suggestions table and JSON editor queue without creating a divergent second source of truth?
- What is the smallest moderator interface that prevents unapproved publishing, unsafe links and impersonation?
- How do we revoke a falsely claimed organizer account, take down a listing rapidly and audit the change?
- What data may an organizer see about submitters, attendees and followers? Default should be none.
- Can rate limiting, duplicate detection and dangerous URL handling be tested with synthetic malicious payloads?
- Which specialty expansion is supportable by the existing editor, and what standards determine when it is ready?

**Boundary:** This is a proposed development and security plan, not an authorization to implement, migrate or deploy changes to authentication or the production database.
