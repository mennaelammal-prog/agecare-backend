# Australian Aged Care Platform — Technical Architecture & Compliance Blueprint

**Audience:** Engineering, Product, Clinical Safety, Privacy Officer
**Scope:** RBAC/legal model, multi-layer UX, health tracking & escalation, My Health Record (MHR)/ADHA integration, CALD i18n, data sovereignty & security
**Status:** Target-state architecture. Section 8 maps every recommendation against what exists in this repository today (`schema.sql`, `database/postgresSchema.js`, `routes/careAccess.js`, `services/careAccess.js`) so it can be delivered incrementally without a rewrite.

---

## 0. Executive Summary

The platform currently implements a lean patient/caregiver model: a `users.role` flag (`patient` | `caregiver` | `admin`), a scoped, time-boxed, auditable consent object (`care_access_grants` + `care_access_audit`), and clinical logging tables (`checkins`, `vitals`, `medications`, `appointments`). This is a genuinely good foundation — the consent-grant pattern already matches the *shape* the Privacy Act requires (purpose-bound, scoped, revocable, audited). It does not yet model:

- **Legal authority** (EPOA/Guardianship vs informal family "reader" access) — currently everyone with a grant gets the same kind of access.
- **Clinical identity** (IHI/HPI-I/HPI-O) needed to talk to the HI Service and My Health Record.
- **A GP/provider role** — there is no `provider` role, no AHPRA/PRODA verification, no NASH PKI.
- **Structured escalation** — checkins are logged but nothing evaluates thresholds or pages a carer/RN.
- **i18n** — no locale layer exists in either backend or `agecare-frontend-main`.

Everything below is written so each numbered section maps to a buildable increment. Read Section 8 first if you want the "what to build next" list; read Sections 1–7 for the full design.

---

## 1. Australian Privacy, Legal & Access Control Model (RBAC)

### 1.1 The Patient record is the anchor, not the account

Every clinical fact in the system — a check-in, a vital, a medication, a message — hangs off one `patient_profile`, which is the digital-health equivalent of the person, not the login. A patient's *account* (email/password, MFA) is one access path to that profile; a **Nominee** or **GP** is a second and third path to the *same* profile, each carrying a different permission set. This distinction matters because My Health Record access control (and the Privacy Act's APP 6 "use only for the purpose collected") is asserted at the *record* level, not the *session* level — so every read of clinical data must resolve "which profile, under which grant, for which scope" before touching a query, exactly as `requireActiveCareScope()` does today for `checkins:read`.

```
patient_profile (anchor)
 ├─ ihi:            "8003 6082 6789 0123"   (Individual Healthcare Identifier, HI Service-verified)
 ├─ identity_status: 'unverified' | 'ihi_pending' | 'ihi_verified'
 ├─ owning account:  users.id (role='patient')            -- the person themself, if they have capacity
 ├─ nominee grants:  care_access_grants[]                  -- see 1.3
 ├─ provider grants: care_provider_links[]                 -- see 1.4
 └─ org context:     provider_organisation (HPI-O), if residential/home-care client
```

For patients without digital capacity (common in residential aged care), the `users` row backing the profile can be provider-created and *nominee-operated* — the account exists, but every session against it is authenticated as the nominee, with the nominee's identity in the audit trail (`actor_user_id`), never silently as the patient.

### 1.2 IHI resolution via the HI Service

IHI is never typed in by a user. It is resolved server-side, once, through a HI Service search (Medicare card / IHI number / demographic search: name + DOB + sex), performed via the ADHA-conformant HI Service B2B channel over a NASH-authenticated connection. Store the result, not the search inputs:

```sql
ALTER TABLE users ADD COLUMN ihi TEXT;                 -- 16-digit IHI, nullable until verified
ALTER TABLE users ADD COLUMN ihi_status TEXT NOT NULL DEFAULT 'unverified'
  CHECK (ihi_status IN ('unverified','pending','verified','revoked'));
ALTER TABLE users ADD COLUMN ihi_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN ihi_last_validated_at TIMESTAMPTZ;  -- HI Service requires periodic re-validation
```
IHI validity is re-checked on a schedule (HI Service numbers can be replaced/merged on death-record match, duplicate-merge, etc.) — never treat a stored IHI as permanently valid; re-validate before any MHR document fetch (Section 4).

### 1.3 Nominee / family access — two legally distinct tiers

This is the highest-risk gap in the current model: `care_access_grants` today has one implicit tier (any approved caregiver gets whatever `granted_scopes` the patient ticks). Under the Privacy Act and the *My Health Records Act 2012* nominee/representative framework, "can view my mood check-ins" and "can act on my behalf, request my Shared Health Summary, and instruct a GP" are legally different acts, requiring different evidence. Split the tier explicitly:

