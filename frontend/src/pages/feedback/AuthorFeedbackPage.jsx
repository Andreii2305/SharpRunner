import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FiChevronLeft, FiChevronRight, FiMessageSquare, FiX } from "react-icons/fi";
import { Link } from "react-router-dom";
import ConfirmModal from "../../Components/ConfirmModal/ConfirmModal.jsx";
import Sidebar from "../../Components/SideBar/Sidebar.jsx";
import {
  createTestimonial,
  createTestimonialRevision,
  getOwnTestimonial,
  getTestimonialOptions,
  listOwnPlatformFeedback,
  listOwnTestimonials,
  submitPlatformFeedback,
  withdrawTestimonial,
} from "../../services/authorFeedbackService.js";
import { getUser, subscribeToAuthChanges } from "../../utils/auth.js";
import {
  createPlatformFeedbackController,
  initialPlatformFeedbackState,
} from "./platformFeedbackState.js";
import {
  createTestimonialAuthorController,
  initialTestimonialAuthorState,
} from "./testimonialAuthorState.js";
import {
  resolveFeedbackNavigation,
  scheduleFeedbackNavigation,
} from "./authorFeedbackNavigation.js";
import styles from "./AuthorFeedbackPage.module.css";

const formatDate = (value) => {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toLocaleString() : "Date unavailable";
};

const statusLabel = (status) => ({
  pending: "Pending review",
  approved: "Approved",
  rejected: "Changes requested",
  revoked: "Approval revoked",
}[status] || "Status unavailable");

function Pagination({ label, page, totalPages, loading, metadataAvailable, onChange }) {
  const previousDisabled = !metadataAvailable || loading || page <= 1;
  const nextDisabled = !metadataAvailable || loading || page >= totalPages;
  return (
    <nav className={styles.pagination} aria-label={label}>
      <button type="button" disabled={previousDisabled} onClick={() => onChange(page - 1)}>
        <FiChevronLeft aria-hidden="true" /> Previous
      </button>
      <span>{metadataAvailable ? (totalPages ? `Page ${page} of ${totalPages}` : `Page ${page}`) : "Page unavailable"}</span>
      <button type="button" disabled={nextDisabled} onClick={() => onChange(page + 1)}>
        Next <FiChevronRight aria-hidden="true" />
      </button>
    </nav>
  );
}

export function FeedbackDestinationNav({ role, destination, onChange }) {
  const isStudent = role === "student";
  return (
    <nav className={styles.destinations} aria-label="Feedback destination">
      <button
        type="button"
        className={destination === "platform" ? styles.destinationActive : ""}
        aria-pressed={destination === "platform"}
        onClick={() => onChange("platform")}
      >
        <strong>Private platform feedback</strong>
        <span>Visible to you and administrators.</span>
      </button>
      {isStudent && (
        <Link to="/classroom-feedback">
          <strong>Teacher-only classroom feedback</strong>
          <span>Visible to the selected classroom&apos;s current owning teacher.</span>
        </Link>
      )}
      <button
        type="button"
        className={destination === "testimonial" ? styles.destinationActive : ""}
        aria-pressed={destination === "testimonial"}
        onClick={() => onChange("testimonial")}
      >
        <strong>Public testimonial</strong>
        <span>Published only after your consent and administrator approval.</span>
      </button>
    </nav>
  );
}

