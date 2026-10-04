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

export function EditorActionBar({
  lessonTitle, assessmentType, status, saveState, dirty, locked, saving,
  published, publishDisabled, onPreview, onSave, onPublish, onUnpublish,
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
        : <button type="button" className={styles.primaryButton} disabled={publishDisabled} onClick={onPublish}>Publish</button>}
    </div>
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