| Tier | Who | Evidentiary basis required | What it can do |
|---|---|---|---|
| **Nominee with Legal Authority** | Enduring Power of Attorney (financial/personal), Enduring Guardian, court/tribunal-appointed Guardian (state Guardianship Act), or a My Health Record–registered "Authorised Representative" | Uploaded EPOA/Guardianship instrument, verified by Care Manager/Admin, with jurisdiction + effective date range recorded | Can act *as* the patient for MHR purposes (register/withdraw from MHR, manage MHR document access controls per the My Health Records Act), approve/revoke other nominees' grants, view full clinical record, receive all clinical alerts, communicate with GP/provider on the patient's behalf |
| **General Carer / Family Reader** | Adult child, spouse, informal carer nominated by the patient (or by the Legal Nominee if patient lacks capacity) | Patient (or Legal Nominee) consent via the pairing flow in 1.5 — no legal instrument required | Scoped, revocable read access only (e.g. `checkins:read`, `vitals:read`, `meds:read`, `alerts:receive`) — exactly today's `care_access_grants` model. Cannot act on the patient's behalf, cannot manage other nominees, cannot touch MHR document controls |

Schema extension (additive, keeps `care_access_grants` as-is and layers authority on top):

```sql
CREATE TABLE nominee_legal_authority (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  grant_id BIGINT NOT NULL REFERENCES care_access_grants(id) ON DELETE CASCADE,
  authority_type TEXT NOT NULL CHECK (authority_type IN (
    'epoa_financial','epoa_personal_health','enduring_guardian',
    'appointed_guardian','mhr_authorised_representative')),
  jurisdiction TEXT NOT NULL,               -- e.g. 'NSW','VIC','QLD' (state Guardianship/POA Act)
  instrument_reference TEXT,                -- registry/document ref, not the raw scanned doc
  effective_from DATE NOT NULL,
  effective_to DATE,                        -- null = open-ended / until revoked
  verified_by_user_id BIGINT REFERENCES users(id),   -- Care Manager/Admin who sighted the instrument
  verified_at TIMESTAMPTZ,
  verification_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

A grant with a row in `nominee_legal_authority` (verified, and within its effective window) is treated as `authority_tier = 'legal_nominee'`; every other active `care_access_grants` row is `authority_tier = 'general_reader'`. This single boolean-ish check gates the extra permission surface (MHR controls, acting-on-behalf messaging, managing other nominees) without touching the existing scope-based read model.

### 1.4 GP / Healthcare Provider — PRODA, AHPRA, NASH

GPs authenticate through a different chain than patients/nominees — they are never issued a plain email/password login into clinical write paths:

```
GP sign-up flow
 1. GP authenticates to PRODA (Provider Digital Access) — Australian Government's
    identity broker for healthcare providers.
 2. Platform receives a PRODA-asserted identity; cross-checks AHPRA registration
    number (Ahpra public register API / practitioner lookup) — must be
    'registered, no conditions' for the relevant profession (medical practitioner).
 3. HPI-I (Healthcare Provider Identifier - Individual) is resolved via the HI
    Service using the AHPRA number, and stored against the provider's account.
 4. The provider's employing/attending organisation (clinic, GP practice) holds
    an HPI-O (Healthcare Provider Identifier - Organisation) and a NASH PKI
    organisation certificate, used to sign/encrypt all secure-messaging (SMD)
    and MHR document exchange.
 5. Platform issues its own session token (JWT, as today) — but the token
    carries hpii + hpio + ahpra_registration_status, checked fresh on each
    MHR/document-upload call, not just at login.
```

```sql
ALTER TABLE users ADD COLUMN hpii TEXT;                  -- HPI-I, providers only
ALTER TABLE users ADD COLUMN ahpra_registration_no TEXT;
ALTER TABLE users ADD COLUMN ahpra_status TEXT CHECK (ahpra_status IN ('registered','suspended','cancelled','unverified'));
ALTER TABLE users ADD COLUMN ahpra_checked_at TIMESTAMPTZ;

