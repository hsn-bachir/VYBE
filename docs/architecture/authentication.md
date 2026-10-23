# Core SPA authentication

Email/password authentication is implemented in Core and React. Catalog is not involved.

## Username and verification

Registration now accepts `username` in place of `name`. Usernames are trimmed, lowercased, restricted to 3–30 ASCII letters, digits and underscores, and checked against reserved names. A database unique index enforces uniqueness. The additive username migration derives usernames from legacy names in ID order, adds an ID suffix on collisions, then drops `name`. Existing user IDs, emails, hashes and verification timestamps remain intact. The migration cannot reconstruct old display names on rollback; retain a backup before applying it.

`User` implements Laravel `MustVerifyEmail`. Registration dispatches `Registered`, which sends Laravel's native verification notification. The notification targets a Core-origin temporary signed URL (`/email/verify/{id}/{hash}`), default expiry 60 minutes. The web handler checks the signature, authenticated session, account ID and email hash, marks the user verified once, dispatches `Verified`, then redirects to a fixed frontend route. Invalid, expired and wrong-account links redirect to fixed error routes. The URL contains no session credential and no caller-controlled redirect. A signed link opened in a different browser requires signing in to the same account before reopening it.

Authenticated users can retrieve status and resend a notification at `/api/v1/auth/email/verification-status` and `/api/v1/auth/email/verification-notification`. Resend is limited to 3 per minute per user. Verified users receive an already-verified response without mail. `/auth/me` includes `email_verified_at`; verification pages refresh server state. Unverified users can log in, log out, view status and resend. Core public movie endpoints retain their public contract; the SPA directs an unverified session to verification. No global verified middleware is used.

Verification is now required for authenticated application access. Registration and unverified login return the real session and status, then React routes to `/verify-email`. Unverified users can use `/auth/me`, verification status/resend, logout and the signed-link handler. Public movie GET routes remain public at Core. The frontend redirects an unverified session away from the application shell, while guests may browse public routes. Future account-only Core endpoints must use `auth:sanctum` plus Laravel's `verified` middleware. There are no private product endpoints in the current scaffold; a test-only route verifies that Laravel rejects an unverified session with 403 and accepts a verified one. `/auth/me` and verification endpoints deliberately do not use `verified` because they are needed to complete verification.

The frontend success page waits for a fresh backend status check before showing confirmation or the “Continue to VYBE” action. TanStack Query refetches on window focus; there is no polling. Expired links can be replaced through the throttled resend endpoint. The approved logo asset is absent from the repository, so a reusable text wordmark remains in use.

## Request and session flow

- The SPA uses one Axios client with the Core root URL, credentials, XSRF headers and JSON responses.
- TanStack Query resolves `GET /api/v1/auth/me` on startup, route mount and window focus. Only 401 means signed out; connection/server errors show retry feedback.
- Before register/login/logout, fetch `/sanctum/csrf-cookie`. The browser sends the encrypted XSRF cookie as `X-XSRF-TOKEN` and the HttpOnly session cookie automatically.
- Registration validates and creates a user using Eloquent's hashed password cast, authenticates the web guard and rotates the session. Login uses Laravel's credential verification and rotates the session. Null-password accounts fail with the same message as unknown accounts.
- Logout logs out the web guard, invalidates the session, and regenerates the CSRF token. Successful identity changes cancel in-flight queries and discard other cached data. No authentication tokens are stored in browser storage.
- A 419 displays a resubmission instruction; the next explicit submission bootstraps CSRF again. Writes are never automatically retried.
- `RequireAuth` is available for future private routes. Home remains public. Guest-only auth pages redirect signed-in users home. No movie routes existed in the initial scaffold; this change does not implement movie discovery.

## Middleware and security

`statefulApi()` enables Sanctum's API integration. The auth API routes always use Laravel's `web` middleware, including requests with no Origin header. They exclude Sanctum's conditional `EnsureFrontendRequestsAreStateful` wrapper to avoid executing the cookie/session stack twice. They still use `auth:sanctum` for `/me` and `/logout`. No CSRF middleware is excluded. No API token trait, token routes, or token tables are added.

Auth responses are private and `no-store`. UserResource exposes only the documented five fields. Emails are trimmed/lowercased by requests and the model; login failure messages do not disclose account existence. Registration intentionally reports duplicate email validation errors. Concurrent duplicate registrations are translated into 422 responses.

Passwords require 12–255 characters, a letter, a number, and confirmation. Login allows existing shorter passwords. Login limits are 5 requests per minute per normalized email/IP plus 30 per IP; registration allows 5 per minute per IP. Configure a shared persistent cache for deployment. Local cache defaults to database.

The users migration is additive. It checks legacy names and normalized-email collisions before DDL, preserves accounts, normalizes existing emails, makes passwords nullable, and adds nullable avatars. Resolve flagged legacy records explicitly before retrying. Rolling back refuses while null-password accounts exist; rolling back otherwise removes the avatar column. MySQL DDL is not transactional: back up real data before normal migrations.

## Verification boundaries

Backend feature tests use the configured isolated test DB. A CSRF test switches only the application environment binding to `local`, leaving the test database configuration in place, to exercise the actual middleware and encrypted XSRF header. Session regeneration, logout, validation, generic credential errors, null passwords, throttling and CORS are covered.

Frontend Vitest tests cover API sequencing, failure handling, cancellation, server-truth identity and rendered form accessibility/disabled OAuth controls. They use Node and server rendering; they are not interactive browser tests. Vitest 4.1.12 was available in the local package cache; Testing Library/jsdom installation was blocked by local registry certificate trust and was not added.

For manual browser acceptance, follow [local setup](../development/setup.md). Production requires HTTPS, secure cookies, an explicit trusted frontend origin, shared parent domain between SPA and Core, appropriate session domain, and `APP_DEBUG=false`. Consult [Sanctum's SPA guidance](https://github.com/laravel/docs/blob/13.x/sanctum.md).
