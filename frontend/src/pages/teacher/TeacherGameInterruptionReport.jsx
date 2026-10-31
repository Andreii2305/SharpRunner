import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { getTeacherGameInterruptionReport } from "../../services/teacherGameInterruptionReportService.js";
import { getUser, subscribeToAuthChanges } from "../../utils/auth.js";
import styles from "./TeacherPage.module.css";
import pgStyles from "./TeacherAnalyticsPage.module.css";
import {
  createTeacherGameInterruptionReportController,
  initialTeacherGameInterruptionReportState,
} from "./teacherGameInterruptionReportState.js";

const formatTime = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Time unavailable" : date.toLocaleString();
};

const eventLabel = (type) => type === "fullscreen_exit" ? "Exited fullscreen" : "Game page hidden";
const lifecycleLabel = (status) => ({
  CURRENT: "Current",
  SUPERSEDED: "Superseded",
  COMPLETED: "Completed",
}[status] || "Unknown lifecycle");

function Pager({ label, page, totalPages, metadataAvailable, loading, onPageChange }) {
  const previousDisabled = !metadataAvailable || loading || page <= 1;
  const nextDisabled = !metadataAvailable || loading || page >= totalPages;
  return <nav className={pgStyles.interruptionPager} aria-label={label}>
    <button type="button" disabled={previousDisabled} onClick={() => onPageChange(page - 1)}><FiChevronLeft aria-hidden="true" /> Previous</button>
    <span>{metadataAvailable ? (totalPages > 0 ? `Page ${page} of ${totalPages}` : `Page ${page}`) : "Page unavailable"}</span>
    <button type="button" disabled={nextDisabled} onClick={() => onPageChange(page + 1)}>Next <FiChevronRight aria-hidden="true" /></button>
  </nav>;
}

export function RecordedInterruptionsButton({ levelKey, expanded, exactClassroom, onClick }) {
  const detailId = `recorded-interruptions-${levelKey}`;
  return <button
    type="button"
    className={pgStyles.interruptionDisclosureButton}
    aria-expanded={expanded}
    aria-controls={detailId}
    disabled={!exactClassroom}
    title={exactClassroom ? undefined : "Select one classroom to view recorded interruptions."}
    onClick={onClick}
  >Recorded interruptions{!exactClassroom && <span className={pgStyles.srOnly}> — Select one classroom</span>}</button>;
}

