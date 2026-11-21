# Firebase authentication final browser acceptance

This is the manual release gate for Phases 2A–2D. Automated tests fake Firebase calls and cannot prove popup behavior, inbox delivery, or multi-browser cookies. Use a disposable Core database and dedicated Firebase identities. Do not run `migrate:fresh` or delete existing identities to reset a test. Record each result, browser, time, and any HTTP status; redact tokens, passwords, cookies, and email links from screenshots and issue reports.

## Before starting

1. Install the checked-in Composer and npm lockfiles. Start MySQL, Core at `http://localhost:8000`, and the SPA at `http://localhost:5173`. Verify `http://localhost:8000/up` and load the SPA.
2. In `backend/.env`, set `AUTH_IDENTITY_PROVIDER=firebase`, `FIREBASE_PROJECT_ID`, and `FIREBASE_CREDENTIALS` to a readable service-account JSON **outside the repository**. On Windows use a native absolute backslash path such as `C:\secure\firebase-service-account.json`; do not use `C:/...`. Set `APP_URL=http://localhost:8000`, `FRONTEND_URL=http://localhost:5173`, `SANCTUM_STATEFUL_DOMAINS=localhost:5173,localhost:8000`, `SESSION_DRIVER=database`, `CACHE_STORE=database`, and the disposable `vybe_core` MySQL connection. Clear cached Laravel config if it was enabled. Never paste credentials into a ticket.
3. In `frontend/.env`, set `VITE_AUTH_IDENTITY_PROVIDER=firebase`, `VITE_API_URL=http://localhost:8000`, and the Firebase web app API key, auth domain, project ID, and app ID. The project ID must match Core. Restart Vite after edits. The web API key is public configuration; the service-account JSON is secret.
4. In Firebase Authentication, enable Email/Password, Google, and GitHub for the test project; configure GitHub's OAuth app and Firebase provider secret. Add `localhost` to Authorized domains and set the Authentication email template custom action URL to `http://localhost:5173/auth/action`. Use the same host spelling in both apps; mixing `localhost` and `127.0.0.1` breaks cookies.
5. Configure Firebase's own verification/reset email templates and a real Laravel SMTP transport for **administrator invitations**. `MAIL_MAILER=log` does not deliver invitations and intentionally reports `pending`. Verify SMTP sender and inbox/spam access. Use browser developer tools with Preserve log enabled and redact secrets before sharing captures.
6. Prepare a mapped, verified, active administrator; a normal password test identity; separate Google and GitHub test identities; one unlinked Firebase identity; two browser profiles or a private window; and an inbox for each address. Use the existing explicit operator linking command for a legacy SQL administrator only after verifying its owner and email. Never link by email alone. For deployment, require HTTPS, secure session cookies, a trusted frontend origin, and a shared atomic cache across Core instances.

Each case below has a place to mark **Pass / Fail / Blocked**. A failed case is a release gate until investigated.

## 1. Email/password registration

- **Preconditions:** Fresh email and username; no VYBE or Firebase account with that address.
- **Steps:** Open `/register`; submit an invalid username, then a valid username with a 12+ character password and confirmation. Repeat a submit using the same email; try an already used username from another fresh email. If the first Core request fails after Firebase creation, correct the username in the same tab and retry.
- **Expected:** Validation is visible; one Firebase UID maps to one SQL user with the chosen username, null SQL password and unverified state. A retry does not create a second Firebase identity or SQL row. Duplicate email/username is rejected without taking over an account.
- **Inspect if failed:** Network responses for `/auth/firebase/register` (422/409/201/200), Core log exception class only, Firebase Authentication users, and the Core user row's ID/UID/username. Do not copy an ID token.

## 2. Email verification

