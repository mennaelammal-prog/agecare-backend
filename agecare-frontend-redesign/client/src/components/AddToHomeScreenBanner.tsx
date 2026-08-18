/**
 * On iOS, reminders with sound and (until AddToHomeScreenBanner is
 * dismissed) the family-alert toggles in ReminderSettings would otherwise
 * be the only clue that something's missing -- most people opening the app
 * for the first time never open that panel at all. This surfaces the fix
 * up front, once, right where the resident's family member (the person
 * most likely to actually be on an iPhone setting this up) will see it.
 * Apple gives no JS API to trigger "Add to Home Screen" the way Chrome's
 * `beforeinstallprompt` does on desktop/Android, so this just explains the
 * two taps: Share, then "Add to Home Screen."
 */
import { useEffect, useState } from "react";
import { Share, SquarePlus, X } from "lucide-react";
import { isIosDevice, isPushSupported, isRunningAsInstalledApp } from "@/lib/push";

const DISMISS_KEY = "agecare-a2hs-dismissed";

export function AddToHomeScreenBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const alreadyDismissed = window.localStorage.getItem(DISMISS_KEY) === "1";
    const needsIt = isIosDevice() && !isRunningAsInstalledApp() && !isPushSupported();
    setShow(needsIt && !alreadyDismissed);
  }, []);

  if (!show) return null;

  function dismiss() {
    window.localStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  }

  return (
    <div className="a2hs-banner" role="note">
      <SquarePlus size={18} aria-hidden="true" />
      <p>
        For daily reminders with sound, add AgeCare to your Home Screen: tap{" "}
        <Share size={13} aria-hidden="true" className="a2hs-inline-icon" /> Share, then "Add to Home Screen."
      </p>
      <button type="button" className="a2hs-dismiss" onClick={dismiss} aria-label="Dismiss this tip">
        <X size={16} />
      </button>
    </div>
  );
}
