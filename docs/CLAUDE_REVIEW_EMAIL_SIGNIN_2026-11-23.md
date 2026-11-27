# ConferenceHub: independent Claude review brief for colleague sign-in

**Prepared:** 23 November 2026  
**Status:** Proposal and unmerged implementation. Nothing in this brief authorizes production configuration changes, migration, deployment, sending test email to unconsenting recipients, or a merge to main.  
**Review type:** Independent Full review, as required by AGENTS.md for authentication and access-control changes.  
**Decision requested from Claude:** APPROVE PLAN / REVISE PLAN / DO NOT PROCEED, with reasoning, blockers, test evidence, and a proposed safe release sequence.

## 1. Owner's requirements and constraints

- Preserve the existing **Continue with Google** option. The owner believes it has already been enabled; this is **not independently confirmed** by a successful live sign-in. The earlier Asana note from 16 November reported "provider is not enabled", so check its **current** status rather than repeating that old finding as current.
- Offer **work-email sign-in** to colleagues, particularly users with **@regionh.dk** email addresses, without requiring them to create Google accounts.
- No domain controlled by the owner, other than hosted service addresses at Supabase and GitHub. Hosted addresses are not an owned sender domain.
- The owner has previously supplied **surgicalconferencehub@gmail.com** as the ConferenceHub contact account, potentially usable as a sender. The owner has **not** provided credentials or confirmed that an application password is available.
- Pilot audience: plastic and reconstructive surgery colleagues at Herlev Hospital. Use no patient information in sign-in emails, code examples, tests, or logs.
- An @regionh.dk address is a **supported recipient address**, not a verified sender domain or proof of employment or access entitlement. Do not restrict all sign-ins to that domain unless the owner later chooses to. Group access must still require an invitation/membership check.
- Keep the pilot low-cost, but not at the expense of safe authentication and reliable delivery.

## 2. Repository and status: fact versus assumption