- **Preconditions:** Unverified password test user, inbox access, and Firebase custom handler URL configured.
- **Steps:** Request/resend from `/verify-email`; confirm an actual Firebase message arrives. Open it in the same tab, then repeat with another new test identity in a different tab and a different browser profile. Also open a valid link for account A in a browser signed in as account B. Return to the original tab, use **Check again** or refocus, and try a reused or expired link.
- **Expected:** `/auth/action` applies a valid code once; Core verification status becomes verified for the mapped UID and the user can continue without a redirect loop. A separate browser with no VYBE session offers sign-in. Account B's browser requests sign-out instead of presenting B's verified status as proof for A. Reused/expired codes show an error. Resend is throttled. The page never claims Core access merely because link processing returned.
- **Inspect if failed:** Firebase template action URL and Authorized domains, inbox/spam, `mode`/`oobCode` presence without sharing its value, `/auth/email/verification-status` response, SQL `email_verified_at`, and browser cookie host.

## 3. Email/password login

- **Preconditions:** Verified password account and a second identity.
- **Steps:** Sign out; try a wrong password and an unknown email, then sign in correctly. While signed in, attempt to exchange a token for a different identity only in a dedicated API test.
- **Expected:** Wrong/unknown credentials fail generically. Correct sign-in creates a rotated Laravel session; different identity exchange returns 409 until logout. A disabled Firebase user cannot establish a new session.
- **Inspect if failed:** Firebase Email/Password provider, `/auth/firebase/session` status, CSRF cookie request, and Core `/auth/me`; redact request tokens.

## 4. Session persistence

- **Preconditions:** Signed-in verified user.
- **Steps:** Reload `/profile`, open another tab on the same browser profile, navigate among private pages, and watch network traffic.
- **Expected:** Same numeric SQL ID and session survive reload; normal navigation uses Laravel cookies and `/auth/me` rather than repeatedly sending Firebase ID tokens. Private APIs remain available.
- **Inspect if failed:** Cookie domain, SameSite, Secure setting for the current HTTP/HTTPS origin, credentialed CORS, `/sanctum/csrf-cookie`, `/auth/me`, and 401/419 responses.

## 5. Password reset

- **Preconditions:** Password identity, inbox, and a second active browser session. Also prepare a Google-only or GitHub-only identity.
- **Steps:** Request reset from `/password/forgot` for known, unknown, and SSO-only addresses. Confirm only the password account receives a Firebase reset email. Open its link, submit an invalid password then a valid one, try the link again, and sign in with new and old passwords in separate attempts.
- **Expected:** Forgot responses are generic; SSO-only gets no reset email and no new password method. Valid reset signs out old VYBE sessions and revokes Firebase refresh tokens; new password works, old does not. Expired/reused code fails safely.
- **Inspect if failed:** Firebase template/handler, inbox/spam, `/auth/firebase/password/forgot` and `/reset` statuses, old browser `/auth/me`, and whether the Firebase account's sign-in methods changed.

## 6. Google SSO

- **Preconditions:** Enabled Google provider, Authorized domain, dedicated Google account.
- **Steps:** From `/login`, choose Google; test popup cancellation once, then complete sign-in. Reload and log out. Sign in again with the same account.
- **Expected:** Cancellation leaves no VYBE session. New UID reaches username onboarding; returning mapped UID gets the same numeric SQL ID and no extra account. No Google access token is stored in SQL or browser storage.
- **Inspect if failed:** Popup blocking/domain settings, provider enablement, `/auth/firebase/social/session` status, Firebase UID, and VYBE ID.

## 7. GitHub SSO

- **Preconditions:** Enabled GitHub provider and dedicated GitHub account with a usable email; optional second GitHub account without a shared email.
- **Steps:** Choose GitHub on `/login`; cancel once, then complete popup. Repeat sign-in after logout. If possible test the no-email account.
- **Expected:** Same ownership behavior as Google. Missing usable email returns `EMAIL_REQUIRED` without SQL account creation. Unverified provider email remains behind verification gate.
- **Inspect if failed:** GitHub OAuth callback and `user:email` permission, Firebase provider settings, popup response, `/auth/firebase/social/session` 422/202/200.

## 8. Username onboarding

