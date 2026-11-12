import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiMessageSquare, FiX } from "react-icons/fi";
import { getUser, subscribeToAuthChanges } from "../../utils/auth.js";
import { focusDialog, handleDialogKeyDown, restoreDialogFocus } from "../../utils/dialogFocus.js";
import {
  getAdminTestimonial,
  listAdminPlatformFeedback,
  listAdminTestimonials,
  moderateTestimonial,
} from "../../services/adminFeedbackService.js";
import { createAdminFeedbackController, INITIAL_ADMIN_FEEDBACK_STATE } from "./adminFeedbackState.js";
import adminStyles from "./AdminDashboardPage.module.css";
import styles from "./AdminFeedbackView.module.css";

const formatDate = (value) => value
  ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
  : "Not available";
const authorName = (author) => [author?.firstName, author?.lastName].filter(Boolean).join(" ") || `@${author?.username || "unknown"}`;
const publicAttribution = (revision) => revision?.attributionMode === "anonymous"
  ? "Anonymous user"
  : revision?.publicDisplayName || "Named snapshot unavailable";
const statusClass = (status) => `${styles.status} ${styles[`status${String(status || "").replace(/^./, (letter) => letter.toUpperCase())}`] || ""}`;
const actionable = (item, action) => {
  const revision = item?.currentRevision;
  if (!revision || item.withdrawnAt || item.publicationSuspendedAt || item.author?.status !== "active") return false;
  return action === "revoke" ? revision.moderationStatus === "approved" : revision.moderationStatus === "pending";
};

function Pager({ page, total, totalPages, label, disabled, onChange }) {
  const available = Number.isInteger(total) && Number.isInteger(totalPages);
  return <div className={styles.pager}><span>{available ? `${total} ${label}` : "Results unavailable"}</span><div><button type="button" disabled={disabled || !available || page <= 1} onClick={() => onChange?.(page - 1)}>Previous</button><span>{available ? `Page ${page} of ${totalPages}` : "Pagination unavailable"}</span><button type="button" disabled={disabled || !available || page >= totalPages} onClick={() => onChange?.(page + 1)}>Next</button></div></div>;
}

function StateBlock({ status, error, empty, emptyText, onRetry, children }) {
  if (status === "loading") return <div className={styles.state} role="status">Loading…</div>;
  if (status === "error") return <div className={styles.state} role="alert"><strong>{error}</strong><button type="button" onClick={onRetry}>Retry</button></div>;
  if (status === "success" && empty) return <div className={styles.state}>{emptyText}</div>;
  return children;
}

export function ModerationDialog({ decision, busy, onExplanationChange, onConfirm, onCancel }) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const action = decision?.action;
  const open = Boolean(decision);
  const onCancelRef = useRef(onCancel);
  const busyRef = useRef(busy);
  onCancelRef.current = onCancel;
  busyRef.current = busy;
  const needsExplanation = action === "reject" || action === "revoke";
  const title = `${action === "approve" ? "Approve" : action === "reject" ? "Reject" : "Revoke"} revision ${decision?.revisionNumber}`;
  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    focusDialog(dialogRef.current, cancelRef.current);
    const onKeyDown = (event) => handleDialogKeyDown({ event, dialog: dialogRef.current, disabled: busyRef.current, onDismiss: () => onCancelRef.current?.() });
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      restoreDialogFocus(opener);
    };
  }, [open]);
  if (!decision) return null;
  const content = <div className={styles.dialogBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel?.(); }}><div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="moderation-dialog-title" tabIndex={-1}><h2 id="moderation-dialog-title">{title}</h2><p>This decision targets submission {decision.submissionId}, revision {decision.revisionNumber}. It will never retarget a newer revision.</p>{needsExplanation && <label>Explanation visible to the author<textarea value={decision.explanation} maxLength={500} disabled={busy} onChange={(event) => onExplanationChange?.(event.target.value)} /></label>}{decision.error && <p className={styles.dialogError} role="alert">{decision.error}</p>}<div className={styles.dialogActions}><button ref={cancelRef} type="button" className={styles.actionButton} disabled={busy} onClick={onCancel}>Cancel</button><button type="button" className={action === "approve" ? styles.actionButton : styles.dangerButton} disabled={busy} onClick={onConfirm}>{busy ? "Saving…" : title}</button></div></div></div>;
  return typeof document === "undefined" ? content : createPortal(content, document.body);
}