export function PlatformFeedbackView({
  state,
  onMessageChange,
  onSubmit,
  onRetry,
  onSendAnother,
  onLoadRetry,
  onPageChange,
}) {
  const messageValid = state.message.trim() && state.characterCount <= 1000;
  const mutationLocked = ["sending", "uncertain", "rate-limited", "success"].includes(state.mutationPhase);
  const metadataAvailable = Number.isSafeInteger(state.total) && Number.isSafeInteger(state.totalPages);
  return (
    <div className={styles.panelStack}>
      <section className={styles.formPanel} aria-labelledby="platform-feedback-form-title">
        <div>
          <h2 id="platform-feedback-form-title">Private platform feedback</h2>
          <p>Administrators can read this feedback. It is not sent to a classroom teacher and is never published as a testimonial.</p>
        </div>
        <label className={styles.field}>
          Feedback
          <textarea
            value={state.message}
            disabled={mutationLocked}
            onChange={(event) => onMessageChange(event.target.value)}
            aria-describedby="platform-feedback-count platform-feedback-status"
            placeholder="Share feedback about the SharpRunner platform…"
          />
        </label>
        <div id="platform-feedback-count" className={state.characterCount > 1000 ? styles.countError : styles.count}>
          {state.characterCount.toLocaleString()} of 1,000 characters
        </div>
        {state.mutationError && <p id="platform-feedback-status" className={styles.errorText} role="alert">{state.mutationError}</p>}
        {state.mutationPhase === "success" && (
          <div className={styles.success} role="status">
            <p>Your private platform feedback was saved.</p>
            {state.historyRefreshError && <p>{state.historyRefreshError}</p>}
          </div>
        )}
        <div className={styles.actions}>
          {["uncertain", "rate-limited"].includes(state.mutationPhase) ? (
            <button type="button" onClick={onRetry}>Retry same feedback</button>
          ) : state.mutationPhase === "success" ? (
            <button type="button" onClick={onSendAnother}>Send another</button>
          ) : (
            <button type="button" disabled={!messageValid || state.mutationPhase === "sending"} onClick={onSubmit}>
              {state.mutationPhase === "sending" ? "Submitting…" : "Submit private feedback"}
            </button>
          )}
        </div>
      </section>

      <section className={styles.historyPanel} aria-labelledby="platform-feedback-history-title">
        <div className={styles.sectionHeader}>
          <div>
            <h2 id="platform-feedback-history-title">Your private feedback history</h2>
            <p>Submitted feedback is retained for your history. This release does not provide edit, withdrawal, or deletion controls.</p>
          </div>
          <strong>{metadataAvailable ? `${state.total} submission${state.total === 1 ? "" : "s"}` : "Total unavailable"}</strong>
        </div>
        {state.loading && <p role="status">Loading private feedback…</p>}
        {state.status === "error" && <div className={styles.errorBox} role="alert"><span>{state.error}</span><button type="button" onClick={onLoadRetry}>Retry</button></div>}
        {state.status === "success" && state.feedback.length === 0 && (
          <div className={styles.empty}><FiMessageSquare aria-hidden="true" /><h3>No private platform feedback yet</h3><p>Feedback you submit will appear here.</p></div>
        )}
        {state.feedback.length > 0 && (
          <div className={styles.historyList}>
            {state.feedback.map((item) => <article key={item.id}><time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time><p>{item.message}</p></article>)}
          </div>
        )}
        <Pagination label="Private platform feedback pages" page={state.page} totalPages={state.totalPages} loading={state.loading} metadataAvailable={metadataAvailable} onChange={onPageChange} />
      </section>
    </div>
  );
}

