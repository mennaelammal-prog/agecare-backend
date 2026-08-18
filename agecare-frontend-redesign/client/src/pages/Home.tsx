/**
 * AgeCare — Heirloom Journal design system.
 * This page uses an editorial desk layout, high-legibility controls, and calm reflective moments.
 */
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  Bell,
  BookHeart,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Copy,
  Globe2,
  HeartHandshake,
  History,
  House,
  LogOut,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Pill,
  Plus,
  Settings,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Sun,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { ChatModule, HistoryModule, LegacyLoginModal, LiveCheckin, ResourceModule } from "@/components/LegacyCareModules";
import { CareConnections } from "@/components/CareConnections";
import { ReminderSettings } from "@/components/ReminderSettings";
import { AlarmOverlay } from "@/components/AlarmOverlay";
import { AccessibilitySettings } from "@/components/AccessibilitySettings";
import { SOSButton } from "@/components/SOSButton";
import { useLanguage } from "@/contexts/LanguageContext";

// The original export referenced /manus-storage/... image assets (hero photo,
// reflection photo, logo mark) hosted on Manus's own storage -- none of those
// files were included in the project export, and there was no local
// equivalent (see the CSS-only gradient fallbacks still on .hero-photo,
// .reflection-photo, and .agecare-app's background in index.css, used if
// these fail to load). These are AI-generated replacements matching the
// Heirloom Journal brief. All three (hero photo, reflection photo, and the
// logo mark) are now self-hosted in client/public/images/ -- the user
// downloaded them from the generation CDN and uploaded them via GitHub's
// web UI, since the session that generated them couldn't reach that CDN
// itself, only the link to it. No external image host is depended on
// anymore.
const heroImage = "/images/hero-journal.png";
const reflectionImage = "/images/reflection-window.png";
const logo = "/images/day-marker-logo.png";

const navGroups = [
  {
    label: "Today",
    items: [{ id: "today", label: "Day at a glance", icon: House }],
  },
  {
    label: "My care",
    items: [
      { id: "check-in", label: "Daily check-in", icon: ClipboardCheck },
      { id: "medications", label: "Medications", icon: Pill },
      { id: "appointments", label: "Appointments", icon: CalendarDays },
      { id: "vitals", label: "Vital signs", icon: Activity },
      { id: "chat", label: "Care chat", icon: MessageCircle },
    ],
  },
  {
    label: "Together",
    items: [
      { id: "connections", label: "Care Connections", icon: UsersRound },
      { id: "history", label: "Care history", icon: History },
    ],
  },
];

const reflections = [
  {
    theme: "On the path",
    quote:
      "Let yourself be silently drawn by the strange pull of what you truly love. It will never lead you astray.",
  },
  {
    theme: "On stillness",
    quote: "The quiet mind hears what the noisy world tries to drown out.",
  },
  {
    theme: "On renewal",
    quote: "Don’t grieve. Anything you lose comes round in another form.",
  },
  {
    theme: "On inner light",
    quote: "You were born with wings, why prefer to crawl through life?",
  },
];

const moduleCopy: Record<
  string,
  { eyebrow: string; title: string; copy: string; action: string; detail: string }
> = {
  "check-in": {
    eyebrow: "A few moments for you",
    title: "How are you feeling today?",
    copy: "A short daily note can make it easier to notice patterns and prepare for the conversations that matter.",
    action: "Save today’s check-in",
    detail: "Choose the words that best match the day. You can add a note whenever you are ready.",
  },
  medications: {
    eyebrow: "Medication routines",
    title: "Keep a calm record of your medicines.",
    copy: "Add a medicine, choose a reminder time, and keep the details together in one clear place.",
    action: "Add a medication",
    detail: "No reminder is selected in this preview. Adding one will place it in your day-at-a-glance plan.",
  },
  appointments: {
    eyebrow: "Looking ahead",
    title: "Make room for the appointments that matter.",
    copy: "Keep visit details, preparation notes, and reminders close to your everyday care routine.",
    action: "Plan an appointment",
    detail: "There is nothing scheduled in this preview. A new appointment will appear in this calm, easy-to-scan timeline.",
  },
  vitals: {
    eyebrow: "A clear record",
    title: "Notice your vital signs without losing the bigger picture.",
    copy: "Record readings with helpful context and bring the history into conversations with your care team.",
    action: "Record a reading",
    detail: "Use clear labels and dates; status language should always be discussed with a qualified clinician when needed.",
  },
  chat: {
    eyebrow: "A gentle place to ask",
    title: "Start a care conversation.",
    copy: "Use the care chat to organize a question, reflect on your day, or prepare what you want to discuss with someone you trust.",
    action: "Open care chat",
    detail: "In a connected version, this area can retain your message history and route urgent concerns to the right support channel.",
  },
  history: {
    eyebrow: "Your record over time",
    title: "Find the pattern, not just the number.",
    copy: "Review check-ins, care notes, and entries in a calm chronological record that remains easy to bring to an appointment.",
    action: "View recent entries",
    detail: "Your first saved check-in becomes the beginning of a clearer care story.",
  },
};

