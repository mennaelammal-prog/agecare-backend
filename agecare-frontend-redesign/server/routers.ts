import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { legacyRequest } from "./legacyApi";

const tokenInput = z.object({ token: z.string().min(1, "Please sign in to your AgeCare account first.") });
const editableResource = z.enum(["medications", "appointments", "vitals"]);
const consentDuration = z.union([z.literal(1), z.literal(7), z.literal(30), z.literal(90)]);

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  legacy: router({
    login: publicProcedure
      .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
      .mutation(({ input }) => legacyRequest<{ token: string; user: unknown }>("/auth/login", { method: "POST", body: input })),
    register: publicProcedure
      .input(z.object({ fullName: z.string().trim().min(2).max(120), email: z.string().email(), password: z.string().min(6).max(128) }))
      .mutation(({ input }) => legacyRequest<{ token: string; user: unknown }>("/auth/register", {
        method: "POST",
        body: { full_name: input.fullName, email: input.email, password: input.password },
      })),
    profile: publicProcedure
      .input(tokenInput)
      .query(({ input }) => legacyRequest<{ user: unknown }>("/auth/me", { token: input.token })),
    history: publicProcedure
      .input(tokenInput.extend({ limit: z.number().int().min(1).max(100).default(30) }))
      .query(({ input }) => legacyRequest<{ success: boolean; count: number; data: unknown[] }>(`/checkin/history?limit=${input.limit}`, { token: input.token })),
    submitCheckin: publicProcedure
      .input(tokenInput.extend({
        mood: z.number().int().min(1).max(5),
        energy: z.number().int().min(1).max(5),
        pain: z.number().int().min(0).max(10),
        sleepHours: z.number().min(0).max(24).optional(),
        notes: z.string().max(1000).optional(),
      }))
      .mutation(({ input }) => legacyRequest("/checkin", {
        method: "POST",
        token: input.token,
        body: {
          mood: input.mood,
          energy: input.energy,
          pain: input.pain,
          sleep_hours: input.sleepHours,
          notes: input.notes,
        },
      })),
    familyContacts: publicProcedure
      .input(tokenInput)
      .query(({ input }) => legacyRequest<{ success: boolean; count: number; data: unknown[] }>("/family", { token: input.token })),
    addFamilyContact: publicProcedure
      .input(tokenInput.extend({
        name: z.string().trim().min(1).max(120),
        relationship: z.string().trim().min(1).max(80),
        email: z.string().email().optional().or(z.literal("")),
        phone: z.string().trim().max(40).optional(),
        notifyEmail: z.boolean().default(true),
        notifySms: z.boolean().default(false),
      }))
      .mutation(({ input }) => legacyRequest("/family", {
        method: "POST",
        token: input.token,
        body: {
          name: input.name,
          relationship: input.relationship,
          email: input.email || undefined,
          phone: input.phone || undefined,
          notify_email: input.notifyEmail,
          notify_sms: input.notifySms,
        },
      })),
    deleteFamilyContact: publicProcedure
      .input(tokenInput.extend({ id: z.number().int().positive() }))
      .mutation(({ input }) => legacyRequest(`/family/${input.id}`, { method: "DELETE", token: input.token })),
    linkedPatients: publicProcedure
      .input(tokenInput)
      .query(({ input }) => legacyRequest<{ success: boolean; count: number; data: unknown[] }>("/family/link/linked", { token: input.token })),
    linkPatient: publicProcedure
      .input(tokenInput.extend({ patientEmail: z.string().email(), relationship: z.string().trim().max(80).optional() }))
      .mutation(({ input }) => legacyRequest("/family/link/link", {
        method: "POST",
        token: input.token,
        body: { patient_email: input.patientEmail, relationship: input.relationship || "Family" },
      })),
    medications: publicProcedure
      .input(tokenInput)
      .query(({ input }) => legacyRequest<{ success: boolean; count: number; data: unknown[] }>("/medications", { token: input.token })),
    appointments: publicProcedure
      .input(tokenInput)
      .query(({ input }) => legacyRequest<{ success: boolean; count: number; data: unknown[] }>("/appointments", { token: input.token })),
    vitals: publicProcedure
      .input(tokenInput)
      .query(({ input }) => legacyRequest<{ success: boolean; count: number; data: unknown[] }>("/vitals", { token: input.token })),
    saveRecord: publicProcedure
      .input(tokenInput.extend({
        resource: editableResource,
        id: z.number().int().positive().optional(),
        values: z.record(z.string(), z.unknown()),
      }))
      .mutation(({ input }) => legacyRequest(`/${input.resource}${input.id ? `/${input.id}` : ""}`, {
        method: input.id ? "PUT" : "POST",
        token: input.token,
        body: input.values,
      })),
    deleteRecord: publicProcedure
      .input(tokenInput.extend({ resource: editableResource, id: z.number().int().positive() }))
      .mutation(({ input }) => legacyRequest(`/${input.resource}/${input.id}`, { method: "DELETE", token: input.token })),
    chat: publicProcedure
      .input(tokenInput.extend({
        message: z.string().trim().min(1).max(2_000),
        history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2_000) })).max(30).default([]),
      }))
      .mutation(({ input }) => legacyRequest<{ success: boolean; data: { response: string } }>("/chat", {
        method: "POST",
        token: input.token,
        body: { message: input.message, history: input.history },
      })),
    // Consent-based shared-history access. Proxies the backend's
    // /api/care-access/* routes (routes/careAccess.js) -- a scoped, expiring,
    // auditable grant flow that is entirely separate from the plain address-book
    // links under legacy.linkPatient above. See CareConnections.tsx, which
    // presents both concepts as one guided "connect with someone" flow.
    careAccess: router({
      // Fired by a caregiver: asks a patient (by their registered email) for
      // permission to view their check-in history. Creates or refreshes a
      // 'pending' grant on the backend -- it does not grant access by itself.
      requestAccess: publicProcedure
        .input(tokenInput.extend({ patientEmail: z.string().email(), relationship: z.string().trim().max(80).optional() }))
        .mutation(({ input }) => legacyRequest<{ success: boolean; message: string }>("/care-access/requests", {
          method: "POST",
          token: input.token,
          body: { patient_email: input.patientEmail, relationship: input.relationship || "Family" },
        })),
      // Patient-side: requests other people have sent that are still awaiting
      // a decision.
      incomingRequests: publicProcedure
        .input(tokenInput)
        .query(({ input }) => legacyRequest<{ success: boolean; count: number; data: unknown[] }>("/care-access/incoming", { token: input.token })),
      // Patient-side: approves a pending request for a chosen number of days.
      // The backend only allows the patient the grant belongs to to do this.
      approveRequest: publicProcedure
        .input(tokenInput.extend({ grantId: z.number().int().positive(), expiresInDays: consentDuration }))
        .mutation(({ input }) => legacyRequest("/care-access/" + input.grantId + "/approve", {
          method: "POST",
          token: input.token,
          body: { scopes: ["checkins:read"], expires_in_days: input.expiresInDays },
        })),
      // Patient-side: declines a pending request, or ends an active grant.
      // Same backend endpoint does both -- it accepts 'pending' or 'active'.
      revokeGrant: publicProcedure
        .input(tokenInput.extend({ grantId: z.number().int().positive() }))
        .mutation(({ input }) => legacyRequest("/care-access/" + input.grantId + "/revoke", { method: "POST", token: input.token })),
      // Patient-side: everyone currently holding active access to your history.
      patientGrants: publicProcedure
        .input(tokenInput)
        .query(({ input }) => legacyRequest<{ success: boolean; count: number; data: unknown[] }>("/care-access/patient-grants", { token: input.token })),
      // Caregiver-side: the patients who have approved you, with each grant's
      // expiry -- this is what unlocks "View shared history" below.
      myGrants: publicProcedure
        .input(tokenInput)
        .query(({ input }) => legacyRequest<{ success: boolean; count: number; data: unknown[] }>("/care-access/grants", { token: input.token })),
      // Caregiver-side: the scoped check-in history for one active grant.
      sharedHistory: publicProcedure
        .input(tokenInput.extend({ grantId: z.number().int().positive(), limit: z.number().int().min(1).max(50).default(30) }))
        .query(({ input }) => legacyRequest<{ success: boolean; count: number; data: unknown[] }>(
          "/care-access/grants/" + input.grantId + "/checkins?limit=" + input.limit,
          { token: input.token },
        )),
    }),
    // Reminder push notifications: proxies the backend's /api/push/* routes
    // (routes/push.js). The backend only turns these on once VAPID keys are
    // configured (VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY on Render) -- until
    // then vapidPublicKey/test return a "not configured" error the client
    // treats as "reminders aren't set up yet" rather than a hard failure.
    push: router({
      vapidPublicKey: publicProcedure
        .input(tokenInput)
        .query(({ input }) => legacyRequest<{ success: boolean; publicKey: string }>("/push/vapid-public-key", { token: input.token })),
      subscribe: publicProcedure
        .input(tokenInput.extend({
          endpoint: z.string().url(),
          keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
        }))
        .mutation(({ input }) => legacyRequest("/push/subscribe", {
          method: "POST",
          token: input.token,
          body: { endpoint: input.endpoint, keys: input.keys },
        })),
      unsubscribe: publicProcedure
        .input(tokenInput.extend({ endpoint: z.string().url() }))
        .mutation(({ input }) => legacyRequest("/push/unsubscribe", {
          method: "POST",
          token: input.token,
          body: { endpoint: input.endpoint },
        })),
      preferences: publicProcedure
        .input(tokenInput)
        .query(({ input }) => legacyRequest<{
          success: boolean;
          data: {
            timezone: string;
            checkin_reminder_time: string;
            checkin_reminder_enabled: boolean;
            medication_reminders_enabled: boolean;
            appointment_reminders_enabled: boolean;
            missed_checkin_alerts_enabled: boolean;
            vital_alerts_enabled: boolean;
            notifiable_family_contact_count: number;
            push_configured: boolean;
            device_count: number;
          };
        }>("/push/preferences", { token: input.token })),
      updatePreferences: publicProcedure
        .input(tokenInput.extend({
          checkinReminderTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
          checkinReminderEnabled: z.boolean().optional(),
          medicationRemindersEnabled: z.boolean().optional(),
          appointmentRemindersEnabled: z.boolean().optional(),
          missedCheckinAlertsEnabled: z.boolean().optional(),
          vitalAlertsEnabled: z.boolean().optional(),
          timezone: z.string().min(1).max(80).optional(),
        }))
        .mutation(({ input }) => legacyRequest("/push/preferences", {
          method: "PUT",
          token: input.token,
          body: {
            checkin_reminder_time: input.checkinReminderTime,
            checkin_reminder_enabled: input.checkinReminderEnabled,
            medication_reminders_enabled: input.medicationRemindersEnabled,
            appointment_reminders_enabled: input.appointmentRemindersEnabled,
            missed_checkin_alerts_enabled: input.missedCheckinAlertsEnabled,
            vital_alerts_enabled: input.vitalAlertsEnabled,
            timezone: input.timezone,
          },
        })),
      test: publicProcedure
        .input(tokenInput)
        .mutation(({ input }) => legacyRequest<{ success: boolean; sent: number; total: number }>("/push/test", { method: "POST", token: input.token })),
    }),
    // One-tap emergency alert -- proxies POST /api/sos (routes/sos.js). Not
    // gated behind any opt-in preference the way the reminder toggles above
    // are: pressing "I need help" is itself the explicit request.
    sos: router({
      trigger: publicProcedure
        .input(tokenInput)
        .mutation(({ input }) => legacyRequest<{ success: boolean; contactsNotified: number }>("/sos", { method: "POST", token: input.token })),
    }),
  }),
});

export type AppRouter = typeof appRouter;