function TestimonialForm({ state, sectionRef, textareaRef, onMessageChange, onAttributionChange, onConsentChange, onSubmit, onRetry, onOptionsRetry, onStartCreate }) {
  const optionsReady = state.optionsStatus === "success" && state.options;
  const locked = ["sending", "uncertain", "rate-limited", "success"].includes(state.mutationPhase);
  const valid = optionsReady && state.message.trim() && state.characterCount <= 1000 && state.consentConfirmed;
  if (state.optionsStatus === "unavailable") {
    return <section ref={sectionRef} className={styles.formPanel}><h2>Public testimonial submission unavailable</h2><p>{state.optionsError}</p><p>Your existing testimonial history and withdrawal controls remain available.</p></section>;
  }
  return (
    <section ref={sectionRef} className={styles.formPanel} aria-labelledby="testimonial-form-title">
      <div className={styles.sectionHeader}>
        <div>
          <h2 id="testimonial-form-title">{state.draftMode === "edit" ? "Create a revised testimonial" : "Submit a public testimonial"}</h2>
          <p>Every new revision requires administrator approval. Editing an approved testimonial removes it from public display until the revised text is approved.</p>
        </div>
        {state.draftMode === "edit" && <button type="button" className={styles.secondaryButton} disabled={locked} onClick={onStartCreate}>Cancel editing</button>}
      </div>
      {state.optionsStatus === "loading" && <p role="status">Loading publication disclosure…</p>}
      {state.optionsStatus === "error" && <div className={styles.errorBox} role="alert"><span>{state.optionsError}</span><button type="button" onClick={onOptionsRetry}>Retry disclosure</button></div>}
      {optionsReady && (
        <>
          <label className={styles.field}>
            Testimonial
            <textarea ref={textareaRef} value={state.message} disabled={locked} onChange={(event) => onMessageChange(event.target.value)} placeholder="Share your experience in your own words…" />
          </label>
          <div className={state.characterCount > 1000 ? styles.countError : styles.count}>{state.characterCount.toLocaleString()} of 1,000 characters</div>
          <fieldset className={styles.attribution} disabled={locked}>
            <legend>Public attribution</legend>
            <label><input type="radio" name="testimonial-attribution" value="named" checked={state.attributionMode === "named"} onChange={() => onAttributionChange("named")} /> Show as {state.options.namedDisplayPreview}</label>
            <label><input type="radio" name="testimonial-attribution" value="anonymous" checked={state.attributionMode === "anonymous"} onChange={() => onAttributionChange("anonymous")} /> Show as Anonymous user</label>
            <p>Administrators can identify you even when the public display is anonymous.</p>
          </fieldset>
          <div className={styles.disclosure}>
            <h3>Testimonial publication consent</h3>
            <p>{state.options.consentText}</p>
            <label><input type="checkbox" checked={state.consentConfirmed} disabled={locked} onChange={(event) => onConsentChange(event.target.checked)} /> I have reviewed this disclosure and consent to this exact testimonial and attribution.</label>
          </div>
        </>
      )}
      {state.mutationError && <p className={styles.errorText} role="alert">{state.mutationError}</p>}
      {state.mutationPhase === "success" && <p className={styles.success} role="status">Your testimonial revision was saved and is awaiting review.</p>}
      {optionsReady && (
        <div className={styles.actions}>
          {["uncertain", "rate-limited"].includes(state.mutationPhase) ? (
            <button type="button" onClick={onRetry}>Retry identical submission</button>
          ) : state.mutationPhase === "success" ? (
            <button type="button" onClick={onStartCreate}>Start another testimonial</button>
          ) : (
            <button type="button" disabled={!valid || state.mutationPhase === "sending"} onClick={onSubmit}>
              {state.mutationPhase === "sending" ? "Submitting…" : state.draftMode === "edit" ? "Submit revised testimonial" : "Submit testimonial"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function TestimonialDetail({ state, panelRef, headingRef, onClose, onStartEdit, onRevisionPageChange, onRequestWithdraw }) {
  const detail = state.detail;
  if (state.detailLoading) return <section className={styles.detailPanel} role="status">Loading testimonial details…</section>;
  if (state.detailStatus === "error") return <section className={styles.detailPanel} role="alert">{state.detailError}</section>;
  if (!detail) return null;
  const item = detail.testimonial;
  const withdrawn = Boolean(item.withdrawnAt);
  const suspended = Boolean(item.publicationSuspendedAt);
  const metadataAvailable = Number.isSafeInteger(detail.revisionTotal) && Number.isSafeInteger(detail.revisionTotalPages);
  return (
    <section ref={panelRef} className={styles.detailPanel} aria-labelledby="testimonial-detail-title">
      <div className={styles.sectionHeader}>
        <div><h2 ref={headingRef} id="testimonial-detail-title" tabIndex={-1}>Testimonial history</h2><p>{withdrawn ? "Withdrawn testimonials are terminal. Internal history is retained." : "Review current status and earlier revisions."}</p></div>
        <button type="button" className={styles.iconButton} aria-label="Close testimonial history" onClick={onClose}><FiX aria-hidden="true" /></button>
      </div>
      {withdrawn && <p className={styles.lifecycleNotice}><strong>Withdrawn</strong> — no longer public and cannot be edited or restored.</p>}
      {suspended && !withdrawn && <p className={styles.lifecycleNotice}><strong>Suspended from public display.</strong> Create a fresh revision with new consent to request approval again.</p>}
      {!withdrawn && (
        <div className={styles.detailActions}>
          <button type="button" onClick={onStartEdit}>{suspended ? "Create a fresh revision" : "Edit testimonial"}</button>
          <button type="button" className={styles.dangerButton} onClick={onRequestWithdraw}>Withdraw testimonial</button>
          <p>Withdrawal ends public visibility permanently; internal history is retained for you and administrators.</p>
        </div>
      )}
      <div className={styles.revisionList}>
        {detail.revisions.map((itemRevision) => (
          <article key={itemRevision.id}>
            <header><strong>Revision {itemRevision.revisionNumber}</strong><span>{statusLabel(itemRevision.moderationStatus)}</span><time dateTime={itemRevision.createdAt}>{formatDate(itemRevision.createdAt)}</time></header>
            <p>{itemRevision.message}</p>
            <dl><div><dt>Attribution</dt><dd>{itemRevision.attributionMode === "named" ? itemRevision.publicDisplayName : "Anonymous user"}</dd></div><div><dt>Consent version</dt><dd>{itemRevision.consentVersion}</dd></div></dl>
            {itemRevision.moderationExplanation && <div className={styles.explanation}><strong>Moderation explanation</strong><p>{itemRevision.moderationExplanation}</p></div>}
          </article>
        ))}
      </div>
      <Pagination label="Testimonial revision pages" page={detail.revisionPage} totalPages={detail.revisionTotalPages} loading={state.detailLoading} metadataAvailable={metadataAvailable} onChange={onRevisionPageChange} />
    </section>
  );
}

export function TestimonialAuthorView({
  state,
  onMessageChange,
  onAttributionChange,
  onConsentChange,
  onSubmit,
  onRetry,
  onOptionsRetry,
  onLoadRetry,
  onPageChange,
  onSelectTestimonial,
  onCloseDetail,
  onStartCreate,
  onStartEdit,
  onRevisionPageChange,
  onWithdraw,
}) {
  const [confirmWithdrawal, setConfirmWithdrawal] = useState(false);
  const [navigationVersion, setNavigationVersion] = useState(0);
  const navigationRequestRef = useRef(null);
  const formPanelRef = useRef(null);
  const testimonialTextareaRef = useRef(null);
  const detailPanelRef = useRef(null);
  const detailHeadingRef = useRef(null);
  const metadataAvailable = Number.isSafeInteger(state.total) && Number.isSafeInteger(state.totalPages);
  const requestNavigation = (request) => {
    navigationRequestRef.current = request;
    setNavigationVersion((version) => version + 1);
  };
  const selectTestimonial = (submissionId) => {
    requestNavigation({ kind: "history", submissionId: Number(submissionId) });
    return onSelectTestimonial(submissionId);
  };
  const startEditing = () => {
    const started = onStartEdit();
    if (started !== false) requestNavigation({ kind: "edit" });
    return started;
  };
  const closeDetail = () => {
    navigationRequestRef.current = null;
    return onCloseDetail();
  };

  useEffect(() => {
    const request = navigationRequestRef.current;
    const target = resolveFeedbackNavigation(request, state);
    if (!target) return undefined;
    const reducedMotion = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    return scheduleFeedbackNavigation({
      section: target === "edit" ? formPanelRef.current : detailPanelRef.current,
      focusTarget: target === "edit" ? testimonialTextareaRef.current : detailHeadingRef.current,
      reducedMotion,
      onComplete: () => {
        if (navigationRequestRef.current === request) navigationRequestRef.current = null;
      },
    });
  }, [navigationVersion, state]);

  return (
    <div className={styles.panelStack}>
      <TestimonialForm state={state} sectionRef={formPanelRef} textareaRef={testimonialTextareaRef} onMessageChange={onMessageChange} onAttributionChange={onAttributionChange} onConsentChange={onConsentChange} onSubmit={onSubmit} onRetry={onRetry} onOptionsRetry={onOptionsRetry} onStartCreate={onStartCreate} />
      <section className={styles.historyPanel} aria-labelledby="testimonial-history-title">
        <div className={styles.sectionHeader}><div><h2 id="testimonial-history-title">Your testimonial submissions</h2><p>Statuses and moderation explanations apply only to the exact revision shown.</p></div><strong>{metadataAvailable ? `${state.total} submission${state.total === 1 ? "" : "s"}` : "Total unavailable"}</strong></div>
        {state.loading && <p role="status">Loading testimonial history…</p>}
        {state.status === "error" && <div className={styles.errorBox} role="alert"><span>{state.error}</span><button type="button" onClick={onLoadRetry}>Retry history</button></div>}
        {state.status === "success" && state.testimonials.length === 0 && <div className={styles.empty}><FiMessageSquare aria-hidden="true" /><h3>No testimonial submissions yet</h3><p>A submitted testimonial appears here before and after moderation.</p></div>}
        {state.testimonials.length > 0 && <div className={styles.testimonialList}>{state.testimonials.map((item) => <button type="button" key={item.id} onClick={() => selectTestimonial(item.id)}><span>{item.withdrawnAt ? "Withdrawn" : item.publicationSuspendedAt ? "Suspended" : statusLabel(item.currentRevision?.moderationStatus)}</span><strong>{item.currentRevision?.message || "Testimonial unavailable"}</strong><time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time></button>)}</div>}
        <Pagination label="Testimonial submission pages" page={state.page} totalPages={state.totalPages} loading={state.loading} metadataAvailable={metadataAvailable} onChange={onPageChange} />
      </section>
      <TestimonialDetail state={state} panelRef={detailPanelRef} headingRef={detailHeadingRef} onClose={closeDetail} onStartEdit={startEditing} onRevisionPageChange={onRevisionPageChange} onRequestWithdraw={() => setConfirmWithdrawal(true)} />
      <ConfirmModal
        open={confirmWithdrawal}
        title="Withdraw this testimonial?"
        message={state.withdrawalError || "It will be removed from public display permanently. The submission and its revision history remain available internally to you and administrators."}
        confirmLabel={state.withdrawalPhase === "sending"
          ? "Withdrawing…"
          : state.withdrawalPhase === "rate-limited"
            ? "Retry available soon"
            : state.withdrawalPhase === "uncertain"
              ? "Retry withdrawal"
              : "Withdraw testimonial"}
        danger
        confirmDisabled={["sending", "rate-limited"].includes(state.withdrawalPhase)}
        onCancel={() => setConfirmWithdrawal(false)}
        onConfirm={async () => { const confirmed = await onWithdraw(); if (confirmed) setConfirmWithdrawal(false); }}
      />
      {state.withdrawalError && <p className={styles.errorText} role="alert">{state.withdrawalError}</p>}
    </div>
  );
}

export function AuthorFeedbackPageView({
  role,
  destination,
  platformState,
  testimonialState,
  onDestinationChange,
  onPlatformMessageChange,
  onPlatformSubmit,
  onPlatformRetry,
  onPlatformSendAnother,
  onPlatformLoadRetry,
  onPlatformPageChange,
  onTestimonialMessageChange,
  onAttributionChange,
  onConsentChange,
  onTestimonialSubmit,
  onTestimonialRetry,
  onOptionsRetry,
  onTestimonialLoadRetry,
  onTestimonialPageChange,
  onSelectTestimonial,
  onCloseDetail,
  onStartCreate,
  onStartEdit,
  onRevisionPageChange,
  onWithdraw,
}) {
  return (
    <main className={styles.main}>
      <header className={styles.pageHeader}><h1>Feedback</h1><p>Choose who should receive your message. Private feedback is never converted into a public testimonial.</p></header>
      <FeedbackDestinationNav role={role} destination={destination} onChange={onDestinationChange} />
      {destination === "platform" ? (
        <PlatformFeedbackView state={platformState} onMessageChange={onPlatformMessageChange} onSubmit={onPlatformSubmit} onRetry={onPlatformRetry} onSendAnother={onPlatformSendAnother} onLoadRetry={onPlatformLoadRetry} onPageChange={onPlatformPageChange} />
      ) : (
        <TestimonialAuthorView state={testimonialState} onMessageChange={onTestimonialMessageChange} onAttributionChange={onAttributionChange} onConsentChange={onConsentChange} onSubmit={onTestimonialSubmit} onRetry={onTestimonialRetry} onOptionsRetry={onOptionsRetry} onLoadRetry={onTestimonialLoadRetry} onPageChange={onTestimonialPageChange} onSelectTestimonial={onSelectTestimonial} onCloseDetail={onCloseDetail} onStartCreate={onStartCreate} onStartEdit={onStartEdit} onRevisionPageChange={onRevisionPageChange} onWithdraw={onWithdraw} />
      )}
    </main>
  );
}

export default function AuthorFeedbackPage() {
  const initialUser = getUser();
  const [role, setRole] = useState(() => `${initialUser?.role || ""}`.toLowerCase());
  const [destination, setDestination] = useState("platform");
  const [platformState, setPlatformState] = useState(initialPlatformFeedbackState);
  const [testimonialState, setTestimonialState] = useState(initialTestimonialAuthorState);
  const platformController = useMemo(() => createPlatformFeedbackController({
    list: listOwnPlatformFeedback,
    submit: submitPlatformFeedback,
    onChange: setPlatformState,
  }), []);
  const testimonialController = useMemo(() => createTestimonialAuthorController({
    getOptions: getTestimonialOptions,
    list: listOwnTestimonials,
    detail: getOwnTestimonial,
    create: createTestimonial,
    revise: createTestimonialRevision,
    withdraw: withdrawTestimonial,
    onChange: setTestimonialState,
  }), []);

  useLayoutEffect(() => {
    platformController.activate();
    testimonialController.activate();
    const synchronizeAccount = () => {
      const user = getUser();
      const nextRole = `${user?.role || ""}`.toLowerCase();
      const eligible = ["student", "teacher"].includes(nextRole);
      const scope = { accountId: eligible ? user?.id : null, eligible };
      setRole(nextRole);
      setDestination("platform");
      platformController.setScope(scope);
      testimonialController.setScope(scope);
      if (eligible) platformController.load();
    };
    synchronizeAccount();
    const unsubscribe = subscribeToAuthChanges(synchronizeAccount);
    return () => {
      unsubscribe();
      platformController.deactivate();
      testimonialController.deactivate();
    };
  }, [platformController, testimonialController]);

  useEffect(() => {
    if (destination === "platform") {
      testimonialController.deactivate();
      platformController.activate();
      platformController.load();
      return;
    }
    platformController.deactivate();
    testimonialController.activate();
    testimonialController.loadList();
    testimonialController.loadOptions();
  }, [destination, platformController, testimonialController]);

  const changePlatformPage = (page) => {
    if (platformController.setPage(page)) platformController.load();
  };
  const changeTestimonialPage = (page) => {
    if (testimonialController.setPage(page)) testimonialController.loadList();
  };

  return (
    <div className={styles.page}>
      <Sidebar />
      <AuthorFeedbackPageView
        role={role}
        destination={destination}
        platformState={platformState}
        testimonialState={testimonialState}
        onDestinationChange={setDestination}
        onPlatformMessageChange={(value) => platformController.updateMessage(value)}
        onPlatformSubmit={() => platformController.submit()}
        onPlatformRetry={() => platformController.retrySubmission()}
        onPlatformSendAnother={() => platformController.sendAnother()}
        onPlatformLoadRetry={() => platformController.retryLoad()}
        onPlatformPageChange={changePlatformPage}
        onTestimonialMessageChange={(value) => testimonialController.updateMessage(value)}
        onAttributionChange={(value) => testimonialController.setAttribution(value)}
        onConsentChange={(value) => testimonialController.setConsent(value)}
        onTestimonialSubmit={() => testimonialController.submitDraft()}
        onTestimonialRetry={() => testimonialController.retryMutation()}
        onOptionsRetry={() => testimonialController.loadOptions({ force: true })}
        onTestimonialLoadRetry={() => testimonialController.retryList()}
        onTestimonialPageChange={changeTestimonialPage}
        onSelectTestimonial={(id) => testimonialController.selectSubmission(id)}
        onCloseDetail={() => testimonialController.closeDetail()}
        onStartCreate={() => testimonialController.startCreate()}
        onStartEdit={() => testimonialController.startEdit()}
        onRevisionPageChange={(page) => testimonialController.setRevisionPage(page)}
        onWithdraw={() => testimonialController.withdrawSelected()}
      />
    </div>
  );
}
