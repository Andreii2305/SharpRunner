import { FiEye, FiPlus, FiSave } from "react-icons/fi";
import styles from "./TeacherAssessmentBuilderPage.module.css";

const saveStateLabel = (saveState) => (
  saveState === "unsaved" ? "Unsaved changes"
    : saveState === "saving" ? "Saving…"
      : saveState === "error" ? "Save failed" : "Saved"
);

const questionLabel = (question, index) => {
  const prompt = question.questionText?.trim();
  if (!prompt) return `Question ${index + 1}`;
  return prompt.length > 52 ? `${prompt.slice(0, 49).trimEnd()}…` : prompt;
};

export function CustomAssessmentScope({ target, selectedClassroom, classroomId }) {
  return <section className={`${styles.selectorCard} ${styles.customScope}`} aria-labelledby="assessment-scope-heading">
    <div><span>Custom classroom lesson</span><h2 id="assessment-scope-heading">{target?.lessonTitle ?? "Loading lesson…"}</h2><p><strong>{target?.classroom?.className ?? selectedClassroom?.className ?? "Classroom"}</strong>{target?.classroom?.section ? ` — ${target.classroom.section}` : ""} · Assessments</p></div>
    <a href={`/teacher/lessons?classroomId=${encodeURIComponent(classroomId)}`}>Back to lesson library</a>
  </section>;
}

export function EditorActionBar({
  lessonTitle, assessmentType, status, saveState, dirty, locked, saving,
  published, publishDisabled, publicationAvailable = true, onPreview, onSave, onPublish, onUnpublish,
}) {
  return <section className={styles.editorActionBar} aria-label="Assessment editor actions">
    <div className={styles.actionContext}>
      <span>{lessonTitle}</span>
      <strong>{assessmentType}-Test</strong>
      <span className={styles.compactStatus}>{status}</span>
    </div>
    <div className={styles.persistentActions}>
      <span className={styles.saveState} role="status" aria-live="polite" aria-atomic="true">{saveStateLabel(saveState)}</span>
      <button type="button" onClick={onPreview}><FiEye /> Preview</button>
      <button type="button" className={styles.saveButton} disabled={locked || !dirty || saving} onClick={onSave}><FiSave /> Save Draft</button>
      {published
        ? <button type="button" disabled={locked || dirty} onClick={onUnpublish}>Unpublish</button>
        : !publicationAvailable ? <span className={styles.draftOnly}>Draft only</span>
        : <button type="button" className={styles.primaryButton} disabled={publishDisabled} onClick={onPublish}>Publish</button>}
    </div>
  </section>;
}

export function CustomDraftNotice({
  revisionReviewRequired, boundVersion, currentVersion, pending, onReview,
  publication,
}) {
  const blocker = {
    PUBLICATION_DISABLED: "Publishing is disabled on this server. Draft editing remains available.",
    ACCESS_HISTORY_UNCERTAIN: "Required PRE publication is unavailable because reliable prior-access history is missing. Make it optional or use an independent lesson copy.",
    PLACEMENT_ARCHIVED: "Restore this lesson placement before publishing.",
    CLASSROOM_INACTIVE: "Restore this classroom before publishing.",
    LESSON_UNPUBLISHED: "Publish or schedule the lesson before publishing its assessment.",
    LESSON_SCHEDULE_INVALID: "Fix the lesson schedule before publishing its assessment.",
    REVISION_REVIEW_REQUIRED: "Review the current lesson revision before publishing.",
    ALREADY_PUBLISHED: "Published for this lesson revision.",
  }[publication?.reason] || "This draft can be published after it is saved and passes server validation.";
  const explanation = publication?.enabled === false && publication?.reason !== "PUBLICATION_DISABLED"
    ? `${blocker} Publication is also disabled on this server.`
    : blocker;
  return <section className={styles.customDraftNotice} aria-label="Custom lesson assessment status">
    <div>
      <strong>Publication status</strong>
      <span>{explanation}</span>
      {revisionReviewRequired && <span role="alert">Revision {boundVersion} is bound to this draft. The lesson is now revision {currentVersion}.</span>}
    </div>
    {revisionReviewRequired && <button type="button" disabled={pending} onClick={onReview}>{pending ? "Reviewing…" : "Review current revision"}</button>}
  </section>;
}

export function QuestionNavigator({ questions, activeQuestionId, disabled, onNavigate, onAdd }) {
  return <nav className={styles.questionNavigator} aria-label="Question navigation">
    <div className={styles.navigatorHeading}>
      <h2>Questions</h2>
      <span>{questions.length}</span>
    </div>
    <ol>
      {questions.map((question, index) => <li key={question.clientId}>
        <button
          type="button"
          className={question.clientId === activeQuestionId ? styles.currentQuestion : ""}
          aria-current={question.clientId === activeQuestionId ? "true" : undefined}
          onClick={() => onNavigate(question.clientId)}
          title={question.questionText?.trim() || `Question ${index + 1}`}
        >
          <span>{String(index + 1).padStart(2, "0")}</span>
          <strong>{questionLabel(question, index)}</strong>
        </button>
      </li>)}
    </ol>
    <button type="button" className={styles.navigatorAdd} disabled={disabled} onClick={onAdd}><FiPlus /> Add question</button>
  </nav>;
}
