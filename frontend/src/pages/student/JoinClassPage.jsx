import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { clearToken, getUser, subscribeToAuthChanges } from "../../utils/auth";
import {
  getStudentClassroomSummary,
  submitStudentJoinRequest,
} from "../../services/studentClassMembershipService";
import {
  createStudentJoinRequestController,
  getSubmissionNotice,
} from "./studentJoinRequestState";
import styles from "./JoinClassPage.module.css";

const normalizeClassCode = (value) => (
  (typeof value === "string" ? value : "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
);

const initialState = () => ({
  status: "loading",
  hasData: false,
  hasActiveMembership: false,
  classrooms: [],
  requestStates: [],
  error: "",
  refreshWarning: "",
  notice: null,
  checking: false,
});

const classroomLabel = (classroom) => [
  classroom?.className,
  classroom?.section ? `Section ${classroom.section}` : null,
  classroom?.schoolYear,
].filter(Boolean);

const RequestStatus = ({ request }) => {
  const labels = {
    pending: {
      heading: "Awaiting teacher approval",
      detail: "Your teacher needs to approve this request before it grants classroom access.",
    },
    approved: {
      heading: "Approved",
      detail: "This classroom is now available from your dashboard.",
    },
    "no-longer-pending": {
      heading: "Request no longer pending",
      detail: "This request changed, but no active membership was found for this classroom.",
    },
  };
  const copy = labels[request.state] ?? labels.pending;

  return (
    <li className={styles.requestItem} data-state={request.state}>
      <div>
        <h3>{request.classroom.className}</h3>
        <p>{classroomLabel(request.classroom).slice(1).join(" · ")}</p>
      </div>
      <div className={styles.requestStatus}>
        <strong>{copy.heading}</strong>
        <span>{copy.detail}</span>
      </div>
    </li>
  );
};

export function JoinClassView({
  state,
  classCode,
  isSubmitting,
  onClassCodeChange,
  onSubmit,
  onCheckStatus,
  onRetry,
  onContinue,
  onLogout,
}) {
  if (state.status === "loading" && !state.hasData) {
    return (
      <main className={styles.page}>
        <section className={styles.card} aria-live="polite">
          <div className={styles.cardHeader}>
            <p className={styles.badge}>Classroom access</p>
            <button type="button" className={styles.logoutButton} onClick={onLogout}>Logout</button>
          </div>
          <h1>Checking your classroom status...</h1>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <p className={styles.badge}>Classroom access</p>
          <button type="button" className={styles.logoutButton} onClick={onLogout}>Logout</button>
        </div>
        <h1>Join your class</h1>
        <p className={styles.description}>
          Enter the code from your teacher. They will review your request before access is granted.
        </p>

        {state.hasActiveMembership ? (
          <div className={styles.activeNotice}>
            <p>You have an active classroom membership.</p>
            <button type="button" className={styles.secondaryButton} onClick={onContinue}>
              Continue to dashboard
            </button>
          </div>
        ) : null}

        {state.requestStates.length > 0 ? (
          <section className={styles.statusSection} aria-labelledby="request-status-heading">
            <div className={styles.statusHeader}>
              <div>
                <h2 id="request-status-heading">Join request status</h2>
                <p>Status is updated only when you check.</p>
              </div>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={onCheckStatus}
                disabled={state.checking}
              >
                {state.checking ? "Checking status..." : "Check status"}
              </button>
            </div>
            <ul className={styles.requestList}>
              {state.requestStates.map((request) => (
                <RequestStatus key={request.classroom.id} request={request} />
              ))}
            </ul>
          </section>
        ) : null}

        {state.status === "error" && !state.hasData ? (
          <div className={styles.errorPanel} role="alert">
            <p>{state.error}</p>
            <button type="button" className={styles.secondaryButton} onClick={onRetry}>Retry</button>
          </div>
        ) : null}

        {state.notice ? (
          <p className={state.notice.type === "success" ? styles.success : styles.info} role="status">
            {state.notice.message}
          </p>
        ) : null}
        {state.refreshWarning ? <p className={styles.warning} role="alert">{state.refreshWarning}</p> : null}
        {state.error && state.hasData ? <p className={styles.error} role="alert">{state.error}</p> : null}

        <form className={styles.form} onSubmit={onSubmit}>
          <label htmlFor="classCode">Class code</label>
          <input
            id="classCode"
            name="classCode"
            type="text"
            value={classCode}
            onChange={onClassCodeChange}
            placeholder="Example: NASDAQ"
            maxLength={12}
            autoComplete="off"
          />
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Sending request..." : "Request to join"}
          </button>
        </form>
      </section>
    </main>
  );
}

function JoinClassPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [accountId, setAccountId] = useState(() => `${getUser()?.id ?? ""}`);
  const [classCode, setClassCode] = useState("");
  const [state, setState] = useState(initialState);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const redirectTo = useMemo(() => {
    const fromPath = location.state?.from;
    return typeof fromPath === "string" && fromPath.startsWith("/")
      ? fromPath
      : "/dashboard";
  }, [location.state]);

  const controller = useMemo(() => createStudentJoinRequestController({
    getMembershipSummary: getStudentClassroomSummary,
    submitJoinRequest: submitStudentJoinRequest,
    onReset: () => {
      setState(initialState());
      setClassCode("");
      setIsSubmitting(false);
    },
    onLoading: (loading, reason) => setState((previous) => ({
      ...previous,
      status: loading && !previous.hasData ? "loading" : previous.status,
      checking: loading && reason !== "initial" && reason !== "after-submit",
      error: loading ? "" : previous.error,
    })),
    onSummary: (result, { reason }) => {
      const approved = result.requestStates.find((request) => request.state === "approved");
      const disappeared = result.requestStates.find((request) => request.state === "no-longer-pending");
      setState((previous) => ({
        ...previous,
        status: "success",
        hasData: true,
        hasActiveMembership: result.hasActiveMembership === true,
        classrooms: result.classrooms,
        requestStates: result.requestStates,
        error: "",
        refreshWarning: "",
        notice: reason === "check" && approved
          ? { type: "success", message: `${approved.classroom.className} was approved.` }
          : reason === "check" && disappeared
            ? { type: "info", message: `${disappeared.classroom.className} is no longer pending. No active membership was found.` }
            : previous.notice,
      }));
    },
    onLoadError: (error) => setState((previous) => ({
      ...previous,
      status: previous.hasData ? previous.status : "error",
      error: error.message,
    })),
    onSubmitPending: setIsSubmitting,
    onSubmitConfirmed: (result) => {
      if (result.membership?.status === "active") {
        setState((previous) => ({
          ...previous,
          hasActiveMembership: true,
          notice: getSubmissionNotice(result),
          error: "",
          refreshWarning: "",
        }));
        return;
      }
      setState((previous) => {
        const request = {
          classroom: result.classroom,
          requestedAt: result.membership?.requestedAt ?? null,
          state: "pending",
        };
        const requestStates = [
          request,
          ...previous.requestStates.filter((item) => `${item.classroom.id}` !== `${result.classroom.id}`),
        ];
        return {
          ...previous,
          status: "success",
          hasData: true,
          requestStates,
          notice: getSubmissionNotice(result),
          error: "",
          refreshWarning: "",
        };
      });
      setClassCode("");
    },
    onSubmitError: (error) => setState((previous) => ({
      ...previous,
      error: error.message,
      refreshWarning: "",
    })),
    onRefreshAfterSubmitError: () => setState((previous) => ({
      ...previous,
      refreshWarning: "Your request was saved, but its latest status could not be refreshed. Use Check status before taking another action.",
    })),
  }), []);

  useEffect(() => subscribeToAuthChanges(() => {
    setAccountId(`${getUser()?.id ?? ""}`);
  }), []);

  useLayoutEffect(() => {
    controller.setAccount(accountId);
    if (accountId) controller.load({ reason: "initial" });
    return () => controller.dispose();
  }, [accountId, controller]);

  const onSubmit = (event) => {
    event.preventDefault();
    const normalizedCode = normalizeClassCode(classCode);
    if (!normalizedCode) {
      setState((previous) => ({ ...previous, error: "Enter your class code." }));
      return;
    }
    controller.submit({ classCode: normalizedCode });
  };

  const onLogout = () => {
    clearToken();
    navigate("/login", { replace: true });
  };

  return (
    <JoinClassView
      state={state}
      classCode={classCode}
      isSubmitting={isSubmitting}
      onClassCodeChange={(event) => setClassCode(event.target.value)}
      onSubmit={onSubmit}
      onCheckStatus={() => controller.load({ reason: "check" })}
      onRetry={() => controller.load({ reason: "initial" })}
      onContinue={() => navigate(redirectTo, { replace: true })}
      onLogout={onLogout}
    />
  );
}

export default JoinClassPage;
