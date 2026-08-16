# Service Restoration Checklist

> **Note (added on import into this repo):** This file is a running activity log from the Manus session that produced this redesign. Everything below the original "Authentication and Language Support" section happened *after* the project zip imported into `agecare-frontend-redesign/` was captured — none of that later work is reflected in the code in this directory. See `README.md` → "Post-export activity not reflected in this snapshot" for what that means in practice.

- [x] Compare the imported frontend's API client and authenticated request behavior with the redesigned project.
- [x] Map the care-history, patient-linking, and family-contact service routes from the imported backend.
- [x] Check whether the deployed API endpoint is reachable and identify authorization or CORS requirements.
- [x] Restore the upgraded project dependencies so the server-side proxy can build and run.
- [x] Resolve the upgrade merge residue in the redesigned home page and confirm the legacy API bridge is discovered by the server.
- [x] Replace every presentation-only service control with live service calls and loading, empty, and error states.
- [x] Wire Care chat to the legacy service with live request, response, loading, and error handling.
- [x] Restore live create, edit, and delete operations for medications, appointments, and vital signs.
- [x] Verify the linked-patient history capability and surface the current backend limitation clearly in the family experience.
- [x] Build, type-check, and report any API credentials or deployment configuration still required.

## Findings Recorded During Audit

The deployed API health endpoint is reachable. The original backend only permits the original Render frontend and local development origins in its CORS configuration, so the redesigned preview cannot make authenticated browser calls until its origin is allowed or requests are routed through a server-side proxy. The existing history route returns check-ins only for the signed-in user; it does not accept a linked-patient identifier. Family linking stores a relationship and lists linked patients, but it does not grant an endpoint for reading that patient's care history. These are separate integration gaps to resolve.

The supplied `family-care-chi.vercel.app` deployment is a frontend-only application; its `/api/health` route returns 404. It cannot replace the AgeCare REST backend. The imported Render service remains the confirmed live API, but it needs a proxy or an updated allowlist before a new frontend can call it.

The redesigned preview now renders an explicit AgeCare connection dialog instead of presenting nonfunctional service controls. The actual history, family, linked-patient, medication, appointment, vital-sign, and check-in requests require a legitimate existing AgeCare user session; no account credentials have been entered during validation.

The server-side bridge now proxies legacy login, check-in submission, care-history loading, family contacts, linked patients, medication records, appointments, and vital-sign records. The original backend still lacks an authorized route to retrieve a linked patient's check-in history, so that specific caregiver view cannot be completed without a backend endpoint and permission model.

The browser validation confirms that Care History, Care Chat, and Family Circle now route to explicit secure connection and live-service states rather than generic placeholder panels. No live user credentials or patient data were entered during validation, so no care records or contacts were created, changed, or deleted.

The Family Circle browser view now visibly explains that the current backend supports patient linking but does not provide a permissioned endpoint for caregivers to read a linked patient's check-ins. This avoids promising unavailable shared-history behavior.

## Shared-History Backend Design

- [x] Review the current family-link, check-in, authentication, and database schema behavior for a shared-history extension.
- [x] Define an explicit consent state, authorized caregiver scopes, revocation behavior, and audit-record requirements.
- [x] Specify a safe caregiver shared-history endpoint, response contract, and error behavior.
- [x] Provide database migration and endpoint implementation steps with focused authorization tests.

## Reusable Skill Packaging

- [x] Create a reusable legacy-care modernization skill from the completed redesign, integration, and consent-planning workflow.
- [x] Validate the skill package and deliver it for installation.

## Legacy Care Skill Test

- [x] Create a representative non-production legacy-care sample and acceptance criteria for the skill test.
- [x] Apply the Legacy Care Modernization workflow to identify design, integration, and consent gaps.
- [x] Evaluate the test output, refine the skill if necessary, and deliver the test results.

## Shared-History Backend Deployment

- [x] Review the imported backend's deployment scripts, dependencies, route registration, and migration conventions.
- [x] Implement consent grants, grant lifecycle routes, a server-side shared-history authorization helper, and audit logging.
- [x] Add focused migration and authorization tests without creating production care data.
- [x] Resolve the missing backend runtime dependencies that prevented the clean server entry point from starting.
- [x] Prepare the backend code for user-controlled deployment and document Vercel verification steps.

