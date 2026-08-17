/**
 * Client-side Web Push helpers: register the reminders service worker,
 * subscribe/unsubscribe this device, and convert between the browser's
 * PushSubscription shape and the plain JSON the backend stores.
 */
const SW_PATH = "/sw.js";

export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export async function registerServiceWorker() {
  if (!isPushSupported()) return null;
  return navigator.serviceWorker.register(SW_PATH);
}

export async function getExistingSubscription() {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.ready.catch(() => null);
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

export async function subscribeToPush(publicKey: string) {
  if (!isPushSupported()) throw new Error("Reminders with sound aren't available in this browser.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was not granted.");

  const registration = await registerServiceWorker();
  if (!registration) throw new Error("Unable to set up reminders on this device.");
  await navigator.serviceWorker.ready;

  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
}

export async function unsubscribeFromPush() {
  const subscription = await getExistingSubscription();
  if (!subscription) return null;
  await subscription.unsubscribe();
  return subscription;
}

export function subscriptionToJSON(subscription: PushSubscription) {
  const json = subscription.toJSON();
  return {
    endpoint: json.endpoint as string,
    keys: {
      p256dh: (json.keys?.p256dh as string) ?? "",
      auth: (json.keys?.auth as string) ?? "",
    },
  };
}
