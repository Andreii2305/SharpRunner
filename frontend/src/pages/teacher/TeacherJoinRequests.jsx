import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FiCheck, FiChevronLeft, FiChevronRight, FiUserPlus, FiX } from "react-icons/fi";
import {
  decideTeacherJoinRequest,
  listTeacherJoinRequests,
} from "../../services/teacherJoinRequestService.js";
import {
  createJoinRequestController,
  getDecisionRefreshNotice,
} from "./teacherJoinRequestState.js";
import styles from "./TeacherPage.module.css";
import detailStyles from "./TeacherClassDetailPage.module.css";

const PAGE_SIZE = 10;
const emptyState = () => ({
  status: "loading",
  requests: [],
  total: 0,
  page: 1,
  limit: PAGE_SIZE,
  totalPages: 1,
  error: "",
  hasData: false,
});

const studentName = (request) => (
  `${request?.student?.firstName ?? ""} ${request?.student?.lastName ?? ""}`.trim()
  || request?.student?.username
  || "Student"
);

export function JoinRequestsView({
  state,
  pendingStudentIds,
  confirmedStudentIds,
  notice,
  onDecision,
  onRetry,
  onRetryRefresh,
  onPageChange,
  registerAction,
  headingRef,
}) {
  const showInitialLoading = state.status === "loading" && !state.hasData;
  const showEmpty = state.status === "success" && state.hasData && state.requests.length === 0;
  const plural = state.total === 1 ? "request" : "requests";

  return (
    <section className={detailStyles.joinRequests} aria-labelledby="join-requests-heading">
      <div className={detailStyles.joinRequestsHeader}>
        <div>
          <h2 id="join-requests-heading" ref={headingRef} tabIndex={-1}>Join requests</h2>
          <p>{state.hasData ? `${state.total} pending ${plural}` : "Pending requests are counted separately from enrolled students."}</p>
        </div>
        {state.status === "loading" && state.hasData && <span role="status">Refreshing…</span>}
      </div>

      {notice && (
        <div className={detailStyles.joinRequestNotice} role={notice.type === "error" ? "alert" : "status"}>
          <span>{notice.message}</span>
          {notice.retry && <button type="button" className={styles.btnOutline} onClick={onRetryRefresh}>Retry refresh</button>}
        </div>
      )}

      {showInitialLoading && <div className={detailStyles.joinRequestLoading} role="status">Loading join requests…</div>}
      {state.status === "error" && (
        <div className={detailStyles.sectionState} role="alert">
          <span>{state.error}</span>
          <button type="button" className={styles.btnOutline} onClick={onRetry}>Retry</button>
        </div>
      )}
      {showEmpty && (
        <div className={detailStyles.joinRequestEmpty}>
          <FiUserPlus aria-hidden="true" />
          <strong>No pending join requests</strong>
          <span>New requests will appear here.</span>
        </div>
      )}

      {state.requests.length > 0 && (
        <div className={detailStyles.joinRequestList}>
          {state.requests.map((request, index) => {
            const isPending = pendingStudentIds.has(request.studentId);
            const isConfirmed = confirmedStudentIds.has(request.studentId);
            const disabled = isPending || isConfirmed;
            const name = studentName(request);
            return (
              <article key={request.id ?? request.studentId} className={detailStyles.joinRequestRow}>
                <div>
                  <strong>{name}</strong>
                  <span>@{request.student?.username}</span>
                </div>
                <div className={detailStyles.joinRequestActions}>
                  <button
                    ref={(element) => registerAction(request.studentId, element)}
                    type="button"
                    className={detailStyles.joinRequestApprove}
                    disabled={disabled}
                    aria-label={`Approve ${name}`}
                    onClick={() => onDecision(request.studentId, "approve", index)}
                  ><FiCheck aria-hidden="true" />{isPending ? "Working…" : isConfirmed ? "Processed" : "Approve"}</button>
                  <button
                    type="button"
                    className={detailStyles.joinRequestReject}
                    disabled={disabled}
                    aria-label={`Reject ${name}`}
                    onClick={() => onDecision(request.studentId, "reject", index)}
                  ><FiX aria-hidden="true" />Reject</button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {state.hasData && state.totalPages > 1 && (
        <nav className={detailStyles.joinRequestPagination} aria-label="Join request pages">
          <button type="button" onClick={() => onPageChange(state.page - 1)} disabled={state.page <= 1 || state.status === "loading"}>
            <FiChevronLeft aria-hidden="true" /> Previous
          </button>
          <span>Page {state.page} of {state.totalPages}</span>
          <button type="button" onClick={() => onPageChange(state.page + 1)} disabled={state.page >= state.totalPages || state.status === "loading"}>
            Next <FiChevronRight aria-hidden="true" />
          </button>
        </nav>
      )}
    </section>
  );
}

export default function TeacherJoinRequests({ classroomId, onRosterRefresh }) {
  const [state, setState] = useState(emptyState);
  const [pendingStudentIds, setPendingStudentIds] = useState(new Set());
  const [confirmedStudentIds, setConfirmedStudentIds] = useState(new Set());
  const [notice, setNotice] = useState(null);
  const [refreshRetryContext, setRefreshRetryContext] = useState(null);
  const [focusTarget, setFocusTarget] = useState(null);
  const actionRefs = useRef(new Map());
  const headingRef = useRef(null);

  const controller = useMemo(() => createJoinRequestController({
    listRequests: listTeacherJoinRequests,
    decideRequest: decideTeacherJoinRequest,
    onListLoading: ({ page, preserveData }) => setState((current) => ({
      ...(preserveData ? current : { ...current, requests: current.hasData ? current.requests : [] }),
      page,
      status: "loading",
      error: "",
    })),
    onListSuccess: (result) => {
      setState({ ...result, status: "success", error: "", hasData: true });
      const visible = new Set(result.requests.map((request) => request.studentId));
      setConfirmedStudentIds((current) => new Set([...current].filter((studentId) => visible.has(studentId))));
    },
    onListError: (error) => setState((current) => ({ ...current, status: "error", error: error.message })),
    onPageChange: (page) => setState((current) => ({ ...current, page })),
    onDecisionPending: (studentId, pending) => setPendingStudentIds((current) => {
      const next = new Set(current);
      if (pending) next.add(studentId); else next.delete(studentId);
      return next;
    }),
    onDecisionConfirmed: (_result, context) => {
      setConfirmedStudentIds((current) => new Set(current).add(context.studentId));
      setRefreshRetryContext(null);
      setNotice({
        type: "success",
        message: context.decision === "approve"
          ? "The request was approved. Refreshing the pending list and roster…"
          : "The request was rejected. Refreshing the pending list and roster…",
      });
    },
    onDecisionError: (error) => {
      setRefreshRetryContext(null);
      setNotice({ type: "error", message: error.message });
    },
    onRefreshAfterDecisionComplete: (outcome, context) => {
      if (!outcome.pendingList) {
        setState((current) => ({ ...current, status: current.hasData ? "success" : "error" }));
      }
      setRefreshRetryContext(outcome.pendingList && outcome.roster ? null : context);
      setNotice(getDecisionRefreshNotice(outcome, context));
    },
    onRosterRefresh,
    onFocusTarget: setFocusTarget,
  }), [onRosterRefresh]);

  useLayoutEffect(() => {
    setState(emptyState());
    setPendingStudentIds(new Set());
    setConfirmedStudentIds(new Set());
    setNotice(null);
    setRefreshRetryContext(null);
    setFocusTarget(null);
    actionRefs.current.clear();
    controller.setClassroom(classroomId);
    controller.load({ classroomId, page: 1, limit: PAGE_SIZE });
    return () => controller.dispose();
  }, [classroomId, controller]);

  useEffect(() => {
    if (!focusTarget) return undefined;
    const schedule = typeof requestAnimationFrame === "function" ? requestAnimationFrame : setTimeout;
    const cancel = typeof cancelAnimationFrame === "function" ? cancelAnimationFrame : clearTimeout;
    const handle = schedule(() => {
      if (focusTarget.type === "student") actionRefs.current.get(focusTarget.studentId)?.focus();
      else headingRef.current?.focus();
      setFocusTarget(null);
    });
    return () => cancel(handle);
  }, [focusTarget, state.requests]);

  const registerAction = useCallback((studentId, element) => {
    if (element) actionRefs.current.set(studentId, element);
    else actionRefs.current.delete(studentId);
  }, []);

  const retry = useCallback(() => {
    setNotice(null);
    controller.load({ classroomId, page: state.page, limit: PAGE_SIZE });
  }, [classroomId, controller, state.page]);

  const retryRefresh = useCallback(() => {
    if (!refreshRetryContext) return;
    setNotice({
      type: "success",
      message: "The decision was saved. Refreshing the pending list and rosterâ€¦",
    });
    controller.refreshAfterDecision({
      context: refreshRetryContext,
      page: state.page,
      limit: PAGE_SIZE,
    });
  }, [controller, refreshRetryContext, state.page]);

  const changePage = useCallback((page) => {
    if (page < 1 || page > state.totalPages || page === state.page) return;
    setNotice(null);
    controller.load({ classroomId, page, limit: PAGE_SIZE });
  }, [classroomId, controller, state.page, state.totalPages]);

  const decide = useCallback((studentId, decision, rowIndex) => {
    controller.decide({ classroomId, studentId, decision, page: state.page, limit: PAGE_SIZE, rowIndex });
  }, [classroomId, controller, state.page]);

  return <JoinRequestsView
    state={state}
    pendingStudentIds={pendingStudentIds}
    confirmedStudentIds={confirmedStudentIds}
    notice={notice}
    onDecision={decide}
    onRetry={retry}
    onRetryRefresh={retryRefresh}
    onPageChange={changePage}
    registerAction={registerAction}
    headingRef={headingRef}
  />;
}