const moodOptions = [
  { label: "Low", icon: "◔" },
  { label: "Tender", icon: "◑" },
  { label: "Steady", icon: "◒" },
  { label: "Bright", icon: "◕" },
  { label: "Energized", icon: "◉" },
];

// Both the topline "Friday, August 14" and the "AUG / 14" date-stamp badge
// were hardcoded literal strings -- never actually computed from the real
// date, so they always showed the same fixed day regardless of when the
// page was opened. These read the browser's current local date instead.
function formatTodayLong(date = new Date()): string {
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

function formatDateStamp(date = new Date()): { month: string; day: number } {
  return { month: date.toLocaleDateString(undefined, { month: "short" }).toUpperCase(), day: date.getDate() };
}

export default function Home() {
  const { language, setLanguage, t } = useLanguage();
  const initialAuthMode = new URLSearchParams(window.location.search).get("auth") === "register" ? "register" : "sign-in";
  const [active, setActive] = useState("today");
  const [menuOpen, setMenuOpen] = useState(false);
  const [mood, setMood] = useState<number | null>(null);
  const [checkInSaved, setCheckInSaved] = useState(false);
  const [reflectionIndex, setReflectionIndex] = useState(0);
  const [savedReflection, setSavedReflection] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [legacyToken, setLegacyToken] = useState(() => window.localStorage.getItem("agecare-legacy-token") ?? "");
  const [legacyUserName, setLegacyUserName] = useState(() => window.localStorage.getItem("agecare-legacy-user") ?? "");
  const [loginOpen, setLoginOpen] = useState(() => new URLSearchParams(window.location.search).has("auth"));
  const [accountMode, setAccountMode] = useState<"sign-in" | "register">(initialAuthMode);
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [expandedGrantId, setExpandedGrantId] = useState<number | null>(null);
  const [actionPendingId, setActionPendingId] = useState<number | null>(null);
  const legacyUtils = trpc.useUtils();
  const legacyInput = { token: legacyToken || "not-connected" };
  const historyQuery = trpc.legacy.history.useQuery({ ...legacyInput, limit: 30 }, { enabled: Boolean(legacyToken), retry: false });
  const contactsQuery = trpc.legacy.familyContacts.useQuery(legacyInput, { enabled: Boolean(legacyToken), retry: false });
  const patientsQuery = trpc.legacy.linkedPatients.useQuery(legacyInput, { enabled: Boolean(legacyToken), retry: false });
  const medicationsQuery = trpc.legacy.medications.useQuery(legacyInput, { enabled: Boolean(legacyToken) && active === "medications", retry: false });
  const appointmentsQuery = trpc.legacy.appointments.useQuery(legacyInput, { enabled: Boolean(legacyToken) && active === "appointments", retry: false });
  const vitalsQuery = trpc.legacy.vitals.useQuery(legacyInput, { enabled: Boolean(legacyToken) && active === "vitals", retry: false });
  const incomingRequestsQuery = trpc.legacy.careAccess.incomingRequests.useQuery(legacyInput, { enabled: Boolean(legacyToken) && active === "connections", retry: false });
  const patientGrantsQuery = trpc.legacy.careAccess.patientGrants.useQuery(legacyInput, { enabled: Boolean(legacyToken) && active === "connections", retry: false });
  const myGrantsQuery = trpc.legacy.careAccess.myGrants.useQuery(legacyInput, { enabled: Boolean(legacyToken) && active === "connections", retry: false });
  const sharedHistoryQuery = trpc.legacy.careAccess.sharedHistory.useQuery(
    { ...legacyInput, grantId: expandedGrantId ?? 0, limit: 30 },
    { enabled: Boolean(legacyToken) && expandedGrantId !== null, retry: false },
  );
  function connectLegacyAccount(result: { token: string; user?: unknown }, message: string) {
    const user = result.user as { name?: string; full_name?: string; email?: string } | undefined;
    const name = user?.name || user?.full_name || user?.email || "Your AgeCare account";
    window.localStorage.setItem("agecare-legacy-token", result.token);
    window.localStorage.setItem("agecare-legacy-user", name);
    setLegacyToken(result.token);
    setLegacyUserName(name);
    setLoginOpen(false);
    toast(message);
  }
  const loginMutation = trpc.legacy.login.useMutation({
    onSuccess: (result) => connectLegacyAccount(result, "Your existing AgeCare services are now connected."),
    onError: (error) => toast(error.message || "We could not sign in to AgeCare."),
  });
  const registerMutation = trpc.legacy.register.useMutation({
    onSuccess: (result) => connectLegacyAccount(result, "Your new AgeCare account is ready to use."),
    onError: (error) => toast(error.message || "We could not create your AgeCare account."),
  });
  const checkinMutation = trpc.legacy.submitCheckin.useMutation({
    onSuccess: async () => {
      await legacyUtils.legacy.history.invalidate();
      toast("Your check-in has been saved to AgeCare.");
      setActive("history");
    },
    onError: (error) => toast(error.message || "We could not save this check-in."),
  });
  const linkMutation = trpc.legacy.linkPatient.useMutation({
    onSuccess: async () => {
      await legacyUtils.legacy.linkedPatients.invalidate();
      await legacyUtils.legacy.familyContacts.invalidate();
      toast("The patient link has been created.");
    },
    onError: (error) => toast(error.message || "We could not create that patient link."),
  });
  const familyContactMutation = trpc.legacy.addFamilyContact.useMutation();
  const deleteFamilyContactMutation = trpc.legacy.deleteFamilyContact.useMutation();
  const recordMutation = trpc.legacy.saveRecord.useMutation();
  const deleteRecordMutation = trpc.legacy.deleteRecord.useMutation();
  const chatMutation = trpc.legacy.chat.useMutation();
  const requestAccessMutation = trpc.legacy.careAccess.requestAccess.useMutation();
  const approveMutation = trpc.legacy.careAccess.approveRequest.useMutation();
  const revokeMutation = trpc.legacy.careAccess.revokeGrant.useMutation();
  const localizedNavGroups = [
    { label: t("today"), items: [{ id: "today", label: t("dayAtAGlance"), icon: House }] },
    { label: t("myCare"), items: [{ id: "check-in", label: t("dailyCheckin"), icon: ClipboardCheck }, { id: "medications", label: t("medications"), icon: Pill }, { id: "appointments", label: t("appointments"), icon: CalendarDays }, { id: "vitals", label: t("vitalSigns"), icon: Activity }, { id: "chat", label: t("careChat"), icon: MessageCircle }] },
    { label: t("together"), items: [{ id: "connections", label: t("careConnections"), icon: UsersRound }, { id: "history", label: t("careHistory"), icon: History }] },
  ];

  const activeItem = localizedNavGroups
    .flatMap((group) => group.items)
    .find((item) => item.id === active);
  const reflection = reflections[reflectionIndex];

  function selectNav(id: string) {
    setActive(id);
    setMenuOpen(false);
  }

  function openAccount(mode: "sign-in" | "register" = "sign-in") {
    setAccountMode(mode);
    setLoginOpen(true);
  }

  function saveCheckIn() {
    if (!legacyToken) {
      openAccount();
      toast("Sign in to your existing AgeCare account to save care data.");
      return;
    }
    setActive("check-in");
  }

  function submitLegacyCheckin(payload: { mood: number; energy: number; pain: number; sleepHours?: number; notes?: string }) {
    checkinMutation.mutate({ ...legacyInput, ...payload });
  }

  function submitLegacyLogin(email: string, password: string) {
    loginMutation.mutate({ email, password });
  }

  function disconnectLegacyAccount() {
    window.localStorage.removeItem("agecare-legacy-token");
    window.localStorage.removeItem("agecare-legacy-user");
    setLegacyToken("");
    setLegacyUserName("");
    toast("Your AgeCare connection has been removed from this browser.");
  }

  async function refreshResource(resource: "medications" | "appointments" | "vitals") {
    if (resource === "medications") await legacyUtils.legacy.medications.invalidate();
    if (resource === "appointments") await legacyUtils.legacy.appointments.invalidate();
    if (resource === "vitals") await legacyUtils.legacy.vitals.invalidate();
  }

  async function saveResource(resource: "medications" | "appointments" | "vitals", id: number | undefined, values: Record<string, string>) {
    try {
      await recordMutation.mutateAsync({ ...legacyInput, resource, ...(id ? { id } : {}), values });
      await refreshResource(resource);
      toast(id ? "Your AgeCare record has been updated." : "Your AgeCare record has been added.");
      return true;
    } catch (error) {
      toast(error instanceof Error ? error.message : "We could not save this record.");
      return false;
    }
  }

  async function deleteResource(resource: "medications" | "appointments" | "vitals", id: number) {
    try {
      await deleteRecordMutation.mutateAsync({ ...legacyInput, resource, id });
      await refreshResource(resource);
      toast("The AgeCare record has been removed.");
      return true;
    } catch (error) {
      toast(error instanceof Error ? error.message : "We could not remove this record.");
      return false;
    }
  }

  function sendChat(message: string) {
    const history = chatMessages;
    setChatMessages((current) => [...current, { role: "user", content: message }]);
    chatMutation.mutate({ ...legacyInput, message, history }, {
      onSuccess: (result) => setChatMessages((current) => [...current, { role: "assistant", content: result.data.response }]),
      onError: (error) => setChatMessages((current) => [...current, { role: "assistant", content: error.message || "Sorry, the care chat could not respond right now." }]),
    });
  }

  async function addFamilyContact(values: { name: string; relationship: string; email?: string; phone?: string; notifyEmail: boolean; notifySms: boolean }) {
    try {
      await familyContactMutation.mutateAsync({ ...legacyInput, ...values });
      await legacyUtils.legacy.familyContacts.invalidate();
      toast("The family contact has been added to AgeCare.");
      return true;
    } catch (error) {
      toast(error instanceof Error ? error.message : "We could not save this family contact.");
      return false;
    }
  }

  async function removeFamilyContact(id: number) {
    try {
      await deleteFamilyContactMutation.mutateAsync({ ...legacyInput, id });
      await legacyUtils.legacy.familyContacts.invalidate();
      toast("The family contact has been removed from AgeCare.");
      return true;
    } catch (error) {
      toast(error instanceof Error ? error.message : "We could not remove this family contact.");
      return false;
    }
  }

  // "Connect with someone" performs two independent actions: add them as a
  // contact, and ask for permission to view their care history. Either can
  // fail without blocking the other -- a failed link (e.g. already linked)
  // should not stop the access request from going out.
  async function connectWithPatient(patientEmail: string, relationship: string) {
    let linkOk = true;
    try {
      await linkMutation.mutateAsync({ ...legacyInput, patientEmail, relationship });
    } catch {
      linkOk = false;
    }
    try {
      await requestAccessMutation.mutateAsync({ ...legacyInput, patientEmail, relationship });
      await legacyUtils.legacy.careAccess.myGrants.invalidate();
      toast(linkOk ? "Contact added, and a care-access request has been sent." : "A care-access request has been sent.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "We could not send that care-access request.");
    }
  }

  async function approveRequest(grantId: number, days: 1 | 7 | 30 | 90) {
    setActionPendingId(grantId);
    try {
      await approveMutation.mutateAsync({ ...legacyInput, grantId, expiresInDays: days });
      await legacyUtils.legacy.careAccess.incomingRequests.invalidate();
      await legacyUtils.legacy.careAccess.patientGrants.invalidate();
      toast("Access approved.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "We could not approve that request.");
    } finally {
      setActionPendingId(null);
    }
  }

  // Declines a pending request or ends an active grant -- the backend uses
  // the same endpoint for both.
  async function declineOrRevokeGrant(grantId: number) {
    setActionPendingId(grantId);
    try {
      await revokeMutation.mutateAsync({ ...legacyInput, grantId });
      await legacyUtils.legacy.careAccess.incomingRequests.invalidate();
      await legacyUtils.legacy.careAccess.patientGrants.invalidate();
      toast("Access removed.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "We could not update that request.");
    } finally {
      setActionPendingId(null);
    }
  }

  function toggleSharedHistory(grantId: number) {
    setExpandedGrantId((current) => (current === grantId ? null : grantId));
  }

  function changeReflection(direction: number) {
    setReflectionIndex((current) => (current + direction + reflections.length) % reflections.length);
    setSavedReflection(false);
  }

  async function copyReflection() {
    try {
      await navigator.clipboard.writeText(reflection.quote);
      toast("Reflection copied to your clipboard.");
    } catch {
      toast("Copy is not available in this browser view.");
    }
  }

  return (
    <div className="agecare-app">
      <AlarmOverlay />
      {legacyToken && <SOSButton token={legacyToken} />}
      <aside className="sidebar" aria-label={t("primaryNavigation")}>
        <div className="brand-lockup">
          <img src={logo} alt="AgeCare" className="brand-mark" />
          <div>
            <span className="brand-name">AgeCare</span>
            <span className="brand-tagline">{t("dailyCompanion")}</span>
          </div>
        </div>

        <nav className="nav-stack">
          {localizedNavGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p className="nav-label">{group.label}</p>
              {group.items.map((item) => {
                const Icon = item.icon;
                const selected = active === item.id;
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={`nav-item ${selected ? "is-active" : ""}`}
                    onClick={() => selectNav(item.id)}
                    aria-current={selected ? "page" : undefined}
                  >
                    <Icon size={18} strokeWidth={selected ? 2.2 : 1.8} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="profile-chip">
            <span className="profile-avatar" aria-hidden="true">A</span>
            <span>
              <strong>{legacyUserName || t("yourCareSpace")}</strong>
              <small>{legacyToken ? t("connected") : t("privateAndPersonal")}</small>
            </span>
            <MoreHorizontal size={18} aria-hidden="true" />
          </div>
          <button type="button" className="quiet-link" onClick={() => openAccount()}>
            <Settings size={17} /> {legacyToken ? t("accountConnection") : t("connectAgeCare")}
          </button>
          <button type="button" className="quiet-link" onClick={legacyToken ? disconnectLegacyAccount : () => openAccount()}>
            <LogOut size={17} /> {legacyToken ? t("disconnect") : t("signIn")}
          </button>
        </div>
      </aside>

      <header className="mobile-bar">
        <div className="brand-lockup">
          <img src={logo} alt="AgeCare" className="brand-mark" />
          <span className="brand-name">AgeCare</span>
        </div>
        <button className="icon-button" type="button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Open navigation">
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>

      {menuOpen && (
        <nav className="mobile-nav" aria-label="Mobile primary navigation">
          {localizedNavGroups.flatMap((group) => group.items).map((item) => {
            const Icon = item.icon;
            return (
              <button type="button" className={`nav-item ${active === item.id ? "is-active" : ""}`} key={item.id} onClick={() => selectNav(item.id)}>
                <Icon size={18} /> {item.label}
              </button>
            );
          })}

          {/* The sidebar's account chip and "Account connection" / "Disconnect"
              links live in .sidebar-foot, which is part of <aside
              className="sidebar">, entirely hidden below 820px. Without this,
              there was no way to see connection status or sign out on
              mobile at all -- repeating it here instead of duplicating the
              sidebar markup as a whole. */}
          <div className="mobile-nav-foot">
            <div className="profile-chip">
              <span className="profile-avatar" aria-hidden="true">A</span>
              <span>
                <strong>{legacyUserName || t("yourCareSpace")}</strong>
                <small>{legacyToken ? t("connected") : t("privateAndPersonal")}</small>
              </span>
              <MoreHorizontal size={18} aria-hidden="true" />
            </div>
            <button type="button" className="quiet-link" onClick={() => { setMenuOpen(false); openAccount(); }}>
              <Settings size={17} /> {legacyToken ? t("accountConnection") : t("connectAgeCare")}
            </button>
            <button
              type="button"
              className="quiet-link"
              onClick={() => { setMenuOpen(false); legacyToken ? disconnectLegacyAccount() : openAccount(); }}
            >
              <LogOut size={17} /> {legacyToken ? t("disconnect") : t("signIn")}
            </button>
          </div>
        </nav>
      )}

      {/*
        dir="ltr" is pinned here deliberately. Only the nav/account chrome
        (sidebar, login modal, language picker) is actually translated via
        t() -- everything rendered inside <main> (TodayView, check-in,
        history, Care Connections, medications/appointments/vitals, chat)
        is still hardcoded English. Without this, switching to Arabic
        applies the browser's RTL bidi algorithm to that English text and
        garbles punctuation/word order (e.g. a trailing "." moves to the
        front of the sentence). This keeps that content readable until it's
        actually translated -- it does not translate it. The sidebar's RTL
        mirroring (index.css, :root[dir="rtl"] rules) is unaffected since
        those rules key off the <html> element's dir, not this one.
      */}
      <main className="content-shell" dir="ltr">
        <div className="topline">
          <div>
            <p className="eyebrow"><Sun size={15} /> {formatTodayLong()}</p>
            <h1>{active === "today" ? "A clear view of today." : activeItem?.label}</h1>
          </div>
          <div className="top-actions">
            <label className="language-select">
              <Globe2 size={16} aria-hidden="true" />
              <span className="sr-only">{t("language")}</span>
              <select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)} aria-label={t("language")}>
                <option value="en">{t("english")}</option>
                <option value="ar">{t("arabic")}</option>
                <option value="es">{t("spanish")}</option>
                <option value="zh">{t("chinese")}</option>
                <option value="vi">{t("vietnamese")}</option>
              </select>
            </label>
            <AccessibilitySettings />
            <button type="button" className="notification-button" onClick={() => setNoticeOpen(!noticeOpen)} aria-label="Open notifications">
              <Bell size={20} />
              <span className="notification-dot" />
            </button>
            <Button className="primary-action" onClick={legacyToken ? () => selectNav("check-in") : () => openAccount()}>
              {legacyToken ? <><Plus size={18} /> {t("dailyCheckin")}</> : <><ShieldCheck size={18} /> {t("connectAgeCare")}</>}
            </Button>
          </div>
          {noticeOpen && (
            <div className="notice-popover" role="status">
              {legacyToken ? (
                <>
                  <div className="notice-status">
                    <ShieldCheck size={18} />
                    <span><strong>AgeCare is connected.</strong> Your live care records can load here.</span>
                  </div>
                  <ReminderSettings token={legacyToken} />
                </>
              ) : (
                <div className="notice-status">
                  <ShieldCheck size={18} />
                  <span><strong>Connect your existing account.</strong> Your health information remains hidden until you sign in.</span>
                </div>
              )}
            </div>
          )}
        </div>

        {active === "today" ? (
          <TodayView
            checkInSaved={checkInSaved}
            mood={mood}
            reflection={reflection}
            reflectionIndex={reflectionIndex}
            savedReflection={savedReflection}
            onMoodChange={setMood}
            onSaveCheckIn={saveCheckIn}
            onNavigate={selectNav}
            onReflectionChange={changeReflection}
            onSaveReflection={() => {
              setSavedReflection(!savedReflection);
              toast(savedReflection ? "Removed from your saved reflections." : "Reflection saved for later.");
            }}
            onCopyReflection={copyReflection}
          />
        ) : active === "check-in" ? (
          <LiveCheckin
            connected={Boolean(legacyToken)}
            initialMood={mood}
            isSaving={checkinMutation.isPending}
            onConnect={() => setLoginOpen(true)}
            onSave={submitLegacyCheckin}
          />
        ) : active === "history" ? (
          <HistoryModule
            connected={Boolean(legacyToken)}
            entries={historyQuery.data?.data ?? []}
            loading={historyQuery.isLoading}
            error={historyQuery.error?.message}
            onConnect={() => setLoginOpen(true)}
          />
        ) : active === "connections" ? (
          <CareConnections
            connected={Boolean(legacyToken)}
            onConnect={() => setLoginOpen(true)}
            contacts={contactsQuery.data?.data ?? []}
            contactsLoading={contactsQuery.isLoading}
            contactsError={contactsQuery.error?.message}
            savingContact={familyContactMutation.isPending}
            deletingContact={deleteFamilyContactMutation.isPending}
            onAddContact={addFamilyContact}
            onDeleteContact={removeFamilyContact}
            incomingRequests={incomingRequestsQuery.data?.data ?? []}
            incomingLoading={incomingRequestsQuery.isLoading}
            incomingError={incomingRequestsQuery.error?.message}
            patientGrants={patientGrantsQuery.data?.data ?? []}
            patientGrantsLoading={patientGrantsQuery.isLoading}
            patientGrantsError={patientGrantsQuery.error?.message}
            myGrants={myGrantsQuery.data?.data ?? []}
            myGrantsLoading={myGrantsQuery.isLoading}
            myGrantsError={myGrantsQuery.error?.message}
            requesting={linkMutation.isPending || requestAccessMutation.isPending}
            actionPendingId={actionPendingId}
            onConnectWithPatient={connectWithPatient}
            onApprove={approveRequest}
            onDecline={declineOrRevokeGrant}
            expandedGrantId={expandedGrantId}
            onToggleHistory={toggleSharedHistory}
            sharedHistoryEntries={sharedHistoryQuery.data?.data ?? []}
            sharedHistoryLoading={sharedHistoryQuery.isLoading}
            sharedHistoryError={sharedHistoryQuery.error?.message}
          />
        ) : active === "medications" ? (
          <ResourceModule connected={Boolean(legacyToken)} resource="medications" records={medicationsQuery.data?.data ?? []} loading={medicationsQuery.isLoading} error={medicationsQuery.error?.message} saving={recordMutation.isPending} deleting={deleteRecordMutation.isPending} onConnect={() => setLoginOpen(true)} onSave={saveResource} onDelete={deleteResource} />
        ) : active === "appointments" ? (
          <ResourceModule connected={Boolean(legacyToken)} resource="appointments" records={appointmentsQuery.data?.data ?? []} loading={appointmentsQuery.isLoading} error={appointmentsQuery.error?.message} saving={recordMutation.isPending} deleting={deleteRecordMutation.isPending} onConnect={() => setLoginOpen(true)} onSave={saveResource} onDelete={deleteResource} />
        ) : active === "vitals" ? (
          <ResourceModule connected={Boolean(legacyToken)} resource="vitals" records={vitalsQuery.data?.data ?? []} loading={vitalsQuery.isLoading} error={vitalsQuery.error?.message} saving={recordMutation.isPending} deleting={deleteRecordMutation.isPending} onConnect={() => setLoginOpen(true)} onSave={saveResource} onDelete={deleteResource} />
        ) : active === "chat" ? (
          <ChatModule connected={Boolean(legacyToken)} messages={chatMessages} pending={chatMutation.isPending} onConnect={() => setLoginOpen(true)} onSend={sendChat} />
        ) : (
          <CareModule
            module={moduleCopy[active]}
            moduleName={activeItem?.label ?? "Care"}
            mood={mood}
            onMoodChange={setMood}
            onAction={() => toast(`${moduleCopy[active]?.action ?? "This action"} is ready to connect to your existing AgeCare service.`)}
          />
        )}
      </main>
      {loginOpen && <LegacyLoginModal loading={loginMutation.isPending || registerMutation.isPending} onClose={() => setLoginOpen(false)} onSubmit={submitLegacyLogin} onRegister={(fullName, email, password) => registerMutation.mutate({ fullName, email, password })} initialMode={accountMode} />}
    </div>
  );
}

function TodayView({
  checkInSaved,
  mood,
  reflection,
  reflectionIndex,
  savedReflection,
  onMoodChange,
  onSaveCheckIn,
  onNavigate,
  onReflectionChange,
  onSaveReflection,
  onCopyReflection,
}: {
  checkInSaved: boolean;
  mood: number | null;
  reflection: (typeof reflections)[number];
  reflectionIndex: number;
  savedReflection: boolean;
  onMoodChange: (value: number) => void;
  onSaveCheckIn: () => void;
  onNavigate: (id: string) => void;
  onReflectionChange: (direction: number) => void;
  onSaveReflection: () => void;
  onCopyReflection: () => void;
}) {
  return (
    <div className="today-layout">
      <section className="hero-panel">
        <div className="hero-copy">
          <span className="chapter-marker"><span /> Chapter 08 · Today</span>
          <h2>Care, arranged around your life.</h2>
          <p>Start with one small moment for yourself. Your day, your routines, and your circle are all held here with care.</p>
          <div className="hero-actions">
            <Button className="primary-action" onClick={() => onNavigate("check-in")}>
              Begin today’s check-in <ChevronRight size={18} />
            </Button>
            <button className="text-action" type="button" onClick={() => onNavigate("history")}>View your care history</button>
          </div>
        </div>
        <div className="hero-photo-wrap">
          <img src={heroImage} alt="A calm desk with a wellness journal, tea, and botanical stem" className="hero-photo" />
          <span className="photo-caption">A little room to breathe</span>
        </div>
      </section>

      <div className="today-columns">
        <div className="main-column">
          <section className="section-heading">
            <div>
              <p className="eyebrow">Your next small step</p>
              <h2>Check in with yourself.</h2>
            </div>
            <span className="date-stamp">{formatDateStamp().month}<br />{formatDateStamp().day}</span>
          </section>

          <section className="checkin-card" aria-labelledby="mood-title">
            <div className="checkin-copy">
              <div className="section-icon"><HeartHandshake size={20} /></div>
              <div>
                <h3 id="mood-title">How does today feel?</h3>
                <p>There is no right answer — just choose the word that fits best.</p>
              </div>
            </div>
            <div className="mood-row" role="radiogroup" aria-label="How does today feel?">
              {moodOptions.map((option, index) => (
                <button
                  type="button"
                  key={option.label}
                  className={`mood-option ${mood === index ? "is-selected" : ""}`}
                  onClick={() => onMoodChange(index)}
                  role="radio"
                  aria-checked={mood === index}
                >
                  <span className="mood-symbol">{option.icon}</span>
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
            <div className="checkin-foot">
              <span className="soft-status">{checkInSaved ? <><Check size={15} /> Today’s note is saved</> : "Takes less than a minute"}</span>
              <Button className="ink-action" onClick={onSaveCheckIn}>{checkInSaved ? "Update check-in" : "Save check-in"}</Button>
            </div>
          </section>

          <section className="care-plan" aria-labelledby="care-plan-title">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">Keep the day in order</p>
                <h2 id="care-plan-title">Your care plan</h2>
              </div>
              <button type="button" className="text-action" onClick={() => onNavigate("appointments")}>Open calendar</button>
            </div>
            <div className="plan-list">
              <button type="button" className="plan-item" onClick={() => onNavigate("medications")}>
                <span className="plan-icon copper"><Pill size={20} /></span>
                <span className="plan-body"><strong>Medication routines</strong><small>Add a reminder to bring it into today’s plan.</small></span>
                <ChevronRight size={19} />
              </button>
              <button type="button" className="plan-item" onClick={() => onNavigate("appointments")}>
                <span className="plan-icon green"><CalendarDays size={20} /></span>
                <span className="plan-body"><strong>Appointments</strong><small>No appointment on the calendar in this preview.</small></span>
                <ChevronRight size={19} />
              </button>
              <button type="button" className="plan-item" onClick={() => onNavigate("vitals")}>
                <span className="plan-icon ink"><Stethoscope size={20} /></span>
                <span className="plan-body"><strong>Vital signs</strong><small>Keep important readings in one clear record.</small></span>
                <ChevronRight size={19} />
              </button>
            </div>
          </section>
        </div>

        <aside className="reflection-column" aria-label="Reflection and care notes">
          <section className="reflection-card">
            <div className="reflection-photo"><img src={reflectionImage} alt="A quiet chair beside a window with a poetry journal" /></div>
            <div className="reflection-content">
              <div className="reflection-topline"><span><BookHeart size={16} /> Wisdom for the day</span><span className="reflection-count">0{reflectionIndex + 1} / 0{reflections.length}</span></div>
              <p className="reflection-theme">{reflection.theme}</p>
              <blockquote>“{reflection.quote}”</blockquote>
              <p className="attribution">Rumi-inspired reflection</p>
              <div className="reflection-actions">
                <div className="pager">
                  <button type="button" className="icon-button" onClick={() => onReflectionChange(-1)} aria-label="Previous reflection"><ChevronLeft size={18} /></button>
                  <button type="button" className="icon-button" onClick={() => onReflectionChange(1)} aria-label="Next reflection"><ChevronRight size={18} /></button>
                </div>
                <div className="utility-actions">
                  <button type="button" className={`save-button ${savedReflection ? "is-saved" : ""}`} onClick={onSaveReflection}>{savedReflection ? <Check size={15} /> : <Sparkles size={15} />}{savedReflection ? "Saved" : "Save"}</button>
                  <button type="button" className="icon-button" onClick={onCopyReflection} aria-label="Copy reflection"><Copy size={16} /></button>
                </div>
              </div>
            </div>
          </section>

          <section className="support-note">
            <span className="section-icon"><UserRound size={19} /></span>
            <div><p className="eyebrow">Your circle</p><h3>Care works better when it is shared with clarity.</h3><button type="button" className="text-action" onClick={() => onNavigate("connections")}>Manage care connections</button></div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function CareModule({
  module,
  moduleName,
  mood,
  onMoodChange,
  onAction,
}: {
  module: (typeof moduleCopy)[string];
  moduleName: string;
  mood: number | null;
  onMoodChange: (value: number) => void;
  onAction: () => void;
}) {
  if (!module) return null;
  return (
    <section className="module-view">
      <div className="module-intro">
        <p className="eyebrow"><span className="reading-dot" /> {module.eyebrow}</p>
        <h2>{module.title}</h2>
        <p>{module.copy}</p>
        <Button className="primary-action" onClick={onAction}><Plus size={18} /> {module.action}</Button>
      </div>
      <div className="module-stage">
        <div className="stage-rule" />
        <span className="section-icon"><Clock3 size={20} /></span>
        <h3>{moduleName}, kept simple.</h3>
        <p>{module.detail}</p>
        {moduleName === "Daily check-in" && (
          <div className="compact-moods">
            {moodOptions.map((option, index) => <button type="button" key={option.label} className={mood === index ? "is-selected" : ""} onClick={() => onMoodChange(index)}>{option.icon}<span>{option.label}</span></button>)}
          </div>
        )}
      </div>
    </section>
  );
}
