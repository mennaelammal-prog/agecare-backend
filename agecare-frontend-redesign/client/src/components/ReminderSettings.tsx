/**
 * Turns on real Web Push reminders for this device: a daily check-in nudge,
 * a ping at each medication's scheduled time, a heads-up 2 hours before each
 * appointment, and a prescription-renewal warning as an end_date approaches
 * (see services/reminderScheduler.js on the backend). Requires the backend
 * to have VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY configured (see
 * RENDER_DEPLOYMENT.md) -- until then this shows a plain "not set up yet"
 * message instead of a broken toggle.
 */
import { useEffect, useState } from "react";
import { Activity, Bell, BellOff, BellRing, CalendarClock, ClipboardCheck, Loader2, Pill, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  getExistingSubscription,
  isPushSupported,
  registerServiceWorker,
  subscribeToPush,
  subscriptionToJSON,
  unsubscribeFromPush,
} from "@/lib/push";

type ReminderSettingsProps = {
  token: string;
};

export function ReminderSettings({ token }: ReminderSettingsProps) {
  const supported = isPushSupported();
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [working, setWorking] = useState(false);

  const preferencesQuery = trpc.legacy.push.preferences.useQuery({ token }, { enabled: Boolean(token), retry: false });
  const vapidQuery = trpc.legacy.push.vapidPublicKey.useQuery({ token }, { enabled: Boolean(token) && supported, retry: false });
  const utils = trpc.useUtils();
  const subscribeMutation = trpc.legacy.push.subscribe.useMutation();
  const unsubscribeMutation = trpc.legacy.push.unsubscribe.useMutation();
  const updateMutation = trpc.legacy.push.updatePreferences.useMutation({
    onSuccess: () => utils.legacy.push.preferences.invalidate(),
  });
  const testMutation = trpc.legacy.push.test.useMutation();

  useEffect(() => {
    if (!supported) {
      setSubscribed(false);
      return;
    }
    registerServiceWorker().catch(() => {});
    getExistingSubscription()
      .then((subscription) => setSubscribed(Boolean(subscription)))
      .catch(() => setSubscribed(false));
  }, [supported]);

  async function handleEnable() {
    if (!vapidQuery.data?.publicKey) return;
    setWorking(true);
    try {
      const subscription = await subscribeToPush(vapidQuery.data.publicKey);
      await subscribeMutation.mutateAsync({ token, ...subscriptionToJSON(subscription) });
      setSubscribed(true);
      toast("Reminders are turned on for this device.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not turn on reminders on this device.");
    } finally {
      setWorking(false);
    }
  }

  async function handleDisable() {
    setWorking(true);
    try {
      const subscription = await unsubscribeFromPush();
      if (subscription) await unsubscribeMutation.mutateAsync({ token, endpoint: subscription.endpoint });
      setSubscribed(false);
      toast("Reminders are turned off for this device.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not turn off reminders on this device.");
    } finally {
      setWorking(false);
    }
  }

  async function handleTest() {
    try {
      const result = await testMutation.mutateAsync({ token });
      toast(result.sent > 0 ? "Test reminder sent -- it should ring now." : "No devices received it -- try turning reminders on again.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not send a test reminder.");
    }
  }

  const preferences = preferencesQuery.data?.data;
  const vapidUnavailable = supported && (vapidQuery.isError || (vapidQuery.data && !vapidQuery.data.publicKey));

  // The family-alert toggles below (missed check-in, unusual vital signs)
  // only decide whether the *server* emails/texts family -- they don't
  // depend on this device receiving a push notification at all, so they
  // must not be hidden behind `supported`/`subscribed`. Browsers without
  // the Push API (plain mobile Safari, unless added to the home screen)
  // used to lose access to these two along with the on-device reminder
  // toggle, which had nothing to do with push support.
  return (
    <div className="reminder-panel">
      <div className="reminder-panel-head">
        <BellRing size={18} aria-hidden="true" />
        <div>
          <strong>Reminders</strong>
          <small>A ringing alert for your daily check-in, each medication, and a heads-up before appointments.</small>
        </div>
      </div>

      {!supported ? (
        <p className="reminder-unavailable">Reminders with sound aren't available in this browser. Try a recent version of Chrome, Edge, or Firefox, or add this site to your iPhone's Home Screen and open it from there.</p>
      ) : vapidUnavailable ? (
        <p className="reminder-unavailable">Reminders aren't set up on this server yet.</p>
      ) : (
        <>
          {subscribed ? (
            <Button type="button" variant="outline" className="reminder-toggle" onClick={handleDisable} disabled={working}>
              {working ? <Loader2 size={16} className="spin" /> : <BellOff size={16} />} Turn off on this device
            </Button>
          ) : (
            <Button type="button" className="reminder-toggle" onClick={handleEnable} disabled={working || vapidQuery.isLoading}>
              {working ? <Loader2 size={16} className="spin" /> : <Bell size={16} />} Turn on for this device
            </Button>
          )}

          {subscribed && preferences && (
            <div className="reminder-fields">
              <label className="reminder-field">
                <span><ClipboardCheck size={15} aria-hidden="true" /> Daily check-in reminder</span>
                <input
                  type="time"
                  defaultValue={preferences.checkin_reminder_time}
                  onBlur={(event) => updateMutation.mutate({ token, checkinReminderTime: event.target.value })}
                />
              </label>
              <label className="reminder-field reminder-field-toggle">
                <span><Pill size={15} aria-hidden="true" /> Medication reminders</span>
                <input
                  type="checkbox"
                  checked={preferences.medication_reminders_enabled}
                  onChange={(event) => updateMutation.mutate({ token, medicationRemindersEnabled: event.target.checked })}
                />
              </label>
              <label className="reminder-field reminder-field-toggle">
                <span><CalendarClock size={15} aria-hidden="true" /> Appointment reminders (2 hours before)</span>
                <input
                  type="checkbox"
                  checked={preferences.appointment_reminders_enabled}
                  onChange={(event) => updateMutation.mutate({ token, appointmentRemindersEnabled: event.target.checked })}
                />
              </label>
              <button type="button" className="quiet-link reminder-test" onClick={handleTest} disabled={testMutation.isPending}>
                {testMutation.isPending ? "Sending..." : "Send a test reminder now"}
              </button>
              <p className="reminder-device-count">{preferences.device_count} device{preferences.device_count === 1 ? "" : "s"} registered.</p>
            </div>
          )}
        </>
      )}

      {preferences && (
        <div className="reminder-fields">
          <div className="reminder-family-alert">
            <label className="reminder-field reminder-field-toggle">
              <span><UsersRound size={15} aria-hidden="true" /> Notify my family if I miss a check-in</span>
              <input
                type="checkbox"
                checked={preferences.missed_checkin_alerts_enabled}
                onChange={(event) => updateMutation.mutate({ token, missedCheckinAlertsEnabled: event.target.checked })}
              />
            </label>
            <p className="reminder-family-alert-note">
              Off by default -- this is your choice to make. If it's on and you haven't checked in a
              few hours after your reminder time, the family contacts you've asked to be notified get a
              gentle heads-up, not an alarm. You'll always be told too, right when it happens.
            </p>
            {preferences.missed_checkin_alerts_enabled && preferences.notifiable_family_contact_count === 0 && (
              <p className="reminder-family-alert-note reminder-family-alert-warning">
                No family contacts are set up to be notified yet -- add one in Care Connections and turn on
                notifications for them.
              </p>
            )}
          </div>

          <div className="reminder-family-alert">
            <label className="reminder-field reminder-field-toggle">
              <span><Activity size={15} aria-hidden="true" /> Notify my family about an unusual vital sign reading</span>
              <input
                type="checkbox"
                checked={preferences.vital_alerts_enabled}
                onChange={(event) => updateMutation.mutate({ token, vitalAlertsEnabled: event.target.checked })}
              />
            </label>
            <p className="reminder-family-alert-note">
              Off by default, same as above. When a blood pressure, heart rate, oxygen, temperature, or
              blood sugar reading you log falls outside the general reference range, you always see it
              first -- this only decides whether family gets a gentle heads-up too. These ranges are
              general guidance, not a diagnosis -- always follow your own doctor's advice.
            </p>
            {preferences.vital_alerts_enabled && preferences.notifiable_family_contact_count === 0 && (
              <p className="reminder-family-alert-note reminder-family-alert-warning">
                No family contacts are set up to be notified yet -- add one in Care Connections and turn on
                notifications for them.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