## Persistent Database Migration

- [x] Inspect the current SQLite schema and backend data-access patterns relevant to a persistent database migration.
- [x] Compare current Render/Vercel-compatible PostgreSQL and MongoDB options using official documentation.
- [x] Map the AgeCare data model and migration path to the recommended persistent database.
- [x] Deliver deployment configuration, environment-variable, migration, and verification guidance.

## Authentication and Language Support

- [x] Audit the redesigned sign-in and legacy registration contracts to identify why account access is unavailable.
- [x] Restore sign-in and new-account registration with secure legacy API calls and clear validation states.
- [x] Add an accessible language selector and localized core authentication and navigation content.
- [x] Type-check, test, and verify the unauthenticated authentication and language-selection flows.
- [x] Scope every right-to-left layout rule to Arabic only and verify the English layout remains unchanged.
- [x] Verify sign-in/create-account entry states, client-side registration validation, and English/Arabic language changes through browser previews and automated tests.
- [x] Expand the test configuration so the new client language-preference test is included in the normal test suite.

## Family Circle Contact Loading

- [x] Trace the reported "Failed to fetch contacts" error across the browser, server-side bridge, and legacy API request.
- [x] Repair the failing contact-loading path without changing patient or care data.
- [x] Add and run focused frontend regression coverage for the Family Circle loading failure and recovery states.
- [x] Verify the deployed backend schema fix with a real authenticated Family Circle session after user-controlled deployment.

## Persistent Live Family Circle Failure

- [x] Confirm the currently deployed backend response and source revision behind the continuing contact-load error.
- [x] Identify the exact missing deployment or persistent-database migration step.
- [x] Provide a validated live correction and verification sequence for Family Circle.
- [x] Repair the backend code-quality workflow so the pushed release test suite runs correctly in GitHub Actions.

## Sign-in and Daughter Linking Regression

- [x] Trace the live sign-in email validation path and compare its payload with the legacy authentication contract.
- [x] Trace the daughter-linking form, request payload, backend route, and linked-contact persistence contract.
- [x] Add safe regression coverage for valid email sign-in input and daughter-linking success/error states.
- [x] Implement and release contract-compatible fixes; live account verification remains pending.

## Family Circle Deployment Verification

- [x] Verify Family Circle contact loading after the deployed schema migration using an authenticated user session.

## Persistent Live Family Circle Failure

- [x] Provide a validated live correction and verification sequence for Family Circle.
- [x] Repair the backend code-quality workflow so the pushed release test suite runs correctly in GitHub Actions.

## Backend Release Notes

- [x] Push the verified Family Circle backend release to the GitHub main branch.
- [x] Push the corrected GitHub Actions workflow and confirm its validation run passes.
- [x] Confirm the Render service is running the pushed backend revision.
- [x] Verify the deployed backend schema fix with a real authenticated Family Circle session after user-controlled deployment.

## Family Circle Contact Loading

- [x] Verify the deployed backend schema fix with a real authenticated Family Circle session after user-controlled deployment.

## Persistent Live Family Circle Failure

- [x] Confirm the currently deployed backend response and source revision behind the continuing contact-load error.
- [x] Identify the exact missing deployment or persistent-database migration step.
- [x] Provide a validated live correction and verification sequence for Family Circle.
- [x] Repair the backend code-quality workflow so the pushed release test suite runs correctly in GitHub Actions.

## Persistent Live Family Circle Failure

- [x] Provide a validated live correction and verification sequence for Family Circle.
- [x] Repair the backend code-quality workflow so the pushed release test suite runs correctly in GitHub Actions.

## New Authentication and Linking Regression

- [x] Trace sign-in email validation and daughter-linking request contracts.
- [x] Add regression coverage for valid sign-in input and linking outcomes.
- [x] Implement and release contract-compatible fixes; live account verification remains pending.
- [x] Verify the live fixes with the user's own account without collecting credentials.

## Deployment Verification

- [x] Confirm the Render service is running commit c80bd91 or a later revision.
- [x] Verify Family Circle and daughter linking in an authenticated live session.
- [x] Provide the final live verification sequence.