export function TeacherGameInterruptionReportView({ state, onRetry, onSessionPageChange, onEventPageChange }) {
  const report = state.report;
  const sessionsMetadata = Number.isSafeInteger(report?.sessions?.totalPages);
  const eventsMetadata = Number.isSafeInteger(report?.events?.totalPages);
  const retryable = state.status === "error" || state.status === "integrity-error";

  return <section className={pgStyles.interruptionReport} aria-labelledby="recorded-interruptions-title">
    <div className={pgStyles.interruptionHeader}>
      <div>
        <h4 id="recorded-interruptions-title">Recorded interruptions</h4>
        <p>Recorded browser interruptions include fullscreen exits and times the game page became hidden. They are not proof of cheating and may not represent every actual tab switch.</p>
      </div>
    </div>

    {state.status === "loading" && <div className={styles.loadingText} role="status">Loading recorded interruptions…</div>}
    {(state.status === "error" || state.status === "integrity-error" || state.status === "inaccessible") && <div className={pgStyles.interruptionState} role="alert">
      <span>{state.error}</span>
      {retryable && <button type="button" className={styles.btnOutline} onClick={onRetry}>Retry report</button>}
    </div>}

    {state.status === "success" && report && <>
      <dl className={pgStyles.interruptionSummary}>
        <div><dt>Recorded</dt><dd>{report.summary.recordedEventCount}</dd></div>
        <div><dt>Applied</dt><dd>{report.summary.appliedEventCount}</dd></div>
        <div><dt>Unapplied</dt><dd>{report.summary.unappliedEventCount}</dd></div>
        <div><dt>Actual score deduction</dt><dd>{report.summary.actualScoreDeduction}</dd></div>
        <div><dt>Actual XP deduction</dt><dd>{report.summary.actualXpDeduction}</dd></div>
      </dl>

      {report.summary.recordedEventCount === 0 && <p className={pgStyles.interruptionEmpty}>No recorded interruptions.</p>}

      <div className={pgStyles.interruptionEvidence}>
        <h5>Completion evidence</h5>
        {report.completionEvidence.availability === "unavailable"
          ? <p>Completion evidence unavailable for this classroom and level.</p>
          : <dl>
            <div><dt>Applied events</dt><dd>{report.completionEvidence.eventCount}</dd></div>
            <div><dt>Base score</dt><dd>{report.completionEvidence.score.base}</dd></div>
            <div><dt>Score deduction</dt><dd>{report.completionEvidence.score.deducted}</dd></div>
            <div><dt>Final score</dt><dd>{report.completionEvidence.score.final}</dd></div>
            <div><dt>Gross completion XP</dt><dd>{report.completionEvidence.xp.gross}</dd></div>
            <div><dt>XP deduction</dt><dd>{report.completionEvidence.xp.deducted}</dd></div>
            <div><dt>Net completion XP</dt><dd>{report.completionEvidence.xp.net}</dd></div>
          </dl>}
      </div>

      <div className={pgStyles.interruptionHistory}>
        <h5>Session history</h5>
        {!report.sessions.items.length
          ? <p className={pgStyles.interruptionEmpty}>No recorded sessions on this page.</p>
          : <div className={pgStyles.interruptionList}>{report.sessions.items.map((session) => <article key={session.id}>
            <header><strong>{lifecycleLabel(session.lifecycleStatus)}</strong><time dateTime={session.startedAt}>{formatTime(session.startedAt)}</time></header>
            <dl>
              <div><dt>Saved score rate</dt><dd>{session.scoreDeductionSnapshot} per interruption</dd></div>
              <div><dt>Saved XP rate</dt><dd>{session.xpDeductionSnapshot} per interruption</dd></div>
              <div><dt>Recorded</dt><dd>{session.recordedEventCount}</dd></div>
              <div><dt>Applied</dt><dd>{session.appliedEventCount}</dd></div>
              <div><dt>Unapplied</dt><dd>{session.unappliedEventCount}</dd></div>
              <div><dt>Actual deductions</dt><dd>{session.actualScoreDeduction} score · {session.actualXpDeduction} XP</dd></div>
            </dl>
          </article>)}</div>}
      </div>

      <div className={pgStyles.interruptionHistory}>
        <h5>Event history</h5>
        {!report.events.items.length
          ? <p className={pgStyles.interruptionEmpty}>No recorded events on this page.</p>
          : <div className={pgStyles.interruptionList}>{report.events.items.map((event) => <article key={event.id}>
            <header><strong>{eventLabel(event.type)}</strong><time dateTime={event.receivedAt}>{formatTime(event.receivedAt)}</time></header>
            {event.applicationStatus === "applied"
              ? <p><strong>Applied</strong> · {event.actualScoreDeduction} score points · {event.actualXpDeduction} XP</p>
              : <p><strong>Unapplied</strong> · Not applied</p>}
          </article>)}</div>}
      </div>
    </>}

    <Pager
      label="Session history pages"
      page={state.sessionPage}
      totalPages={report?.sessions?.totalPages ?? 0}
      metadataAvailable={sessionsMetadata}
      loading={state.loading}
      onPageChange={onSessionPageChange}
    />
    <Pager
      label="Event history pages"
      page={state.eventPage}
      totalPages={report?.events?.totalPages ?? 0}
      metadataAvailable={eventsMetadata}
      loading={state.loading}
      onPageChange={onEventPageChange}
    />
  </section>;
}

export default function TeacherGameInterruptionReport({
  accountId,
  classroomId,
  studentId,
  levelKey,
  controllerRef,
}) {
  const [state, setState] = useState(initialTeacherGameInterruptionReportState);
  const controller = useMemo(() => createTeacherGameInterruptionReportController({
    request: getTeacherGameInterruptionReport,
    onChange: setState,
  }), []);

  useLayoutEffect(() => {
    controller.activate();
    if (controllerRef) controllerRef.current = controller;
    controller.setScope({ accountId, classroomId, studentId, levelKey });
    controller.open();
    return () => {
      if (controllerRef?.current === controller) controllerRef.current = null;
      controller.dispose();
    };
  }, [accountId, classroomId, controller, controllerRef, levelKey, studentId]);

  useEffect(() => subscribeToAuthChanges(() => {
    const user = getUser();
    controller.setScope({ accountId: user?.id, classroomId, studentId, levelKey });
    controller.open();
  }), [classroomId, controller, levelKey, studentId]);

  return <TeacherGameInterruptionReportView
    state={state}
    onRetry={() => controller.retry()}
    onSessionPageChange={(page) => controller.setSessionPage(page)}
    onEventPageChange={(page) => controller.setEventPage(page)}
  />;
}
