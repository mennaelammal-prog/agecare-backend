# Service Restoration Checklist

- [x] Compare the imported frontend’s API client and authenticated request behavior with the redesigned project.
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

The deployed API health endpoint is reachable. The original backend only permits the original Render frontend and local development origins in its CORS configuration, so the redesigned preview cannot make authenticated browser calls until its origin is allowed or requests are routed through a server-side proxy. The existing history route returns check-ins only for the signed-in user; it does not accept a linked-patient identifier. Family linking stores a relationship and lists linked patients, but it does not grant an endpoint for reading that patient’s care history. These are separate integration gaps to resolve.

The supplied `family-care-chi.vercel.app` deployment is a frontend-only application; its `/api/health` route returns 404. It cannot replace the AgeCare REST backend. The imported Render service remains the confirmed live API, but it needs a proxy or an updated allowlist before a new frontend can call it.

The redesigned preview now renders an explicit AgeCare connection dialog instead of presenting nonfunctional service controls. The actual history, family, linked-patient, medication, appointment, vital-sign, and check-in requests require a legitimate existing AgeCare user session; no account credentials have been entered during validation.

The server-side bridge now proxies legacy login, check-in submission, care-history loading, family contacts, linked patients, medication records, appointments, and vital-sign records. The original backend still lacks an authorized route to retrieve a linked patient’s check-in history, so that specific caregiver view cannot be completed without a backend endpoint and permission model.

The browser validation confirms that Care History, Care Chat, and Family Circle now route to explicit secure connection and live-service states rather than generic placeholder panels. No live user credentials or patient data were entered during validation, so no care records or contacts were created, changed, or deleted.

The Family Circle browser view now visibly explains that the current backend supports patient linking but does not provide a permissioned endpoint for caregivers to read a linked patient’s check-ins. This avoids promising unavailable shared-history behavior.

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

- [x] Review the imported backend’s deployment scripts, dependencies, route registration, and migration conventions.
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