function PrivateInbox({ state, controller, locked }) {
  return <section className={adminStyles.card} aria-labelledby="private-feedback-heading"><div className={adminStyles.cardHeader}><div><h3 id="private-feedback-heading">Private platform feedback</h3><p>Read-only messages sent to platform administrators. Classroom feedback is not included.</p></div><span className={adminStyles.readOnly}>Read-only</span></div><StateBlock status={state.platformStatus} error={state.platformError} empty={state.platformFeedback.length === 0} emptyText="No private platform feedback has been submitted." onRetry={() => controller.loadPlatform?.()}><div className={styles.inboxList}>{state.platformFeedback.map((item) => <article className={styles.inboxItem} key={item.id}><div className={styles.itemHeader}><strong>{authorName(item.author)}</strong><time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time></div><div className={styles.meta}>@{item.author.username} · {item.author.role} · {item.author.status}</div><p className={styles.message}>{item.message}</p></article>)}</div></StateBlock><Pager page={state.platformPage} total={state.platformTotal} totalPages={state.platformTotalPages} label="messages" disabled={locked || state.platformStatus === "loading"} onChange={(page) => { if (controller.setPlatformPage?.(page)) controller.loadPlatform?.(); }} /></section>;
}

function TestimonialDetail({ state, controller, locked }) {
  if (!state.selectedSubmissionId) return null;
  if (state.detailStatus === "loading") return <section className={styles.detail} role="status">Loading testimonial details…</section>;
  if (state.detailStatus === "error") return <section className={styles.detail} role="alert"><p className={styles.error}>{state.detailError}</p><button className={styles.retryButton} type="button" onClick={() => controller.selectSubmission?.(state.selectedSubmissionId)}>Retry details</button></section>;
  const item = state.detail?.testimonial;
  if (!item) return null;
  const current = item.currentRevision;
  return <section className={styles.detail} aria-labelledby="testimonial-detail-heading"><div className={styles.detailHeader}><div><h3 id="testimonial-detail-heading">Testimonial #{item.id}</h3><p className={styles.meta}>{authorName(item.author)} · @{item.author.username} · {item.author.role} · {item.author.status}</p></div><button className={styles.closeButton} type="button" aria-label="Close testimonial details" disabled={locked} onClick={() => controller.closeDetail?.()}><FiX /></button></div><div className={styles.lifecycle}>{item.withdrawnAt && <span className={statusClass("revoked")}>Withdrawn</span>}{item.publicationSuspendedAt && <span className={statusClass("rejected")}>Publication suspended</span>}<span className={statusClass(current.moderationStatus)}>{current.moderationStatus}</span></div><dl className={styles.facts}><div><dt>Current revision</dt><dd>{current.revisionNumber}</dd></div><div><dt>Public attribution</dt><dd>{publicAttribution(current)}</dd></div><div><dt>Consent version</dt><dd>{current.consentVersion}</dd></div><div><dt>Consent recorded</dt><dd>{formatDate(current.consentedAt)}</dd></div><div><dt>Withdrawal</dt><dd>{item.withdrawnAt ? formatDate(item.withdrawnAt) : "Not withdrawn"}</dd></div><div><dt>Suspension</dt><dd>{item.publicationSuspendedAt ? `${formatDate(item.publicationSuspendedAt)} (${item.publicationSuspensionReason || "reason unavailable"})` : "Not suspended"}</dd></div></dl><p className={styles.notice}>{current.attributionMode === "anonymous" ? "Public attribution: Anonymous user. Administrators can identify this author for moderation." : `Public attribution uses the approved snapshot “${current.publicDisplayName}”; the current account name is shown separately above.`}</p><p className={styles.message}>{current.message}</p><div className={styles.actions}>{actionable(item, "approve") && <><button className={styles.actionButton} type="button" disabled={locked} onClick={() => controller.prepareDecision?.({ action: "approve", submissionId: item.id, revisionId: current.id })}>Approve revision {current.revisionNumber}</button><button className={styles.dangerButton} type="button" disabled={locked} onClick={() => controller.prepareDecision?.({ action: "reject", submissionId: item.id, revisionId: current.id })}>Reject revision {current.revisionNumber}</button></>}{actionable(item, "revoke") && <button className={styles.dangerButton} type="button" disabled={locked} onClick={() => controller.prepareDecision?.({ action: "revoke", submissionId: item.id, revisionId: current.id })}>Revoke revision {current.revisionNumber}</button>}</div><h4 className={styles.historyHeading}>Revision history</h4><div className={styles.revisionList}>{state.detail.revisions.map((revision) => <article className={styles.revisionItem} key={revision.id}><div className={styles.itemHeader}><strong>Revision {revision.revisionNumber}{revision.id === current.id ? " · current" : ""}</strong><span className={statusClass(revision.moderationStatus)}>{revision.moderationStatus}</span></div><div className={styles.revisionMeta}><span>Created {formatDate(revision.createdAt)}</span><span>Consent {revision.consentVersion}</span><span>Public attribution: {publicAttribution(revision)}</span>{revision.approvedAt && <span>Approved by administrator #{revision.approvedByUserId} on {formatDate(revision.approvedAt)}</span>}{revision.rejectedAt && <span>Rejected by administrator #{revision.rejectedByUserId} on {formatDate(revision.rejectedAt)}</span>}{revision.revokedAt && <span>Revoked by administrator #{revision.revokedByUserId} on {formatDate(revision.revokedAt)}</span>}</div><p className={styles.message}>{revision.message}</p>{revision.moderationExplanation != null && <p className={styles.explanation}>Moderation explanation: {revision.moderationExplanation}</p>}</article>)}</div><Pager page={state.detail.revisionPage} total={state.detail.revisionTotal} totalPages={state.detail.revisionTotalPages} label="revisions" disabled={locked || state.detailStatus === "loading"} onChange={(page) => controller.setRevisionPage?.(page)} /></section>;
}