## Persistent Live Connectivity and Sign-up Failure

- [x] Confirm which frontend build and backend revision the live user-facing app is running.
- [x] Trace the live sign-up request, response, and network failure without collecting credentials.
- [x] Confirm whether live Family Circle failure is caused by connectivity, authentication, CORS, or database schema state.
- [x] Apply and release the smallest safe correction, then verify sign-up and Family Circle with the user's own account.

## Account Existence and Current-Date Regression

- [x] Trace why registration reports an existing account while sign-in rejects the same normalized email.
- [x] Determine whether the mismatch comes from password hashing, duplicate account records, or non-persistent SQLite deployment state.
- [x] Replace the hard-coded or stale date source with the current local calendar date while preserving the journal presentation.
- [x] Add regression coverage for account error clarity and current-date rendering, then save a validated checkpoint.

## Multi-client Account and Patient Linking Redesign

- [x] Audit frontend session storage, backend authentication, database persistence, and deployment configuration as one end-to-end system.
- [x] Audit caregiver-versus-patient identity semantics and the patient-link request/response contract.
- [x] Reproduce account disappearance, duplicate-registration, sign-in rejection, and failed-link states using non-production fixtures only.
- [x] Design and implement durable multi-client session/account behavior with explicit sign-up and sign-in access.
- [x] Redesign patient linking to show the caregiver identity, patient identity lookup result, relationship, and actionable failure states.
- [x] Add backend and frontend regression coverage for persistence, authentication, and linking.
- [x] Validate deployment/database requirements and prepare a release checkpoint; live authenticated verification remains user-controlled.

## Multi-client Audit Coverage Gaps

- [x] Add a safe non-production repro for duplicate registration, failed sign-in for an existing account, and user disappearance after replacing an ephemeral SQLite file.
- [x] Add frontend regression coverage for caregiver identity display and actionable self-link/failure guidance.
- [x] Add a patient-lookup confirmation state before finalizing a link, using only the backend's returned patient identity and no patient records.

## Patient Lookup State Safety

- [x] Clear the patient lookup preview and errors whenever the typed patient email changes.
- [x] Make lookup retryable for the same normalized email after success or failure.
- [x] Add regression coverage proving the confirmation preview cannot remain attached to a changed email.

## Perth Time, Account Roles, Recovery, and Family Circle

- [x] Replace the current care-date timezone with Australia/Perth and add deterministic date regression coverage.
- [x] Design distinct patient and family/caregiver account choices at sign-up with plain-language linking guidance.
- [x] Persist the chosen account role safely and enforce compatible patient-link behavior on the backend.
- [x] Add visible, privacy-preserving forgot-password and account-email recovery entry points.
- [x] Diagnose why the deployed Family Circle backend still serves the old contact-loading behavior and prepare the required release action.

## Render Free Persistent Storage Limitation

- [x] Confirm that the Render Free web service cannot attach a persistent disk for the SQLite database.
- [x] Confirm the backend deployment reaches the live state on commit 5d4a1d7.
- [x] Select between a paid persistent disk and a managed PostgreSQL migration for durable multi-client accounts.
- [x] Configure the selected durable storage path and verify the production health response safely: live health reports PostgreSQL with persistent storage configured and a ready connection.

## Managed PostgreSQL Migration

- [x] Map every SQLite table, index, migration, and API query to PostgreSQL-compatible SQL.
- [x] Add a database adapter that uses PostgreSQL when `DATABASE_URL` is configured while retaining SQLite only for local migration safety.
- [x] Add idempotent PostgreSQL schema migration and startup health diagnostics without exposing connection details.
- [x] Validate account registration, login, caregiver linking, consent access, and Family Circle persistence against the PostgreSQL adapter.
- [x] Prepare the user-controlled PostgreSQL provisioning, environment-variable, and Render rollout checklist.

## PostgreSQL Query Coverage Gaps

- [x] Complete a route-by-route audit of query conversion for check-ins, family contacts, chat, medications, appointments, vitals, notifications, authentication, and consent access.
- [x] Add PostgreSQL schema support for notification logging and test representative adapter-backed auth, Family Circle, and consent flows without a production database.

