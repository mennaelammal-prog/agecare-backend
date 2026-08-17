// AgeCare reminder service worker.
//
// Two jobs:
// 1. Show the OS-level notification for a background/closed-tab push
//    message (the daily check-in nudge, a medication's due time, or a
//    prescription-renewal warning sent from services/reminderScheduler.js
//    on the backend). What "ringing" sounds like here is entirely up to the
//    browser/OS -- Web Push has no API to attach a custom audio file to a
//    system notification.
// 2. Relay that same payload to any open app tab via postMessage, so a tab
//    that's actually open right now can ring a synthesized alarm tone and
//    show a full-screen "alarm clock" style overlay (see AlarmOverlay.tsx)
//    -- a much closer match to "alarm or ringing tone" than a silent system
//    banner alone.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = { title: "AgeCare reminder", body: "You have a new reminder." };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // Non-JSON push payload -- fall back to the generic text above rather than fail the event.
  }

  const notify = self.registration.showNotification(payload.title, {
    body: payload.body,
    tag: payload.tag || "agecare-reminder",
    icon: "/images/day-marker-logo.png",
    badge: "/images/day-marker-logo.png",
    requireInteraction: Boolean(payload.alarm),
    data: payload,
  });

  const relay = self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    for (const client of clients) client.postMessage({ type: "agecare-reminder", payload });
  });

  event.waitUntil(Promise.all([notify, relay]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    }),
  );
});