- **Preconditions:** Fresh Google and GitHub identities with no SQL mapping.
- **Steps:** Complete provider popup and pause at `/auth/social/username`; try reserved and duplicate usernames, then choose a valid one. Check SQL before and after final submit.
- **Expected:** `202 USERNAME_REQUIRED` creates no SQL user or Laravel session. Final registration preserves the original Firebase UID and creates exactly one VYBE user. Retry retains the same numeric ID.
- **Inspect if failed:** `/auth/firebase/social/session` and `/auth/firebase/register`, username validation, UID/SQL mapping. Never log the ID token.

## 9. Connecting authentication providers

- **Preconditions:** Verified mapped password account and separate provider identities that are not owned by another Firebase UID.
- **Steps:** Open `/account/connections`; reauthenticate with the current method; connect Google, then GitHub. Sign out and sign in through each method. Try a provider already linked or owned by another test UID.
- **Expected:** All allowed methods reach the same Firebase UID and SQL ID. Conflicting credentials fail without account merge. Failed/cancelled popup clears temporary Firebase state and allows retry. SSO-only users do not see an implied password-add flow.
- **Inspect if failed:** `/auth/firebase/link/authorize` 204/403, popup error, Firebase linked providers, and SQL ID before/after.

## 10. Existing SQL user linking

- **Preconditions:** Existing local SQL test user and separate Firebase identity with verified matching email; operator access to the local CLI.
- **Steps:** Confirm ownership outside the app; run the documented `php artisan vybe:firebase-link <user_id> <firebase_uid>` only for the dedicated test pair; sign in via Firebase.
- **Expected:** Original SQL numeric ID, role, profile, and activity remain; UID is attached only after explicit operator proof. A mismatched email or already mapped UID is rejected.
- **Inspect if failed:** CLI validation message, SQL ID/UID/email, Firebase UID/email. Do not use email coincidence as linking evidence.

## 11. Administrator account creation

- **Preconditions:** Active verified mapped administrator and disposable target email.
- **Steps:** Open `/admin/users`; create a user and a moderator. Try duplicate username and email, then create another target whose email already belongs to an unlinked Firebase test identity.
- **Expected:** New addresses reserve one SQL ID and a passwordless Firebase identity with pending invitation. Existing unlinked identity remains unchanged and waits for dual proof. Duplicates do not attach or merge accounts. `invitation_delivery` reflects transport acceptance or pending.
- **Inspect if failed:** Admin create response, user detail pending state, Firebase UID/credential state, SMTP configuration, and audit row.

## 12. Invitation delivery and acceptance

- **Preconditions:** Admin, real SMTP, inboxes for newly provisioned and existing unlinked identities; separate browser profiles.
- **Steps:** Confirm each invitation actually arrives. Open new-identity link and set password. Open existing-identity link and sign in with its existing method. Try wrong identity, expired/reused link, and admin **Resend invitation** after a simulated delivery failure.
- **Expected:** Token works once and only for its email. New account gains password; existing identity keeps its credential/providers and links only after invitation plus same-email Firebase sign-in. Pending state blocks pre-acceptance session exchange. Resend replaces the prior token; no account is silently deleted.
- **Inspect if failed:** SMTP transport and inbox/spam, `invitation_delivery`, `/auth/firebase/invitations/accept` 204/422/409/503, pending SQL row, Firebase UID. Keep invitation fragments private.

## 13. Administrator password changes

- **Preconditions:** Admin and a non-admin password target; target also signed in in another browser profile.
- **Steps:** Open target admin details, check methods, enter a new password, then freshly confirm as the **administrator** using their own method. Try a wrong administrator identity and a second use of the same confirmation in a controlled API test. Repeat against an SSO-only target.
- **Expected:** Only password targets can be changed. Confirmation is fresh, same-UID, one-use; target old password and old VYBE sessions stop working; new password works. SSO-only returns `PASSWORD_PROVIDER_UNAVAILABLE`. Requested/completed audit events appear without passwords.
- **Inspect if failed:** Target method metadata, 403/409/503 response code, cache store health, Firebase UID, second browser `/auth/me`, and admin audit history.

