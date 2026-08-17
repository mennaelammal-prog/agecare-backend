/**
 * A background/closed-tab push notification rings with whatever sound the
 * OS gives system notifications -- Web Push has no API to attach a custom
 * sound to that. While the app is actually open, this gives the fuller
 * "alarm clock" experience instead: sw.js relays the same push payload here
 * via postMessage, and for anything marked `alarm: true` (the daily
 * check-in nudge, each medication's due time -- not the renewal warning,
 * which is informational rather than urgent) this rings a synthesized tone
 * on a loop and shows a full-screen alert until dismissed.
 *
 * MAX_RING_DURATION_MS is a hard safety cap: real feedback was that a test
 * reminder kept ringing for several minutes with no obvious way to stop it
 * (most likely a missed click, or more than one tab open -- each open tab
 * rings independently, since each is a separate page with its own audio).
 * Rather than rely solely on the Dismiss button working every time, this
 * component now always stops itself after MAX_RING_DURATION_MS regardless
 * of whether anyone clicks anything -- a stuck, unstoppable alarm is a real
 * problem in an aged-care app, so this errs toward silence over persistence.
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

const MAX_RING_DURATION_MS = 45_000;

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
    if (!ringing) {
      stopAlarmTone();
      return undefined;
    }
    playAlarmTone();
    const safety = setTimeout(() => setRinging(null), MAX_RING_DURATION_MS);
    return () => {
      clearTimeout(safety);
      stopAlarmTone();
    };
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
        <p className="alarm-auto-stop">This stops on its own after a short while, too.</p>
      </div>
    </div>
  );
}