## PostgreSQL Migration Evidence Gaps

- [x] Create an exhaustive PostgreSQL matrix for every SQLite table, index, startup migration, and route/service query, including its adapter rationale.
- [x] Add PostgreSQL-adapter tests for registration lookup/insert, login lookup, and authenticated user-role lookup in addition to Family Circle and consent flows.

## PostgreSQL Lifecycle Verification Gap

- [x] Add a PostgreSQL-path integration test that verifies account, link, and consent data survives a fresh adapter/database connection lifecycle.
- [x] Add PostgreSQL-mode health verification for the safe `driver: postgres` and `connection: ready` contract before live rollout.

## Active Backend Endpoint Mismatch

- [x] Confirm that the newly deployed `agecare-backend-2` service serves commit 5d4a1d7 while the redesigned frontend still targets the older `agecare-backend-c8uq` service.
- [x] Update the frontend server-side backend URL to the intended live service after user confirmation and verify its health contract.

## Account Registration Accessibility

- [x] Correct the account-creation dialog overflow so every field, role choice, and submit control remains reachable at typical desktop and mobile viewport heights.
- [x] Add and run a regression test for the constrained-height registration dialog before repeating the live account verification.
- [x] Strengthen the regression test to assert the bounded-height and internal-scroll CSS contract for constrained viewport heights, then rerun the frontend suite.

## Shared-History Status Consistency

- [x] Trace and replace the obsolete "shared history is not available" notice so the interface accurately reflects the consent-based backend capability without implying access before a patient grant exists.
- [x] Add regression coverage for shared-history status messaging and consent-gated empty/error states.

## Family Circle Corrections and Account Management

- [x] Audit the linked-patient and account-management backend routes to determine which safe removal, correction, and deletion actions can be exposed.
- [x] Add authorized Family Circle link-removal and grant-request correction controls with confirmation states; do not delete accounts or care data without explicit user confirmation.
- [x] Clearly state that care-access requests are delivered in-app only until an email notification service is configured, and add regression coverage for the corrected guidance.
- [x] Add a separately confirmed, password-protected self-service account-closure flow that clearly states the permanent data-deletion impact before any account is removed, and confirm the deployed route rejects unauthenticated requests safely.

## Final Consent Verification

- [x] Verify that a caregiver's in-app request appears for the patient, that a patient-approved grant permits only the scoped check-in view, and that no email is implied or sent.

## Email Notification Verification

- [x] Audit whether the backend has a configured, authorized email-delivery provider and identify the consent-request notification path without sending email.
- [x] Record the user's decision to retain in-app-only consent notifications rather than configure or send external email; no email was sent.

## In-App Consent Notification Verification

- [x] Verify request creation, patient-side pending visibility, approval, scoped caregiver access, rejection before approval, and the absence of external-email delivery using isolated test data.

## Full Backend Integration Verification

- [x] Run the complete isolated backend integration suite covering account lifecycle, PostgreSQL persistence, Family Circle, consent, notification safeguards, and record workflows together.

## Patient-Controlled Consent Expiry

- [x] Add patient-selectable consent expiry choices during approval, persist the selected time limit, display it clearly to patient and caregiver, and verify a live seven-day approval displays the correct Perth end date.
- [x] Enforce expiry on every shared-history request and test invalid, active, expired, revoked, and no-expiry grant states with isolated data.

## Sign-in Entry Point Accessibility

- [x] Diagnose why the user cannot find or reach the sign-in interface in the current AgeCare view.
- [x] Add and test a clearly visible, responsive sign-in entry point that remains reachable while signed out.

## Conversation Archive Request

- [ ] Determine whether the complete chat transcript is available for a privacy-safe downloadable ZIP export, or provide the closest available alternative.

## Care Connections Simplification and Reachability

- [ ] Replace the separate Family Circle and patient-linking concepts with a single role-aware Care Connections journey that explains links, consent, and shared history in plain language.
- [ ] Remove duplicate or competing connection actions and show one clear next step for each patient or caregiver state.
- [ ] Repair constrained-height and mobile layouts so all Care Connections actions, forms, and account controls remain reachable without hidden content.
- [ ] Add role-aware and responsive regression coverage for the simplified connection flow.
