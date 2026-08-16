import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { legacyRequest } from "./legacyApi";

const tokenInput = z.object({ token: z.string().min(1, "Please sign in to your AgeCare account first.") });
const editableResource = z.enum(["medications", "appointments", "vitals"]);

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
  }),
});

export type AppRouter = typeof appRouter;
