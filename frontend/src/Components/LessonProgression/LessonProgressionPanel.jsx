import styles from "./LessonProgressionPanel.module.css";

const STATE_LABELS = {
  complete: "Completed",
  completed: "Completed",
  current: "Current",
  available: "Available",
  locked: "Locked",
  blocked: "Blocked",
};

const STATE_MARKERS = {
  complete: "✓",
  completed: "✓",
  current: "●",
  available: "○",
  locked: "○",
  blocked: "!",
};

export default function LessonProgressionPanel({ title = "Lesson progression", model, showAction = true }) {
  if (!model) return null;
  const headingId = `lesson-progression-${model.lessonKey ?? "current"}`;
  const renderAction = showAction && !model.lessonCompleted;
  return <section className={styles.panel} aria-labelledby={headingId}>
    <div className={styles.headingRow}>
      <div>
        <span className={styles.eyebrow}>Lesson progress</span>
        <h2 id={headingId}>{title}</h2>
      </div>
      {model.lessonCompleted && <span className={styles.completeBadge}>Lesson Complete</span>}
    </div>
    <ol className={styles.steps}>
      {model.steps.map((step) => <li key={step.id ?? step.key} data-state={step.state}>
        <span className={styles.marker} aria-hidden="true">{STATE_MARKERS[step.state] ?? "○"}</span>
        <span>{step.label}</span>
        <small>{STATE_LABELS[step.state] ?? step.state}</small>
      </li>)}
    </ol>
    {renderAction && (model.action.disabled || !model.action.href
      ? <p className={styles.blockedAction} role="status">{model.action.label}</p>
      : <a className={styles.action} href={model.action.href}>{model.action.label}</a>)}
  </section>;
}
