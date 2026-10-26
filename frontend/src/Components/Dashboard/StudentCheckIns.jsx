import styles from "./Dashboard.module.css";

const senderName = (sender) => {
  if (!sender) return "Sender unavailable";
  const fullName = [sender.firstName, sender.lastName].filter(Boolean).join(" ").trim();
  return fullName || (sender.username ? `@${sender.username}` : "Sender unavailable");
};
const roleLabel = (role) => role === "admin" ? "Administrator" : role === "teacher" ? "Teacher" : "Sender role unavailable";
const classroomLabel = (classroom) => {
  if (!classroom) return "Classroom unavailable";
  return [classroom.className, classroom.section, classroom.schoolYear].filter(Boolean).join(" · ") || "Classroom unavailable";
};
const createdLabel = (value) => {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toLocaleString() : "Time unavailable";
};

export function StudentCheckIns({ state, onRetry, onRefresh, onPrevious, onNext, onMarkRead }) {
  const metadataAvailable = Number.isSafeInteger(state.totalPages) && Number.isSafeInteger(state.total);
  const unreadAvailable = Number.isSafeInteger(state.unreadTotal);
  const inFlight = new Set(state.markInFlight || []);

  return (
    <section className={styles.checkInPanel} aria-label="Private check-ins">
      <div className={styles.checkInSummary} aria-live="polite">
        {unreadAvailable
          ? `${state.unreadTotal} unread check-in${state.unreadTotal === 1 ? "" : "s"}`
          : "Unread count unavailable"}
      </div>

      {state.loading ? (
        <div className={styles.loadingText}>Loading check-ins...</div>
      ) : state.status === "error" ? (
        <div className={styles.checkInStatus} role="alert">
          <p>{state.error}</p>
          <button type="button" onClick={onRetry}>Retry</button>
        </div>
      ) : state.status === "success" && state.checkIns.length === 0 ? (
        <div className={styles.emptyText}>No check-ins yet.</div>
      ) : (
        <div className={styles.checkInList}>
          {state.checkIns.map((checkIn) => {
            const marking = inFlight.has(checkIn.id);
            const hasSenderName = Boolean([checkIn.sender?.firstName, checkIn.sender?.lastName].filter(Boolean).join(" ").trim());
            return (
              <article className={styles.checkInItem} key={checkIn.id}>
                <div className={styles.checkInHeader}>
                  <div>
                    <strong>{senderName(checkIn.sender)}</strong>
                    {hasSenderName && checkIn.sender?.username && <span> @{checkIn.sender.username}</span>}
                  </div>
                  <span>{roleLabel(checkIn.senderRole)}</span>
                </div>
                <p className={styles.checkInMessage}>{checkIn.message}</p>
                <div className={styles.checkInMeta}>
                  <span>{classroomLabel(checkIn.classroom)}</span>
                  {checkIn.classroom && !checkIn.classroom.isActive && <span>Archived classroom</span>}
                  <time dateTime={checkIn.createdAt || undefined}>{createdLabel(checkIn.createdAt)}</time>
                </div>
                {!checkIn.isRead && (
                  <button
                    type="button"
                    className={styles.checkInReadButton}
                    disabled={marking}
                    onClick={() => onMarkRead(checkIn.id)}
                  >
                    {marking ? "Marking as read..." : "Mark as read"}
                  </button>
                )}
                {state.markErrors?.[checkIn.id] && <p className={styles.notifError} role="alert">{state.markErrors[checkIn.id]}</p>}
              </article>
            );
          })}
        </div>
      )}

      {state.refreshError && (
        <div className={styles.checkInStatus} role="status">
          <p>{state.refreshError}</p>
          <button type="button" onClick={onRefresh} disabled={state.refreshing}>
            {state.refreshing ? "Refreshing..." : "Retry refresh"}
          </button>
        </div>
      )}

      <nav className={styles.checkInPagination} aria-label="Check-in pages">
        <button type="button" onClick={onPrevious} disabled={!metadataAvailable || state.loading || state.page <= 1}>Previous</button>
        <span>{metadataAvailable ? `Page ${state.page} of ${state.totalPages}` : `Page ${state.page}`}</span>
        <button type="button" onClick={onNext} disabled={!metadataAvailable || state.loading || state.page >= state.totalPages}>Next</button>
      </nav>
    </section>
  );
}
