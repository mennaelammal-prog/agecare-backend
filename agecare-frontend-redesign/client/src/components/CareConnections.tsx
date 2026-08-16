/**
 * Care Connections — a single, plain-language home for two related but
 * distinct AgeCare concepts that used to live on separate nav items
 * ("Family circle" and "Link a patient"):
 *
 *  - Family contacts: an address book. No permissions attached.
 *  - Care Access: the actual permission system (routes/careAccess.js on the
 *    backend) -- scoped, expiring, revocable grants that control who can
 *    read whose check-in history. Nothing here is visible to anyone until
 *    the patient explicitly approves a request.
 *
 * "Connect with someone" below performs both in one step: it adds the
 * person as a contact for reference *and* sends them a care-access request,
 * because in practice a caregiver wants both at once. Either half can fail
 * independently without blocking the other.
 */
import { Button } from "@/components/ui/button";
import {
  Check,
  Clock3,
  HeartHandshake,
  History,
  LoaderCircle,
  Plus,
  ShieldCheck,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { useState, type FormEvent } from "react";

type RecordShape = Record<string, unknown>;
type ContactValues = { name: string; relationship: string; email?: string; phone?: string; notifyEmail: boolean; notifySms: boolean };

function recordOf(value: unknown): RecordShape {
  return typeof value === "object" && value !== null ? (value as RecordShape) : {};
}

function formatDate(value: unknown): string {
  if (!value) return "";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function expiryLabel(value: unknown): string {
  if (!value) return "No expiry set";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "No expiry set";
  const days = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Expires today";
  return `Expires ${formatDate(value)} (${days} day${days === 1 ? "" : "s"} left)`;
}

export function CareConnections({
  connected,
  onConnect,
  // Family contacts (address book, no permissions)
  contacts,
  contactsLoading,
  contactsError,
  savingContact,
  deletingContact,
  onAddContact,
  onDeleteContact,
  // Care Access -- request/approve/decline/revoke
  incomingRequests,
  incomingLoading,
  incomingError,
  patientGrants,
  patientGrantsLoading,
  patientGrantsError,
  myGrants,
  myGrantsLoading,
  myGrantsError,
  requesting,
  actionPendingId,
  onConnectWithPatient,
  onApprove,
  onDecline,
  // Inline shared-history viewer for one of "my" active grants
  expandedGrantId,
  onToggleHistory,
  sharedHistoryEntries,
  sharedHistoryLoading,
  sharedHistoryError,
}: {
  connected: boolean;
  onConnect: () => void;
  contacts: unknown[];
  contactsLoading: boolean;
  contactsError?: string;
  savingContact: boolean;
  deletingContact: boolean;
  onAddContact: (values: ContactValues) => Promise<boolean>;
  onDeleteContact: (id: number) => Promise<boolean>;
  incomingRequests: unknown[];
  incomingLoading: boolean;
  incomingError?: string;
  patientGrants: unknown[];
  patientGrantsLoading: boolean;
  patientGrantsError?: string;
  myGrants: unknown[];
  myGrantsLoading: boolean;
  myGrantsError?: string;
  requesting: boolean;
  actionPendingId: number | null;
  onConnectWithPatient: (email: string, relationship: string) => void;
  onApprove: (grantId: number, days: 1 | 7 | 30 | 90) => void;
  onDecline: (grantId: number) => void;
  expandedGrantId: number | null;
  onToggleHistory: (grantId: number) => void;
  sharedHistoryEntries: unknown[];
  sharedHistoryLoading: boolean;
  sharedHistoryError?: string;
}) {
  const [connectEmail, setConnectEmail] = useState("");
  const [connectRelationship, setConnectRelationship] = useState("");
  const [contactFormOpen, setContactFormOpen] = useState(false);
  const [contactValues, setContactValues] = useState<ContactValues>({ name: "", relationship: "", email: "", phone: "", notifyEmail: true, notifySms: false });
  const [approveDays, setApproveDays] = useState<Record<number, 1 | 7 | 30 | 90>>({});

  if (!connected) {
    return (
      <section className="module-view">
        <div className="module-intro">
          <p className="eyebrow"><span className="reading-dot" /> Live AgeCare service</p>
          <h2>Your connections stay private until you connect.</h2>
          <p>Sign in to manage your family contacts and care-access permissions.</p>
          <Button className="primary-action" onClick={onConnect}>Connect AgeCare</Button>
        </div>
        <div className="module-stage">
          <span className="section-icon"><HeartHandshake size={20} /></span>
          <h3>Two clear things, kept separate.</h3>
          <p>A contact list you keep for reference, and a permission system that decides who can actually see your care history. Nothing is shared until you say so.</p>
        </div>
      </section>
    );
  }

  async function submitConnect(event: FormEvent) {
    event.preventDefault();
    const email = connectEmail.trim();
    if (!email) return;
    onConnectWithPatient(email, connectRelationship.trim());
    setConnectEmail("");
    setConnectRelationship("");
  }

  async function submitContact(event: FormEvent) {
    event.preventDefault();
    const saved = await onAddContact(contactValues);
    if (saved) {
      setContactValues({ name: "", relationship: "", email: "", phone: "", notifyEmail: true, notifySms: false });
      setContactFormOpen(false);
    }
  }

  return (
    <div className="care-connections">
      {/* ---- Care Access: the actual permission system ---- */}
      <section className="live-module">
        <div className="live-module-head">
          <p className="eyebrow"><ShieldCheck size={14} /> Consent-based, and revocable any time</p>
          <h2>Care Access.</h2>
          <p>This is what actually controls who can see someone's check-ins. Ask to see a patient's history below — nothing is visible to anyone until the patient approves it, and every approval can be given a time limit or removed at any point.</p>
        </div>

        <form className="care-form" onSubmit={submitConnect}>
          <div className="form-title"><strong>Connect with someone</strong></div>
          <div className="field-grid">
            <label className="field-label">Their registered AgeCare email
              <input required type="email" value={connectEmail} onChange={(event) => setConnectEmail(event.target.value)} placeholder="patient@example.com" />
            </label>
            <label className="field-label">Your relationship
              <input value={connectRelationship} onChange={(event) => setConnectRelationship(event.target.value)} placeholder="Daughter, son, caregiver…" />
            </label>
          </div>
          <div className="form-foot">
            <span><Check size={16} /> Adds them as a contact and asks for permission to view their history.</span>
            <Button type="submit" className="ink-action" disabled={requesting}>{requesting ? <><LoaderCircle className="spin" size={17} /> Sending</> : "Connect"}</Button>
          </div>
        </form>

        <div className="family-grid">
          <section>
            <h3><Clock3 size={19} /> Waiting for your answer</h3>
            {incomingLoading ? (
              <p>Loading…</p>
            ) : incomingError ? (
              <p>{incomingError}</p>
            ) : incomingRequests.length === 0 ? (
              <div className="empty-state"><span className="section-icon"><Clock3 size={22} /></span><strong>No pending requests.</strong><p>When someone asks to see your care history, their request will appear here.</p></div>
            ) : (
              <div className="service-list">
                {incomingRequests.map((item, index) => {
                  const request = recordOf(item);
                  const grantId = Number(request.id);
                  const isBusy = actionPendingId === grantId;
                  const days = approveDays[grantId] ?? 7;
                  return (
                    <div key={String(request.id ?? index)}>
                      <strong>{String(request.caregiver_name ?? request.caregiver_email ?? "Someone")}</strong>
                      <span>{String(request.relationship ?? "Family")}</span>
                      <small>Asked {formatDate(request.requested_at) || "recently"} for read-only access to your check-ins.</small>
                      <div className="request-actions">
                        <label className="field-label duration-label">For
                          <select value={days} onChange={(event) => setApproveDays((current) => ({ ...current, [grantId]: Number(event.target.value) as 1 | 7 | 30 | 90 }))}>
                            <option value={1}>1 day</option>
                            <option value={7}>7 days</option>
                            <option value={30}>30 days</option>
                            <option value={90}>90 days</option>
                          </select>
                        </label>
                        <Button type="button" className="ink-action" disabled={isBusy} onClick={() => onApprove(grantId, days)}>
                          {isBusy ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />} Approve
                        </Button>
                        <button type="button" className="record-delete" disabled={isBusy} onClick={() => onDecline(grantId)} aria-label="Decline request">
                          <X size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <h3><ShieldCheck size={19} /> People with access to your history</h3>
            {patientGrantsLoading ? (
              <p>Loading…</p>
            ) : patientGrantsError ? (
              <p>{patientGrantsError}</p>
            ) : patientGrants.length === 0 ? (
              <div className="empty-state"><span className="section-icon"><ShieldCheck size={22} /></span><strong>Nobody has access yet.</strong><p>Approve a request above to grant access — you can remove it here at any time.</p></div>
            ) : (
              <div className="service-list">
                {patientGrants.map((item, index) => {
                  const grant = recordOf(item);
                  const grantId = Number(grant.id);
                  const isBusy = actionPendingId === grantId;
                  return (
                    <div key={String(grant.id ?? index)}>
                      <strong>{String(grant.caregiver_name ?? "Someone")}</strong>
                      <span>{String(grant.relationship ?? "Family")}</span>
                      <small>{expiryLabel(grant.expires_at)}</small>
                      <div className="request-actions">
                        <button type="button" className="record-delete" disabled={isBusy} onClick={() => onDecline(grantId)} aria-label="Remove access">
                          {isBusy ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />} Remove access
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <div className="linked-summary">
          <h3><History size={19} /> People whose care history you can see</h3>
          {myGrantsLoading ? (
            <p>Loading…</p>
          ) : myGrantsError ? (
            <p>{myGrantsError}</p>
          ) : myGrants.length === 0 ? (
            <p>Nobody has approved your request yet. Once they do, they'll appear here.</p>
          ) : (
            myGrants.map((item, index) => {
              const grant = recordOf(item);
              const grantId = Number(grant.id);
              const isOpen = expandedGrantId === grantId;
              return (
                <div key={String(grant.id ?? index)} className="my-grant-row">
                  <p>
                    <strong>{String(grant.patient_name ?? "Patient")}</strong> · {String(grant.relationship ?? "Family")} · {expiryLabel(grant.expires_at)}
                  </p>
                  <button type="button" className="text-action" onClick={() => onToggleHistory(grantId)}>
                    {isOpen ? "Hide check-ins" : "View shared check-ins"}
                  </button>
                  {isOpen && (
                    sharedHistoryLoading ? (
                      <p>Loading their check-ins…</p>
                    ) : sharedHistoryError ? (
                      <p>{sharedHistoryError}</p>
                    ) : sharedHistoryEntries.length === 0 ? (
                      <div className="empty-state"><span className="section-icon"><History size={20} /></span><strong>No check-ins recorded yet.</strong></div>
                    ) : (
                      <div className="history-list">
                        {sharedHistoryEntries.map((entry, entryIndex) => {
                          const record = recordOf(entry);
                          return (
                            <article className="history-entry" key={String(record.id ?? entryIndex)}>
                              <div className="history-date">{formatDate(record.created_at) || "Recorded check-in"}</div>
                              <div>
                                <div className="history-stats">
                                  <span>Mood <strong>{String(record.mood ?? "—")}/5</strong></span>
                                  <span>Energy <strong>{String(record.energy ?? "—")}/5</strong></span>
                                  <span>Pain <strong>{String(record.pain ?? "—")}/10</strong></span>
                                </div>
                                {record.notes ? <p>{String(record.notes)}</p> : null}
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* ---- Family contacts: address book only, no permissions ---- */}
      <section className="live-module">
        <div className="live-module-head split-head">
          <div>
            <p className="eyebrow">For your own reference</p>
            <h2>Family contacts.</h2>
            <p>A simple contact list. Adding someone here does not give them access to your care history — that's what Care Access, above, is for.</p>
          </div>
          <Button className="primary-action" onClick={() => setContactFormOpen(true)}><Plus size={17} /> Add contact</Button>
        </div>

        {contactFormOpen && (
          <form className="care-form contact-form" onSubmit={submitContact}>
            <div className="form-title"><strong>Add a family contact</strong><button type="button" className="icon-button" onClick={() => setContactFormOpen(false)} aria-label="Close contact form">×</button></div>
            <div className="field-grid">
              <label className="field-label">Name<input required value={contactValues.name} onChange={(event) => setContactValues({ ...contactValues, name: event.target.value })} /></label>
              <label className="field-label">Relationship<input required value={contactValues.relationship} onChange={(event) => setContactValues({ ...contactValues, relationship: event.target.value })} placeholder="Daughter, son, caregiver…" /></label>
              <label className="field-label">Email<input type="email" value={contactValues.email} onChange={(event) => setContactValues({ ...contactValues, email: event.target.value })} /></label>
              <label className="field-label">Phone<input value={contactValues.phone} onChange={(event) => setContactValues({ ...contactValues, phone: event.target.value })} /></label>
            </div>
            <div className="notification-options">
              <label><input type="checkbox" checked={contactValues.notifyEmail} onChange={(event) => setContactValues({ ...contactValues, notifyEmail: event.target.checked })} /> Email notifications</label>
              <label><input type="checkbox" checked={contactValues.notifySms} onChange={(event) => setContactValues({ ...contactValues, notifySms: event.target.checked })} /> SMS notifications</label>
            </div>
            <div className="form-foot">
              <span><Check size={16} /> This only adds a contact — it does not share any care data.</span>
              <Button type="submit" className="ink-action" disabled={savingContact}>{savingContact ? <><LoaderCircle className="spin" size={17} /> Saving</> : "Save contact"}</Button>
            </div>
          </form>
        )}

        {contactsLoading ? (
          <section className="loading-panel"><LoaderCircle className="spin" size={23} /> Loading your contacts…</section>
        ) : contactsError ? (
          <section className="service-error"><UsersRound size={20} /><div><strong>We could not load your contacts.</strong><p>{contactsError}</p></div></section>
        ) : contacts.length === 0 ? (
          <div className="empty-state"><span className="section-icon"><UsersRound size={22} /></span><strong>No family contacts yet.</strong><p>Add a contact so you can keep your trusted people close.</p></div>
        ) : (
          <div className="service-list">
            {contacts.map((item, index) => {
              const contact = recordOf(item);
              return (
                <div className="managed-contact" key={String(contact.id ?? index)}>
                  <div>
                    <strong>{String(contact.name ?? "Family contact")}</strong>
                    <span>{String(contact.relationship ?? "Family")}</span>
                    <small>{String(contact.email ?? contact.phone ?? "No contact detail")}</small>
                  </div>
                  <button
                    type="button"
                    className="record-delete"
                    onClick={() => { if (window.confirm("Remove this family contact from AgeCare?")) void onDeleteContact(Number(contact.id)); }}
                    disabled={deletingContact}
                    aria-label="Remove family contact"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
