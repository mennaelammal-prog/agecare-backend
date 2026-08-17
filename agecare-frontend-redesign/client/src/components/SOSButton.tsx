/**
 * A one-tap emergency alert, always visible as a floating button while
 * signed in. A single tap starts a short, cancelable countdown (rather than
 * requiring a second confirming tap) -- fast for someone who genuinely
 * needs it, with a large, unmissable "Cancel" for an accidental press.
 * Reaches every family contact with an email or phone on file, regardless
 * of their usual notification preferences (see the backend's
 * notifyFamilySOS for why).
 */
import { useEffect, useRef, useState } from "react";
import { LifeBuoy, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

type SOSButtonProps = {
  token: string;
};

const CONFIRM_SECONDS = 5;

export function SOSButton({ token }: SOSButtonProps) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const triggerMutation = trpc.legacy.sos.trigger.useMutation();

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  async function sendNow() {
    if (timerRef.current) clearInterval(timerRef.current);
    setSecondsLeft(null);
    setSending(true);
    try {
      const result = await triggerMutation.mutateAsync({ token });
      toast(
        result.contactsNotified > 0
          ? `Sent -- ${result.contactsNotified} family member${result.contactsNotified === 1 ? "" : "s"} notified.`
          : "No family contacts have an email or phone saved yet -- add one in Care Connections.",
      );
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not send the alert. Please try again or contact your family directly.");
    } finally {
      setSending(false);
    }
  }

  function startConfirm() {
    setSecondsLeft(CONFIRM_SECONDS);
    timerRef.current = setInterval(() => {
      setSecondsLeft((current) => {
        if (current === null) return null;
        if (current <= 1) {
          clearInterval(timerRef.current!);
          void sendNow();
          return null;
        }
        return current - 1;
      });
    }, 1000);
  }

  function cancel() {
    if (timerRef.current) clearInterval(timerRef.current);
    setSecondsLeft(null);
  }

  return (
    <>
      <button
        type="button"
        className="sos-button"
        onClick={startConfirm}
        disabled={sending || secondsLeft !== null}
        aria-label="Send an emergency alert to your family"
      >
        <LifeBuoy size={22} aria-hidden="true" />
        <span>I need help</span>
      </button>

      {secondsLeft !== null && (
        <div className="sos-overlay" role="alertdialog" aria-live="assertive" aria-label="Confirm emergency alert">
          <div className="sos-card">
            <LifeBuoy size={36} className="sos-icon" aria-hidden="true" />
            <h2>Sending an alert to your family in {secondsLeft}&hellip;</h2>
            <p>They'll get an email or text letting them know you need help.</p>
            <Button type="button" className="sos-cancel" onClick={cancel}>
              <X size={16} /> Cancel
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
