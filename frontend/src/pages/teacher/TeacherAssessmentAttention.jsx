import styles from "./TeacherPage.module.css";
import pgStyles from "./TeacherDashboardPage.module.css";

const classroomLabel = (classroom) => (
  [classroom?.className, classroom?.section].filter(Boolean).join(" · ") || "Classroom"
);

const studentName = (student) => (
  [student?.firstName, student?.lastName].filter(Boolean).join(" ").trim()
  || student?.username
  || "Student"
);

export function TeacherAssessmentAttentionCard({
  classrooms,
  classroomStatus,
  classroomError,
  selectedClassroomId,
  state,
  onClassroomChange,
  onRetry,
  onRetryClassrooms,
}) {
  const options = Array.isArray(classrooms) ? classrooms : [];
  const hasClassrooms = options.length > 0;
  const successful = state.status === "success";

  return (
    <div className={styles.card}>
      <div className={styles.sectionHead}>
        <div>
          <div className={styles.sectionTitle}>Students needing attention</div>
          <div className={styles.statSub}>Built-in POST assessments requiring teacher recovery.</div>
        </div>
      </div>

      {hasClassrooms && (
        <label className={pgStyles.attentionClassroomLabel} htmlFor="teacher-attention-classroom">
          Classroom
          <select
            id="teacher-attention-classroom"
            aria-label="Classroom for students needing attention"
            value={selectedClassroomId ?? ""}
            onChange={(event) => onClassroomChange(event.target.value)}
          >
            {options.map((classroom) => (
              <option key={classroom.id} value={classroom.id}>{classroomLabel(classroom)}</option>
            ))}
          </select>
        </label>
      )}

      {classroomStatus === "loading" && !hasClassrooms ? (
        <div className={styles.loadingText} role="status">Loading active classrooms...</div>
      ) : classroomStatus === "error" ? (
        <div className={pgStyles.sectionError} role="alert">
          <span>{classroomError || "Unable to load active classrooms."}</span>
          <button type="button" className={styles.btnOutline} onClick={onRetryClassrooms}>Retry classrooms</button>
        </div>
      ) : !hasClassrooms ? (
        <div className={styles.emptyText}>No active classrooms are available.</div>
      ) : state.status === "loading" || state.loading ? (
        <div className={styles.loadingText} role="status">Loading students needing attention...</div>
      ) : state.status === "error" ? (
        <div className={pgStyles.sectionError} role="alert">
          <span>{state.error || "Unable to load students needing attention."}</span>
          <button type="button" className={styles.btnOutline} onClick={onRetry}>Retry</button>
        </div>
      ) : successful && state.students.length === 0 ? (
        <div className={styles.emptyText}>No built-in POST assessments currently require recovery in this classroom.</div>
      ) : successful ? (
        <div className={pgStyles.attentionList}>
          {state.students.map((student) => (
            <article key={student.id} className={pgStyles.attentionStudent}>
              <div className={pgStyles.attentionStudentIdentity}>
                <strong>{studentName(student)}</strong>
                {student.username && <span>@{student.username}</span>}
              </div>
              <ul className={pgStyles.attentionReasons}>
                {(student.reasons ?? []).map((reason) => (
                  <li key={`${reason.target?.lessonKey ?? "lesson"}:${reason.assessment?.id ?? "assessment"}`}>
                    <strong>{reason.target?.lessonTitle || "Built-in lesson"}</strong>
                    <span>{reason.assessment?.title || "POST assessment"}</span>
                    <p>{reason.message}</p>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      ) : null}

      {successful && Number.isSafeInteger(state.total) && (
        <p className={pgStyles.attentionCount}>
          {state.students.length} shown of {state.total} students requiring recovery
        </p>
      )}
    </div>
  );
}