CREATE TABLE provider_organisation (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  hpio TEXT NOT NULL UNIQUE,
  org_name TEXT NOT NULL,
  nash_cert_serial TEXT NOT NULL,           -- reference only; private key never touches app DB, lives in HSM/KMS
  nash_cert_expires_at TIMESTAMPTZ NOT NULL,
  smd_endpoint TEXT,                        -- Secure Message Delivery inbox (HealthLink/ReferralNet address)
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE care_provider_links (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  patient_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organisation_id BIGINT REFERENCES provider_organisation(id),
  role TEXT NOT NULL DEFAULT 'gp' CHECK (role IN ('gp','specialist','nurse_practitioner','pharmacist')),
  relationship TEXT NOT NULL DEFAULT 'usual_gp' CHECK (relationship IN ('usual_gp','locum','specialist_referral')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  linked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMPTZ,
  UNIQUE (patient_user_id, provider_user_id)
);
```

### 1.5 Care Manager / Provider Admin (aged care provider staff, NDIS worker access)

Care Managers act on behalf of a *residential/home-care provider organisation*, not as individual nominees. They hold organisation-scoped roles (not per-patient grants) and their access is bounded by which residents are on their organisation's roster:

```sql
CREATE TABLE care_organisation_staff (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organisation_id BIGINT NOT NULL REFERENCES provider_organisation(id),
  staff_role TEXT NOT NULL CHECK (staff_role IN ('care_manager','registered_nurse','support_worker','provider_admin')),
  ndis_worker_screening_status TEXT CHECK (ndis_worker_screening_status IN ('cleared','pending','expired','n_a')),
  employment_status TEXT NOT NULL DEFAULT 'active' CHECK (employment_status IN ('active','suspended','terminated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE resident_roster (
  organisation_id BIGINT NOT NULL REFERENCES provider_organisation(id),
  patient_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  program TEXT CHECK (program IN ('residential_aged_care','home_care_package','ndis','chsp')),
  admitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  discharged_at TIMESTAMPTZ,
  PRIMARY KEY (organisation_id, patient_user_id)
);
```
A Care Manager's effective scope on a given patient = the org's roster membership **∩** their `staff_role`'s default scope set (RN gets clinical write, support worker gets check-in/observation entry only, provider_admin gets roster/billing but not clinical notes) — mirrored in the permission matrix below.

### 1.6 Full permission matrix (APP 3/6/8/11 aligned)

| Capability | Patient (self) | Legal Nominee | General Carer/Reader | GP | RN / Care Manager | Support Worker | Provider Admin |
|---|---|---|---|---|---|---|---|
| View own check-ins/vitals/meds | ✅ | ✅ (as patient) | ✅ (scope-gated) | ✅ (linked patients) | ✅ (roster only) | ✅ (roster only) | ❌ |
| Enter check-in / observation | ✅ | ✅ | ➖ (optional, patient-toggled) | ➖ | ✅ | ✅ | ❌ |
| Write clinical note / medication order | ❌ | ❌ | ❌ | ✅ | ✅ (RN only, per scope of practice) | ❌ | ❌ |
| View MHR Shared Health Summary / PSML | ❌ (view own, yes) → ✅ own | ✅ | ❌ | ✅ | ✅ (per program consent) | ❌ | ❌ |
| Manage MHR access controls (restrict docs, nominate representative) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Approve/revoke other nominees | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Receive clinical escalation alerts | ➖ | ✅ | ✅ (if `alerts:receive` granted) | ✅ | ✅ | ➖ (shift alerts only) | ❌ |
| Secure-message GP | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| View audit log for own record | ✅ | ✅ | ❌ | ❌ | ➖ (own actions) | ❌ | ➖ (own org actions) |
| Manage organisation roster / staff | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

Every row in this table is APP-8/APP-11 relevant (cross-border disclosure isn't in scope — data stays onshore, Section 6 — but APP 11 "reasonable steps to protect" is exactly what scoped grants + audit + expiry deliver). APP 3 ("collect only what's necessary") is enforced by `ALLOWED_SCOPES` already in `routes/careAccess.js` — extend that set as new read scopes are added (`vitals:read`, `meds:read`, `mhr:read`), never widen it to a wildcard.

### 1.7 Pairing mechanism — Secure Digital Consent Token / QR

The current `/care-access/requests` flow (email-based request → patient approves with scopes + expiry) is sound for **General Carer** pairing and should stay the primary path. Add a QR/token variant for the common in-person case (family member sitting with the resident, or intake at a residential facility):

```
Pairing flow (QR variant)
 ┌────────────┐   1. Patient/Nominee taps "Invite family member"  ┌──────────────┐
 │  Patient /  │ ─────────────────────────────────────────────►  │  Platform    │
 │  Legal      │                                                   │  issues:     │
 │  Nominee    │   2. Server generates a single-use consent token  │  - token     │
 │  device     │      (opaque, 6-digit + QR, scoped, 10 min TTL)   │  - QR (token │
 └────────────┘ ◄───────────────────────────────────────────────  │    encoded)  │
                                                                    └──────┬───────┘
                                                                           │ 3. shown on screen
                                                                           ▼
                                                                  ┌──────────────────┐
                                                                  │ Family member's   │
                                                                  │ device: scans QR  │
                                                                  │ or types 6-digit  │
                                                                  └────────┬──────────┘
                                                                           │ 4. POST /care-access/pair {token}
                                                                           ▼
                                                            Server validates: token unexpired,
                                                            unused, matches patient — creates
                                                            care_access_grants row status='active'
                                                            with the scopes pre-selected at step 1,
                                                            logs care_access_audit action='grant.pair'
```

```sql
CREATE TABLE care_pairing_tokens (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  patient_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,          -- store hash only, never the raw token
  proposed_scopes TEXT NOT NULL,            -- JSON array, same shape as granted_scopes
  proposed_relationship TEXT,
  expires_at TIMESTAMPTZ NOT NULL,          -- short TTL, e.g. now()+10 min
  used_at TIMESTAMPTZ,
  used_by_user_id BIGINT REFERENCES users(id),
  created_by_user_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```
Same audit and expiry discipline as the existing grant flow; the token is just a faster consent-capture UX for a co-present pairing, not a parallel trust model.

---

## 2. Information Architecture & Accessibility (Multi-Layer UX)

### 2.1 Three portals, one identity graph

The flat single-page structure implied by the current `agecare-frontend-main/src/App.jsx` should split into three route trees sharing the same API and auth token, but never the same navigation shell — an 78-year-old check-in screen and a GP's clinical console have opposite design pressure (fewer choices, bigger targets vs. information density).

```
                         ┌───────────────────────────┐
                         │      Auth / Identity        │
                         │  (role resolved at login)   │
                         └──────────────┬──────────────┘
              ┌────────────────────────┼────────────────────────┐
              ▼                        ▼                        ▼
     ┌─────────────────┐    ┌─────────────────────┐   ┌──────────────────────┐
     │  PATIENT MODE     │    │  FAMILY DASHBOARD     │   │  PROVIDER PORTAL       │
     │  (role=patient)   │    │  (role=caregiver,     │   │  (role=gp/nurse/      │
     │                   │    │   authority_tier      │   │   care_manager)        │
     │  1 task per screen│    │   varies)             │   │                        │
     │  Large touch UI   │    │  Multi-resident switch│   │  Clinical density,     │
     │  Voice-first      │    │  Trend + alert feed   │   │  MHR pane, SMD inbox   │
     └─────────────────┘    └─────────────────────┘   └──────────────────────┘
```

### 2.2 Patient Mode navigation (depth ≤ 2, one primary action per screen)

```
Home (Today)
 ├─ "How are you today?"  → Daily Check-In wizard (5 steps, 1 question each)
 ├─ "My Medicines"        → Today's medication list (large icons, ✓ to confirm taken)
 ├─ "Call [Nominee name]" → one-tap voice/video call
 └─ "Talk to someone"     → Secure Messaging (simplified: pick a contact, big mic button)

  (that's the whole tree — no sidebars, no nested settings surfaced by default;
   "More" is a single low-emphasis link to Settings/Language/Help)
```
Design constraints (WCAG 2.1 AA minimum, AAA where the guideline is a single lever):
- Touch targets ≥ 44×44px (AA 2.5.5) — platform default should be 56×56px given tremor/dexterity prevalence in this cohort.
- Contrast ratio ≥ 7:1 for body text (AAA 1.4.6), not just the AA 4.5:1 floor.
- No timeout-driven session expiry on Patient Mode screens without a warning + one-tap extend (2.2.1); check-in flows must never auto-discard input on token expiry.
- One idea per screen, forward/back only — no drawers, no tab bars, no more than 4 items in the bottom nav.
- Voice UI: every screen exposes a mic-first alternative to typing (STT for check-in notes; TTS read-back of medication names before confirmation — this doubles as a safety check, not just an accessibility one).
- Font scaling respected system-wide (no fixed px text, `rem`-based only) and a persistent in-app text-size toggle independent of OS settings, since many users don't know the OS setting exists.

### 2.3 Family Dashboard navigation

```
Resident switcher (if >1 linked resident)
 └─ Today            → Status card: last check-in, mood trend, meds adherence %, next appointment
 └─ Vitals & Trends   → Chart view (BP/HR/SpO2/weight over 7/30/90d), threshold bands shown
 └─ Medications        → eNRMC-style schedule, adherence history, PBS/AMT name shown alongside brand
 └─ Incidents & Alerts → Escalation feed (Section 3), acknowledge/escalate actions
 └─ Messages           → Secure thread with GP/Care Manager (read-only for General Carer unless
                          `messaging:send` scope granted)
 └─ Care Access         → (Legal Nominee only) manage other nominees' grants, MHR access controls
```

### 2.4 Provider Portal navigation

```
Patient list (roster, or GP's linked-patient list)
 └─ Patient record
     ├─ Overview        → IHI, HPI-O context, active alerts, MHR sync status
     ├─ Shared Health Summary / Event Summary / Discharge Summary / PSML  (MHR panel, Section 4)
     ├─ Vitals & Observations  (dense table + chart, clinician-configurable thresholds)
     ├─ eNRMC Medication Chart → view + (GP/RN) prescribe/administer actions, PBS/AMT coded
     ├─ Incident Log     → structured incident entry (falls, behavioural, medication error) per
                            Aged Care Quality Standard 8 (Organisational Governance) reporting needs
     └─ Secure Messaging → SMD-backed thread (HealthLink/ReferralNet transport, Section 3.2)
```

### 2.5 Structural screen specs (four core screens)

**Daily Health Check-In** (Patient Mode, ~90 seconds to complete)
| Field | Input | Notes |
|---|---|---|
| Mood | 5-point face-scale (😞–😄) | maps to `checkins.mood` |
| Energy | 5-point slider | `checkins.energy` |
| Pain | 0–10 numeric, illustrated body-pain scale on tap | `checkins.pain` |
| Sleep | Hour picker (large steppers) | `checkins.sleep_hours` |
| Meals today | 3-toggle (breakfast/lunch/dinner eaten) | new: `checkin_meals` |
| Mobility | 4-option (independent/assisted/wheelchair/bed-bound today) | new: `checkin_mobility` |
| Free text / voice note | Optional, STT-transcribed | `checkins.notes` |

**Vitals & Observations** — entered by patient (home-care, self-capable), carer, or RN; each row tagged `recorded_by_user_id` + `recorded_by_role` so a self-reported BP is visually distinct from an RN-taken one in the Provider Portal.

**eNRMC Medication Schedule** — read model for the aged-care-standard *electronic National Residential Medication Chart*: each medication row carries AMT concept ID, PBS item code, dose, route, frequency, and a per-administration confirmation (`taken` / `withheld` / `refused`), not just a static list as today's `medications` table provides.

**Incident Log** — structured entry aligned to the Aged Care Quality Standards (falls, skin integrity, behavioural/psychological symptoms, medication incident, other), each with severity, immediate action taken, notification-required flag (triggers escalation, Section 3), and closure workflow — this is new; nothing in the current schema captures incidents.

**Secure Messaging** — threaded, per-patient, participants resolved from `care_provider_links` + active `care_access_grants` with a messaging scope; GP-authored messages carry the HPI-I/HPI-O of the sender for MHR/SMD provenance.

---

## 3. Health Tracking, Communication & Escalation

### 3.1 Daily Wellness Check-In/Check-Out Engine

```sql
CREATE TABLE checkin_meals (
  checkin_id BIGINT NOT NULL REFERENCES checkins(id) ON DELETE CASCADE,
  breakfast BOOLEAN, lunch BOOLEAN, dinner BOOLEAN, fluids_ml INTEGER
);
CREATE TABLE checkin_mobility (
  checkin_id BIGINT NOT NULL REFERENCES checkins(id) ON DELETE CASCADE,
  mobility_status TEXT CHECK (mobility_status IN ('independent','assisted','wheelchair','bed_bound')),
  fall_since_last_checkin BOOLEAN DEFAULT false
);
ALTER TABLE checkins ADD COLUMN recorded_by_user_id BIGINT REFERENCES users(id);
ALTER TABLE checkins ADD COLUMN recorded_by_role TEXT;   -- 'self' | 'carer' | 'rn' | 'support_worker'
ALTER TABLE checkins ADD COLUMN due_date DATE;            -- for missed-check-in detection
```

**Missed check-in detection** runs as a scheduled job (not request-triggered, since nobody requests on behalf of a resident who didn't check in):

```
00:00 local → job creates today's expected checkin_schedule row per patient (if program requires daily)
Every 2h from 09:00–20:00 local → sweep: any patient with no checkins row for today's due_date
   AND past their configured check-in window → raise alert (type='missed_checkin', severity='medium')
20:00 local → final sweep, severity escalated to 'high' if still missing and patient is
   'high_frequency_monitoring' tier
```

### 3.2 Threshold breach → escalation engine

```sql
CREATE TABLE clinical_thresholds (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  patient_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,             -- 'bp_sys','bp_dia','heart_rate','spo2','temperature','pain'
  low_critical NUMERIC, low_warning NUMERIC,
  high_warning NUMERIC, high_critical NUMERIC,
  set_by_user_id BIGINT NOT NULL REFERENCES users(id),   -- GP/RN only
  active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE clinical_alerts (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  patient_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('threshold_breach','missed_checkin','incident','med_missed')),
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  source_table TEXT, source_id BIGINT,       -- e.g. 'vitals', 42
  metric TEXT, observed_value NUMERIC,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','escalated','resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_by_user_id BIGINT REFERENCES users(id), acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ
);

CREATE TABLE alert_notifications (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  alert_id BIGINT NOT NULL REFERENCES clinical_alerts(id) ON DELETE CASCADE,
  recipient_user_id BIGINT NOT NULL REFERENCES users(id),
  channel TEXT NOT NULL CHECK (channel IN ('sms','push','email','in_app')),
  sent_at TIMESTAMPTZ, delivery_status TEXT
);
```

```
Vitals/check-in write ─► evaluate against active clinical_thresholds
        │
        ├─ within range ─────────────────────────────► no alert
        │
        └─ breach detected ─► clinical_alerts row created
                 │
                 ├─ severity=low/medium ─► notify: Legal Nominee + General Carers with
                 │                          `alerts:receive` scope (push + in-app)
                 │
                 └─ severity=high/critical ─► notify: above, PLUS RN/Care Manager (SMS + push),
                                                PLUS GP if no ack within 15 min (escalation timer)
                                                │
                                                └─ still unacknowledged after 30 min (critical only)
                                                   → escalate to organisation on-call / 000 guidance
                                                     prompt shown to nominee ("call 000 if...")
```
This mirrors `services/notification.js`'s existing email-send pattern (fire-and-forget, logged, non-blocking) — extend it to a channel-routing notifier keyed by `alert_notifications.channel`, reusing Twilio (already a dependency) for SMS.

### 3.3 Communication protocols

- **Secure clinical messaging** between GP/RN and other providers uses **Secure Message Delivery (SMD)** — the platform integrates as an SMD *endpoint* via an established provider (HealthLink or ReferralNet) rather than building point-to-point transport; inbound referrals/discharge summaries land in `provider_organisation.smd_endpoint` and are normalised into the platform's message thread model. In-app family↔GP messaging is platform-native (not SMD — SMD is a provider-to-provider clinical-grade channel) but is logged and retained per Section 6.
- **Daily summary feed for remote family** — a single generated digest per linked resident per day (mood/energy trend line, meds adherence %, any open alerts, next appointment), delivered as push + optional email digest, so a Legal Nominee overseas doesn't have to log in to know their parent is okay. This is a read-only rollup of `checkins`/`clinical_alerts`, no new source data.

---

## 4. Australian Digital Health & My Health Record (MHR) Technical Integration

### 4.1 Gateway architecture

```
 ┌───────────────────┐        NASH PKI (org cert)        ┌────────────────────────┐
 │  This platform      │ ───────────────────────────────► │  ADHA B2B Gateway /      │
 │  (provider_organi-  │ ◄─────────────────────────────── │  MHR FHIR® Gateway        │
 │   sation identity)   │        mTLS + signed requests    └───────────┬────────────┘
 └─────────┬───────────┘                                               │
           │ HI Service SOAP/REST (IHI/HPI-I/HPI-O resolution)         │ FHIR R4 (AU Core / MHR profiles)
           ▼                                                           ▼
 ┌───────────────────┐                                     ┌────────────────────────┐
 │  HI Service         │                                     │  My Health Record        │
 │  (resolves/validates │                                     │  (Shared Health Summary, │
 │   identifiers)       │                                     │   Discharge/Event        │
 └───────────────────┘                                     │   Summary, PSML)          │
                                                             └────────────────────────┘
```

Integration is never direct-to-consumer: the platform holds an **HPI-O**, a **NASH organisation certificate** (private key in an HSM/KMS, never in application config), and calls the HI Service and MHR National Infrastructure through an ADHA-conformant software vendor pathway (either self-conformant after ADHA's Conformance, Compliance & Accreditation process, or via a certified integration engine/vendor gateway — recommended for an initial build, given the conformance program's lead time).

### 4.2 Identifier resolution flow

```
Patient onboarding (or GP linking):
 1. Capture demographic (name, DOB, sex) + Medicare/DVA number if available.
 2. HI Service "Search for an Individual's IHI" (demographic or Medicare-card search).
 3. Store resolved IHI + ihi_status='verified' (Section 1.2).
 4. On each GP account creation: HI Service HPI-I lookup by AHPRA number (Section 1.4).
 5. On each provider organisation onboarding: HPI-O registered via HI Service
    Organisation Maintenance, tied to the org's NASH certificate.
```

### 4.3 MHR documents surfaced to GP/Provider Portal

| Document type | FHIR resource(s) (AU Core / MHR profile) | Where shown |
|---|---|---|
| Shared Health Summary | `Composition` + `AllergyIntolerance`, `MedicationStatement`, `Condition`, `Immunization` | Provider Portal → Overview |
| Event Summary | `Composition` (event-summary profile) | Provider Portal → Overview timeline |
| Discharge Summary | `Composition` (discharge-summary profile) + `Encounter` | Provider Portal → Overview timeline |
| Pharmacist Shared Medicines List (PSML) | `MedicationStatement` list, AMT-coded | eNRMC Medication Schedule (cross-checked against locally entered meds for discrepancy flags) |
| eNRMC | Platform-native chart, AMT/PBS-coded; **exported** as a Medicines-domain document per National Residential Medication Chart standard where a resident's aged-care provider requires MHR upload | eNRMC screen (2.5) |

```sql
CREATE TABLE mhr_document_cache (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  patient_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN
    ('shared_health_summary','event_summary','discharge_summary','psml')),
  fhir_composition_id TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fetched_by_user_id BIGINT NOT NULL REFERENCES users(id),   -- must be GP/RN, access-logged
  content_hash TEXT NOT NULL,                                -- change detection, not the payload
  raw_fhir JSONB NOT NULL,                                   -- cached document, subject to Section 6 retention
  UNIQUE (patient_user_id, document_type, fhir_composition_id)
);
```
Every fetch is written to `care_access_audit` (`action='mhr.document.read'`) — MHR access must be as auditable as internal record access, arguably more so since the *My Health Records Act 2012* carries its own civil/criminal penalty regime for unauthorised collection/use/disclosure (ss59–62), independent of the Privacy Act.

### 4.4 What NOT to build first

Full MHR read/write (registering patients for MHR, managing their MHR access controls, uploading Event Summaries as a *contributor*) requires ADHA Conformance Accreditation — a multi-month process with security/clinical-safety review. Sequence this: build the *internal* platform (Sections 1–3, 5–6) fully first; MHR integration is Phase 3+ in the roadmap (Section 7), gated on that accreditation track starting in parallel from Phase 1.

---

## 5. Multilingual (i18n) & CALD Accessibility Framework

### 5.1 Why literal translation is a clinical safety risk

"General Practitioner," "PBS medication," and "Respite" are not general-vocabulary strings — a literal machine translation of "General Practitioner" into Vietnamese or Mandarin can render as something closer to "ordinary doctor," losing the Medicare-specific meaning that determines what the patient is entitled to and who can prescribe what. Medication names are worse: brand/generic confusion across a translation boundary is a medication-error vector, not a UX nit. The i18n layer therefore has two tiers, not one.

### 5.2 Architecture: `react-i18next` + a clinical terminology layer

```
Tier 1 — UI strings (react-i18next, standard)
 /locales
   /en-AU/common.json      /it/common.json      /el/common.json
   /en-AU/checkin.json      /vi/checkin.json      /zh-Hans/checkin.json
   /en-AU/medications.json  /ar/medications.json  ...
 → i18next-http-backend lazy-loads per namespace; i18next-browser-languagedetector
   picks up device locale, overridable in-app (Patient Mode Settings, large-target
   flag+language picker, not a dropdown).

Tier 2 — Clinical terminology (never a raw string swap)
 clinical_term_translations
   concept_system   ('SNOMED-CT-AU' | 'AMT')
   concept_id        (e.g. AMT MPP/TPP concept ID for a medication, or a
                       SNOMED-CT-AU concept for "General Practitioner",
                       "Respite Care", "Enduring Power of Attorney")
   locale
   translated_term    -- clinically reviewed, not machine-translated
   is_reviewed         -- boolean; unreviewed strings fall back to English + a
                          "translation pending review" badge, never shown as final
```

```sql
CREATE TABLE clinical_term_translations (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  concept_system TEXT NOT NULL CHECK (concept_system IN ('SNOMED-CT-AU','AMT','PBS')),
  concept_id TEXT NOT NULL,
  locale TEXT NOT NULL,                    -- BCP-47, e.g. 'vi','el','zh-Hans','ar'
  translated_term TEXT NOT NULL,
  is_reviewed BOOLEAN NOT NULL DEFAULT false,
  reviewed_by TEXT,                         -- credentialed bilingual clinician/interpreter service reference
  reviewed_at TIMESTAMPTZ,
  UNIQUE (concept_system, concept_id, locale)
);
```

**Rendering rule:** any UI element that shows a medication, diagnosis, or clinical-role term looks up `clinical_term_translations` first (by AMT/SNOMED-CT-AU concept ID already stored against the medication/condition — the eNRMC schema in Section 4.3 already carries AMT concept IDs for this reason); only generic UI chrome ("Save," "Next," "Are you sure?") comes from Tier 1 `react-i18next` strings. This also means the **English clinical term is always retrievable and shown alongside the translation** for medication names specifically (e.g. *"Panadol (paracetamol) / بنادول (باراسيتامول)"*) — a deliberate redundancy so a translation gap never hides the identity of a medicine.

### 5.3 Fallback chain

```
requested locale (e.g. vi-VN)
  → base language (vi)
    → is_reviewed clinical term? use it
    → not reviewed? show English term + "translation pending" badge (never guess)
      → UI chrome strings: vi → en-AU (never silently blank)
```

### 5.4 RTL support (Arabic and other RTL CALD languages)

- CSS: logical properties throughout (`margin-inline-start`, not `margin-left`) so layout mirrors automatically; avoid hard-coded `left`/`right`.
- `dir="rtl"` set at the document root when locale is `ar` (or any RTL locale added later), driving both text direction and icon mirroring (back-arrow, chev志rons) via a small directional-icon wrapper component rather than per-icon flips.
- Numerals, dates, and phone numbers stay LTR *within* RTL text (standard bidi behaviour) — test specifically around the medication-dose and vitals-number displays, where a reversed reading order is a safety issue.
- Priority locales given the ABS CALD-in-aged-care profile: Italian, Greek, Vietnamese, Mandarin (Simplified), Cantonese (Traditional), Arabic — sequenced by national aged-care CALD prevalence, confirm against the provider's actual resident population before build order is locked.

---

## 6. Data Security & Sovereignty

### 6.1 Hosting & data residency

- Production hosting confined to **Australian regions only**: AWS `ap-southeast-2` (Sydney) as primary, `ap-southeast-4` (Melbourne) as DR, or equivalent Azure Australia East/Southeast — both **IRAP-assessed** (Infosec Registered Assessors Program), which is the baseline aged-care providers and MHR connectivity expect of a vendor.
- No data processor, subprocessor, log-shipping, or AI/LLM call (see `services/claude.js`) may send identifiable clinical content offshore. Any third-party API call carrying patient data needs its own data-residency/subprocessor review before use — including model providers — and must be documented in a subprocessor register for APP 8 (cross-border disclosure) purposes.
- Backups and DR replicas: same residency constraint applies to backups, not just primary storage — a backup in a non-assessed region is still a disclosure.

### 6.2 Encryption

- **At rest:** AES-256 for the database (RDS/Cloud SQL native encryption or equivalent), plus field-level encryption for the highest-sensitivity columns (IHI, AHPRA number, `nominee_legal_authority.instrument_reference`, MHR cached documents) using envelope encryption via a cloud KMS — so a raw DB dump/snapshot leak doesn't expose identifiers directly.
- **In transit:** TLS 1.3 minimum for every external and internal (service-to-service) connection; NASH mTLS specifically for HI Service/MHR gateway calls (Section 4.1) — this is layered on top of, not instead of, platform TLS.
- **Secrets:** JWT signing secret, DB credentials, NASH private key all in a managed secrets store (KMS/Secrets Manager), never in `.env`/source — flagging that `middleware/auth.js`'s current fallback (`process.env.JWT_SECRET || 'your-super-secret-key-change-this-in-production'`) is a hard-fail-if-unset item, not a soft default, before production go-live.

### 6.3 Audit logging

- Extend the existing `care_access_audit` pattern (already logs actor, patient, action, scope, outcome, record count) to cover **every** clinical read/write path, not just cross-user care-access reads — including a patient viewing their own record, since the *My Health Records Act 2012* and most state Health Records Acts expect a complete access trail, not just third-party access.
- Audit rows are **immutable** (insert-only table, no UPDATE/DELETE grants at the DB role level) and retained per the applicable state Health Records Act (commonly 7 years from last entry; longer — often to age 25 — where the record relates to care received while the patient was a minor, rare but possible for younger disability-program clients).
- MHR-specific access (Section 4.3) is additionally reportable to the record owner via MHR's own access-history feature — the platform's local audit log is a complement, not a replacement for, MHR's system-level access log.

### 6.4 Retention & deletion

- Clinical data retention follows the relevant state Health Records Act minimum (generally 7 years post last interaction for an adult); do not build a "delete my account" flow that hard-deletes clinical rows within that window — soft-delete/de-identify-after-retention instead, with the distinction surfaced clearly in the Privacy Policy.
- `mhr_document_cache` (Section 4.3) should have its own, shorter TTL — it's a cache of externally-owned data, not the platform's clinical record; re-fetch rather than retain indefinitely, and purge on grant revocation for that patient.

---

## 7. Phased Compliance & Delivery Roadmap

| Phase | Focus | Key deliverables | Depends on |
|---|---|---|---|
| **0 — Foundation hardening** (now) | Close current gaps before adding surface area | Fix `JWT_SECRET` hard-fail; extend `care_access_audit` to all clinical reads; add `authority_tier` distinction on top of existing `care_access_grants` (1.3) | none — pure hardening of what exists |
| **1 — RBAC & Provider role** | Legal nominee model, GP role, Care Manager/org model | `nominee_legal_authority`, `care_provider_links`, `provider_organisation`, `care_organisation_staff`, `resident_roster` tables; PRODA/AHPRA verification flow (mocked initially, real integration in Phase 3) | Phase 0 |
| **2 — Multi-portal UX + escalation** | Split Patient Mode / Family Dashboard / Provider Portal; check-in/vitals/eNRMC/incident screens; threshold + escalation engine | Section 2 navigation trees; `clinical_thresholds`, `clinical_alerts`, `alert_notifications`, `checkin_meals`, `checkin_mobility`; SMS/push wiring via Twilio | Phase 1 (roles), Phase 0 |
| **3 — i18n/CALD** | react-i18next Tier 1 + clinical terminology Tier 2 | `clinical_term_translations`; priority locale pack (Italian, Greek, Vietnamese, Mandarin, Arabic); RTL support | Can run parallel to Phase 2 |
| **4 — Digital health integration** | HI Service, NASH, MHR FHIR Gateway, SMD | IHI/HPI-I/HPI-O resolution (1.2, 1.4); ADHA Conformance accreditation process (start application early — long lead time); `mhr_document_cache`; SMD endpoint via HealthLink/ReferralNet | Phase 1 (identifiers scaffolded), independent accreditation track starts as early as Phase 1 |
| **5 — Sovereignty & security uplift** | IRAP-aligned hosting, KMS envelope encryption, retention automation | Region lock-down, field-level encryption for identifiers, automated retention/purge jobs | Can run parallel to Phases 2–4; must complete before Phase 4 go-live |

---

## 8. Gap Analysis — this repository today vs. target state

| Area | Current state | Gap |
|---|---|---|
| Roles | `users.role IN ('patient','caregiver'[,'admin'])` | No `provider`/`gp` role, no `authority_tier`, no org-scoped staff roles |
| Consent | `care_access_grants` + `care_access_audit` — scoped, expiring, audited (`services/careAccess.js`, `routes/careAccess.js`) | Good foundation; needs `nominee_legal_authority` layered on top, and `ALLOWED_SCOPES` (currently just `checkins:read`) expanded as new domains ship |
| Identifiers | None | No IHI/HPI-I/HPI-O columns anywhere |
| Vitals/Meds/Checkins | `vitals`, `medications`, `checkins`, `appointments` — solid base tables | No AMT/PBS coding, no threshold model, no escalation, no meals/mobility/incident capture |
| Notifications | `services/notification.js` — email-based care-access request notice | No SMS/push channel routing, no alert-severity model (Twilio is already a dependency, unused for alerting) |
| i18n | None in backend or `agecare-frontend-main` | Full Section 5 build required |
| Security | JWT auth (`middleware/auth.js`), rate limiting, helmet | Hard-coded JWT fallback secret must be removed; no field-level encryption; no documented data-residency constraint yet |
| MHR/HI Service | None | Full Section 4 build required, gated on ADHA conformance track |

This gap table is the practical starting checklist — Phase 0/1 items above are the ones with the best risk-reduction-per-effort ratio and should be scheduled first regardless of which user-facing feature ships next.
