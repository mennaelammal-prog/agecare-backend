/**
 * A background/closed-tab push notification rings with whatever sound the
 * OS gives system notifications -- Web Push has no API to attach a custom
 * sound to that. While the app is actually open, this gives the fuller
 * "alarm clock" experience instead: sw.js relays the same push payload here
 * via postMessage, and for anything marked `alarm: true` (the daily
 * check-in nudge, each medication's due time -- not the renewal warning,
 * which is informational rather than urgent) this rings a synthesized tone
 * on a loop and shows a full-screen alert until dismissed.
 */
import { useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { playAlarmTone, stopAlarmTone } from "@/lib/alarm";

type ReminderPayload = {
  title?: string;
  body?: string;
  alarm?: boolean;
};

export function AlarmOverlay() {
  const [ringing, setRinging] = useState<ReminderPayload | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return undefined;
    function handleMessage(event: MessageEvent) {
      const data = event.data as { type?: string; payload?: ReminderPayload } | undefined;
      if (data?.type === "agecare-reminder" && data.payload?.alarm) {
        setRinging(data.payload);
      }
    }
    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => navigator.serviceWorker.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    if (ringing) {
      playAlarmTone();
    } else {
      stopAlarmTone();
    }
    return () => stopAlarmTone();
  }, [ringing]);

  if (!ringing) return null;

  return (
    <div className="alarm-overlay" role="alertdialog" aria-live="assertive" aria-label={ringing.title || "AgeCare reminder"}>
      <div className="alarm-card">
        <BellRing size={32} aria-hidden="true" className="alarm-icon" />
        <h2>{ringing.title || "AgeCare reminder"}</h2>
        {ringing.body && <p>{ringing.body}</p>}
        <Button type="button" className="alarm-dismiss" onClick={() => setRinging(null)}>
          <X size={16} /> Dismiss
        </Button>
      </div>
    </div>
  );
}