function TestimonialQueue({ state, controller, locked }) {
  return <section className={adminStyles.card} aria-labelledby="testimonial-queue-heading"><div className={adminStyles.cardHeader}><div><h3 id="testimonial-queue-heading">Testimonial moderation</h3><p>Review exact revisions. Queue filters are supplied by the moderation service.</p></div></div><div className={styles.toolbar}><label>Status filter<select value={state.queueFilter} disabled={locked || state.queueStatus === "loading"} onChange={(event) => { if (controller.setQueueFilter?.(event.target.value)) controller.loadQueue?.(); }}>{["pending", "approved", "rejected", "revoked", "all"].map((status) => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}</select></label></div><StateBlock status={state.queueStatus} error={state.queueError} empty={state.testimonials.length === 0} emptyText="No testimonials match this filter." onRetry={() => controller.loadQueue?.()}><div className={styles.queueList}>{state.testimonials.map((item) => <article className={styles.queueItem} key={item.id}><button className={styles.queueButton} type="button" disabled={locked} onClick={() => controller.selectSubmission?.(item.id)}><div className={styles.itemHeader}><strong>{authorName(item.author)}</strong><span className={statusClass(item.currentRevision.moderationStatus)}>{item.currentRevision.moderationStatus}</span></div><p className={styles.message}>{item.currentRevision.message}</p><div className={styles.queueSummary}><span>Revision {item.currentRevision.revisionNumber}</span><span>Public attribution: {publicAttribution(item.currentRevision)}</span><span>{formatDate(item.currentRevision.createdAt)}</span>{item.withdrawnAt && <span>Withdrawn</span>}{item.publicationSuspendedAt && <span>Publication suspended</span>}</div></button></article>)}</div></StateBlock><Pager page={state.queuePage} total={state.queueTotal} totalPages={state.queueTotalPages} label="testimonials" disabled={locked || state.queueStatus === "loading"} onChange={(page) => { if (controller.setQueuePage?.(page)) controller.loadQueue?.(); }} /><TestimonialDetail state={state} controller={controller} locked={locked} /></section>;
}

export function AdminFeedbackContent({ state = INITIAL_ADMIN_FEEDBACK_STATE, controller = {} }) {
  const locked = ["sending", "uncertain", "rate-limited"].includes(state.mutationPhase);
  const decision = state.decision ? { ...state.decision, error: state.decisionError } : null;
  return <div className={styles.feedbackView}><div className={adminStyles.pageHeading}><div><p>Private feedback and moderation</p><h2>Feedback</h2></div></div><div className={styles.sectionTabs} role="tablist" aria-label="Feedback areas"><button type="button" role="tab" aria-selected={state.section === "platform"} disabled={locked} onClick={() => { if (controller.setSection?.("platform")) controller.loadPlatform?.(); }}>Private platform feedback</button><button type="button" role="tab" aria-selected={state.section === "testimonials"} disabled={locked} onClick={() => { if (controller.setSection?.("testimonials")) controller.loadQueue?.(); }}>Testimonial moderation</button></div>{locked && <p className={styles.notice} role="status">A moderation decision is unresolved. Retry the exact operation before leaving this area.</p>}{state.mutationPhase === "success" && <p className={styles.success} role="status">The moderation decision was confirmed.</p>}{["uncertain", "rate-limited", "error", "conflict"].includes(state.mutationPhase) && <div className={styles.error} role="alert"><p>{state.mutationError}</p>{["uncertain", "rate-limited"].includes(state.mutationPhase) && <button className={styles.retryButton} type="button" disabled={state.mutationPhase === "rate-limited"} onClick={() => controller.retryDecision?.()}>{state.mutationPhase === "rate-limited" ? "Retry available after waiting" : "Retry identical decision"}</button>}</div>}{state.refreshError && <p className={styles.notice} role="status">{state.refreshError}</p>}{state.section === "platform" ? <PrivateInbox state={state} controller={controller} locked={locked} /> : <TestimonialQueue state={state} controller={controller} locked={locked} />}<ModerationDialog decision={decision} busy={state.mutationPhase === "sending"} onExplanationChange={(value) => controller.setDecisionExplanation?.(value)} onConfirm={() => controller.confirmDecision?.()} onCancel={() => controller.cancelDecision?.()} /></div>;
}

export default function AdminFeedbackView({ active, onMutationLockChange = () => {} }) {
  const [state, setState] = useState(() => ({ ...INITIAL_ADMIN_FEEDBACK_STATE }));
  const callbackRef = useRef(onMutationLockChange);
  callbackRef.current = onMutationLockChange;
  const controller = useMemo(() => createAdminFeedbackController({
    listPlatform: listAdminPlatformFeedback,
    listTestimonials: listAdminTestimonials,
    getTestimonial: getAdminTestimonial,
    moderate: moderateTestimonial,
    onChange(nextState) {
      setState(nextState);
      callbackRef.current(["sending", "uncertain", "rate-limited"].includes(nextState.mutationPhase));
    },
  }), []);

  useLayoutEffect(() => {
    const synchronizeAccount = () => {
      const user = getUser();
      controller.setScope({ accountId: user?.id, role: user?.role });
    };
    synchronizeAccount();
    return subscribeToAuthChanges(synchronizeAccount);
  }, [controller]);

  useEffect(() => {
    if (!active) {
      controller.deactivate();
      return undefined;
    }
    controller.activate();
    const current = controller.getState();
    if (current.section === "platform" && current.platformStatus === "idle") void controller.loadPlatform();
    if (current.section === "testimonials" && current.queueStatus === "idle") void controller.loadQueue();
    return () => controller.deactivate();
  }, [active, controller]);

  useEffect(() => () => callbackRef.current(false), []);
  if (!active) return null;
  return <AdminFeedbackContent state={state} controller={controller} />;
}