## 14. Administrator email changes

- **Preconditions:** Admin, mapped target, new inbox, and optional target with linked Google/password methods.
- **Steps:** Change target email from admin details and freshly reauthenticate as admin. Try a duplicate SQL/Firebase email. Confirm target's new inbox verification link and attempt old-session access. Repeat on a linked-provider target if available.
- **Expected:** Same Firebase UID and SQL ID, new matching email, verification cleared until new inbox proof, old sessions rejected, providers preserved. Collisions fail without linking someone else's UID. A partial 503 requires operator review before retrying with a new confirmation.
- **Inspect if failed:** Firebase and SQL current email/UID, 409/422/503 code, verification status, audit history, second browser `/auth/me`.

## 15. Role and account-status authorization

- **Preconditions:** Admin, moderator, ordinary, restricted, banned and deactivated dedicated users.
- **Steps:** Call admin user-management UI/API with each role; navigate private community pages for each status; change status as authorized admin and reload existing sessions.
- **Expected:** Only admin manages identities; moderator cannot. Restricted users retain their documented read access and write limits. Banned/deactivated users receive 403 even with an existing session. Firebase custom claims are irrelevant to VYBE roles.
- **Inspect if failed:** `/auth/me`, `/me/access`, admin route 403, SQL role/status, middleware response code.

## 16. Session revocation

- **Preconditions:** Same target logged into two browser profiles; admin access.
- **Steps:** Perform password reset, direct admin password change, and email change in separate test rounds. After each, reload a private page in the second browser and try a write.
- **Expected:** Old Laravel sessions return 401; old Firebase refresh tokens cannot establish new sessions. Fresh sign-in works only with current valid credentials and verification state. A failed remote operation is reported, not claimed complete.
- **Inspect if failed:** Session cookie scope, `password_session_version`, database session store, Firebase token revocation, `/auth/me` and private write responses.

## 17. Logout

- **Preconditions:** Signed-in user with two tabs in one browser profile.
- **Steps:** Sign out from one tab; refresh the other and try a private API. Sign in as a different dedicated user afterward.
- **Expected:** Current browser session is invalidated, old private access is 401, CSRF token is rotated, and the new sign-in resolves to the new SQL ID. Logout does not delete the Firebase identity.
- **Inspect if failed:** `/auth/logout` 204, session cookie, `/auth/me` 401, CSRF request, auth query cache after sign-out.

## 18. Postman authentication

- **Preconditions:** Local Core running, a dedicated Firebase test identity, and a Postman cookie jar for `localhost`. Treat ID tokens and cookies as secrets.
- **Steps:** `GET http://localhost:8000/sanctum/csrf-cookie` with `Origin: http://localhost:5173` and `Referer: http://localhost:5173/`; copy the URL-decoded `XSRF-TOKEN` cookie value into `X-XSRF-TOKEN` while retaining cookies. `POST /api/v1/auth/firebase/session` with JSON `{ "id_token": "<fresh Firebase ID token>" }` and `Accept: application/json`; then `GET /api/v1/auth/me` with cookies only. Exercise a protected route, logout with a fresh CSRF token if needed, then retry `/auth/me`. Run a separate request without CSRF to confirm 419. Never save real tokens in a shared collection.
- **Expected:** Exchange returns 200 (or 202 for a new social UID); `/auth/me` returns the same SQL user using only cookies; protected authorization follows SQL state; logout returns 204 and then `/auth/me` returns 401. Missing CSRF returns 419.
- **Inspect if failed:** Postman cookie jar host/path, Origin/Referer, URL-decoding of XSRF cookie, matching Firebase project, token freshness, and 401/403/419/422/429/503 response.

## Sign-off record

Record the 18 case statuses, Firebase project alias, Core/SPA versions, test database name, mail transport type, browser versions, and outstanding issue links. Do not include secrets. Production release remains blocked until all security-sensitive cases pass with real Firebase, working mail delivery, and two-browser session checks.