- Repo: https://github.com/GSGrimoire/conferencehub
- Deployed site: https://conferencehub.goofyspook.workers.dev
- Supabase project: ConferenceHub, ref **vczueyxesistyzwyotyv**; live database was **ACTIVE_HEALTHY** on 23 November.
- A successful **read-only SQL** query of public.editions occurred on 23 November; counts were 18 series, 21 editions and 13 evidence records. This is real database activity but is not a guarantee against free-tier inactivity pausing.
- Source of truth for public conference data is data/*.json, copied to Supabase. This authentication task must not modify conference data or trigger unrelated migrations.
- Default release route according to AGENTS.md: feature branch -> test -> independent Full review -> main after checks. Main is deployed; the test branch includes separate unresolved account-deletion work, so **do not merge test wholesale into main as part of this review**.
- The prior read-only activity-check work is in separate pull request #5: https://github.com/GSGrimoire/conferencehub/pull/5. Do not conflate it with authentication.
- The project previously reported GitHub Actions minutes exhausted until 1 December 2026. Verify actual availability before relying on hosted checks.

**Implementation prepared but not enabled:**
- Branch: https://github.com/GSGrimoire/conferencehub/tree/chatgpt/regionh-email-code-login
- Detailed setup: docs/EMAIL_LOGIN.md.
- Code: site/email-login.js, site/auth.js, site/index.html.
- Email template: supabase/templates/magic_link_code.html.
- Isolated tests: tests/email-login.test.mjs.
- The existing **site/config.js** retains **emailLogin: false**. Thus the current production website does not offer email login.
- The code uses Supabase signInWithOtp to send a one-time email code and verifyOtp with type "email" to authenticate. It is intended to retain Google's OAuth flow unchanged.
- Prior development reported six isolated local tests passing and static source-integration checks. **Claude should rerun** the tests and independently inspect the code and browser behavior. No real email delivery, real Microsoft login, real Google login or end-to-end browser validation is claimed.

## 3. Viable approaches and trade-offs

### Option A: existing Gmail address as Supabase custom email sender

**Proposed narrow-pilot choice**, subject to the reviewer finding it acceptable and the owner successfully configuring and testing it.

- Sender: surgicalconferencehub@gmail.com (only if the owner controls the account).
- Enable Google two-step verification and, if available for that account, create a dedicated **app password** for Supabase.
- Enter settings **only in Supabase's private Authentication / SMTP Settings administration interface**:
  - Host: smtp.gmail.com
  - Port: 465 (encrypted) or 587 (STARTTLS), whichever Supabase supports and a real test confirms.
  - User and sender email: surgicalconferencehub@gmail.com
  - Credential: application password, never a normal password copied to chat or GitHub.
- In the Supabase Authentication Magic Link email template, supply **the six-digit token** using the variable **{{ .Token }}**; proposed template is tracked in the branch. signInWithOtp sends a Magic Link by default unless the relevant template is configured to send a code. Confirm the correct current template behavior and any free-tier limitations against current Supabase documentation.
- Send a test message to an address controlled by the project, then to one consenting colleague's @regionh.dk address. Verify arrival, delay, spam filtering, code validity, failures, expiration and login.
- Risks: personal Gmail is not a service-level delivery commitment; app passwords might be unavailable or revoked; automated email limits, account abuse, work-mail filtering and sending identity are potential blockers. Confirm the institutional data protection and mail-use policy before inviting colleagues.

**Do not call Gmail a guaranteed production-grade provider.** Do not attempt to send as @regionh.dk without authorization.

### Option B: Microsoft Entra work-account sign-in

Potentially better **long-term** for staff who already use regional Microsoft workplace identities.

- Supabase supports Microsoft/Azure OAuth authentication, but availability and Microsoft tenant permissions for Region Hovedstaden are **not verified**.
- The regional administrators may need to register/approve an app and user consent; investigate actual requirements with appropriate authorization.
- This path does **not need an outgoing login email service** for the Microsoft sign-in itself, but is a different integration, not something already implemented in the branch.
- Claude should assess the security/privacy, account-linking and compatibility implications of adding Microsoft sign-in alongside Google, and whether pursuing it before Gmail is preferable.

### Option C: dedicated transactional email sender plus owned domain

Best conventional delivery architecture for a larger production rollout, but requires acquiring/control of a domain and setting sender verification records. Resend or Postmark are possibilities. Not necessary just to evaluate a small pilot.

**Recommended provisional sequencing:** Try Option A only for an explicitly limited pilot if organization policy and deliverability permit. Investigate Option B in parallel as a possible better institutional sign-in model. Use Option C if email-based login needs long-term operational assurance.

## 4. Security and cross-application findings

1. **Project-wide effect:** Supabase's outgoing mail configuration and authentication email templates apply to the entire **Supabase project**, not merely to one ConferenceHub page. Verify other consumers before changing them and prepare rollback for the sender and template.
2. **GS QR Bar correction:** The recovered deployed Site version 6 source in GSGrimoire/gs-qr-bar (branch recovery/existing-site-source-20261109, docs/SOURCE_RECOVERY.md, docs/ARCHITECTURE.md, app/chatgpt-auth.ts) shows **hosted ChatGPT authentication and Cloudflare D1**, **not Supabase Auth**. This source does **not** support the earlier assumption of shared auth.users. The live runtime and any newer version remain unverified, and other apps may still share ConferenceHub's project. Do not claim shared login or safety without checking.
3. **Database security work is separate:** The Supabase Security Advisor found six public-schema SECURITY DEFINER functions with effective EXECUTE permissions for anonymous and authenticated roles; an independent SQL privilege check confirmed the grants. There are unresolved issues around calendar_token exposure and write quotas. These are existing concerns, not reasons to silently introduce unrelated schema changes in an email-login pull request. See ConferenceHub security task in Asana and GitHub issues #3 and #4.
4. **Open registration:** The current email implementation uses shouldCreateUser: true, permitting first-time users with any valid email address to create an account. Claude must verify whether this is intended, and that only explicitly invited members can see/join group-specific content. Email domain or successful email verification alone must grant no group or administrator privileges.
5. **Abuse protection:** Evaluate rate limits, email bombardment, repeated verification attempts, user enumeration, error messages, code expiry, bot mitigation, request flooding and abuse visibility. No service credentials or secret keys may enter GitHub, Asana, logs or chat.
6. **Credential safety:** Use the Supabase UI for application passwords; never paste credentials into the reviewer brief. Consider recovery from a lost Gmail account or revoked application password.
7. **Institutional data protection:** Colleagues' work email addresses constitute personal data. Clarify what the institution permits for external authentication and providers before a wider rollout. Do not collect patient or clinical information.
8. **Account deletion scope:** The test branch contains separate unresolved deletion/identity work. The owner chose not to release account deletion yet. Keep this excluded and do not introduce it by merging all of test into main.

## 5. Exact questions for Claude's independent Full review

Please independently review the **plan and code**, not only the prose:

1. Is Option A (Gmail with custom outgoing email service through Supabase) actually available and appropriate for this hosted project under **current** Supabase and Google requirements? Verify sender authentication, port/TLS setting, app-password availability, free-tier email-template constraints, rate limits, code expiry, and any recipient restrictions.
2. Is passwordless code login preferable to Magic Links for an institutional mailbox where security software may pre-open links? Are there hidden consequences to using the shared Magic Link template for one-time codes?
3. Does site/email-login.js handle code input, reset/resend, duplicate submissions, failures, empty/invalid entries, sign-in success, session changes, accessibility and recovery safely? Can the application get stuck on a misleading state?
4. Do site/auth.js and site/index.html integrate the optional flow correctly? Is Google sign-in truly preserved, including redirect behavior and existing-user session loading? Verify the **current** Google provider setting independently, not just the HTML button.
5. Will allowing arbitrary email domains with shouldCreateUser: true lead to unwanted access, spam, user enumeration, or privacy leakage? Confirm group isolation and role restrictions against the live policies and existing privileges without changing them.
6. Could the global SMTP/template change affect a different app or an existing user login path? Investigate GS QR Bar as needed; distinguish confirmed source from unverified runtime.
7. Does Microsoft Entra login for Region Hovedstaden appear realistically available without administrator involvement? If not, state who must approve it and which configuration is needed, without assuming the workplace permits it.
8. Is the release sequence safe and reversible? State the rollback for both frontend (emailLogin: false) **and** global Supabase email settings, and enumerate exact verification gates.
9. Check compatibility with unresolved privileged-function warnings and separate account deletion work. **Do not deploy unrelated migrations** or start a broad auth refactor as part of this request.

## 6. Required verification plan

- Read AGENTS.md and docs/PLAN.md, then examine the current diff on this feature branch relative to test.
- Re-run the project's relevant local tests including: node --test tests/email-login.test.mjs. Run any applicable build, browser and security checks without relying on the exhausted GitHub Actions quota.
- Test with mocks only until a suitable isolated test environment or explicit consent to use approved email addresses exists.
- When live setup is authorized: establish baseline/rollback notes for the present Supabase SMTP settings and Magic Link template; check all known consumers; configure sender and email template in administrative UI; send only approved test messages; validate Gmail and @regionh.dk delivery and code verification; verify Google login remains functional; verify non-members cannot see private group data.
- Re-run Supabase Security and Health Advisors after any permitted database/auth changes, document findings, and **do not dismiss findings merely because the app appears to work**.
- Do not merge or deploy until a reviewer other than the implementation author completes the required Full review and all blockers are resolved.

## 7. Expected Claude response and handoff

Please produce a concise but substantive review in the draft pull request and existing Asana task:

- **Verdict:** APPROVE PLAN / REVISE PLAN / DO NOT PROCEED.
- **Evidence:** exactly what you inspected and tested; distinguish verified configuration and assumptions.
- **Findings:** severity-ordered security and reliability issues, with concrete file locations and actionable corrections.
- **Architecture choice:** Gmail pilot, Microsoft workplace sign-in, or another approach, with reasoning and trade-offs.
- **Owner-only action list:** only the credentials and administrator steps genuinely unavoidable for the owner. Do not ask the owner to write code, find secret values in chat or merge branches.
- **Delivery gates and rollback:** objective criteria for enabling the feature, plus what remains blocked.
- **Coordination:** comment on the existing Asana mail-login task instead of creating duplicate action tasks. Follow AGENTS.md. Do not modify production authentication configuration or merge to main without separate authorization.

## 8. Links and references

- Primary plan: docs/EMAIL_LOGIN.md
- Existing owner-facing work item: https://app.asana.com/0/0/1220566224074437
- Google provider verification task: https://app.asana.com/0/0/1220566224358494
- Separate privilege-review task: https://app.asana.com/0/0/1220777448112917
- Supabase passwordless sign-in: https://supabase.com/docs/guides/auth/auth-email-passwordless
- Supabase custom email sender: https://supabase.com/docs/guides/auth/auth-smtp
- Supabase Google SMTP help: https://supabase.com/kb/troubleshooting/using-google-smtp-with-supabase-custom-smtp-ZZzU4Y
- Google app passwords: https://support.google.com/accounts/answer/185833
- Supabase Microsoft sign-in: https://supabase.com/docs/guides/auth/social-sign-in/auth-azure
- Free-tier template change: https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier

**Boundary:** This file is a review request and planning record, not approval for deployment.
