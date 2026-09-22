import styles from "./TeacherPage.module.css";
import pgStyles from "./TeacherAnalyticsPage.module.css";
import { formatTrendValue } from "./teacherAnalyticsUtils.js";

const display = (value, suffix = "") => (
  value === null || value === undefined || !Number.isFinite(Number(value))
    ? "N/A"
    : `${value}${suffix}`
);

const generatedAtLabel = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Generation time unavailable" : date.toLocaleString();
};

function TeacherAnalyticsReport({ data, filterContext }) {
  const overview = data.overview || {};
  const totals = data.historical?.totals || {};
  const unresolved = data.failurePatterns?.unresolved || {};
  const historicalFailures = data.historical?.failures || [];

  return <article className={pgStyles.report} aria-label="Teacher analytics report">
    <header className={pgStyles.reportHeader}>
      <div>
        <h1>Teacher Analytics Report</h1>
        <p>{filterContext}</p>
      </div>
      <span>Generated {generatedAtLabel(data.meta?.generatedAt)}</span>
    </header>

    <section className={`${styles.card} ${pgStyles.printSection}`}>
      <h2 className={`${styles.sectionTitle} ${pgStyles.headingReset}`}>Overview</h2>
      <div className={pgStyles.reportMetrics}>
        <span>Total Students<strong>{overview.totalStudents ?? 0}</strong></span>
        <span>Average Progress<strong>{display(overview.averageProgress, "%")}</strong></span>
        <span>Completion Rate<strong>{display(overview.completionRate, "%")}</strong></span>
        <span>Average Score<strong>{display(overview.averageScore, "%")}</strong></span>
        <span>Average Attempts<strong>{display(overview.averageAttempts)}</strong></span>
        <span>Average Active Time<strong>{overview.averageActiveTimeLabel || "N/A"}</strong></span>
        <span>Needs Attention<strong>{overview.studentsNeedingAttention ?? 0}</strong></span>
        <span>Hint Usage Rate<strong>{display(overview.hintUsageRate, "%")}</strong></span>
      </div>
    </section>

    <section className={`${styles.card} ${pgStyles.printSection}`}>
      <h2 className={`${styles.sectionTitle} ${pgStyles.headingReset}`}>Engagement</h2>
      <div className={pgStyles.reportMetrics}>
        <span>Attempts<strong>{totals.attempts ?? 0}</strong></span>
        <span>Successful Attempts<strong>{totals.successfulAttempts ?? 0}</strong></span>
        <span>Failed Attempts<strong>{totals.failedAttempts ?? 0}</strong></span>
        <span>Completions<strong>{totals.completions ?? 0}</strong></span>
        <span>Active Learning Time<strong>{formatTrendValue({ duration: true }, totals.activeSeconds ?? 0)}</strong></span>
        <span>Hint Usage<strong>{totals.hintUses ?? 0}</strong></span>
        <span>Purchased Hints<strong>{totals.purchasedHints ?? 0}</strong></span>
        <span>Recorded Hint XP Spent<strong>{totals.knownHintXpSpent ?? 0}</strong></span>
        <span>First-Attempt Success<strong>{display(totals.firstAttemptSuccessRate, "%")}</strong></span>
      </div>
      {(totals.unpricedHintPurchases ?? 0) > 0 && <p>{totals.unpricedHintPurchases} older purchase event(s) have no recorded XP cost.</p>}
      {!data.historical?.hasData && <p className={styles.emptyText}>No historical activity has been recorded for this scope and period.</p>}
    </section>

    <section className={`${styles.card} ${pgStyles.printSection}`}>
      <h2 className={`${styles.sectionTitle} ${pgStyles.headingReset}`}>Lesson Performance</h2>
      <div className={styles.tableWrap}><table className={`${styles.table} ${pgStyles.reportTable}`}>
        <thead><tr><th scope="col">Lesson</th><th scope="col">Applicable</th><th scope="col">Started</th><th scope="col">Completed</th><th scope="col">Completion</th><th scope="col">Avg score</th><th scope="col">Avg attempts</th><th scope="col">Difficulty</th></tr></thead>
        <tbody>{!(data.lessonPerformance || []).length
          ? <tr><td colSpan="8" className={styles.emptyRow}>No lesson performance matches these filters.</td></tr>
          : data.lessonPerformance.map((lesson) => <tr key={lesson.id}>
            <th scope="row">{lesson.title}</th>
            <td>{lesson.available === false ? "N/A" : lesson.applicableStudents ?? lesson.eligibleStudents ?? "N/A"}</td>
            <td>{lesson.available === false ? "N/A" : lesson.studentsStarted}</td>
            <td>{lesson.available === false ? "N/A" : lesson.studentsCompleted}</td>
            <td>{lesson.available === false ? "N/A" : display(lesson.completionRate, "%")}</td>
            <td>{display(lesson.averageScore, "%")}</td>
            <td>{display(lesson.averageAttempts)}</td>
            <td>{lesson.difficulty?.sufficientData ? `${lesson.difficulty.label} (${lesson.difficulty.score}/100)` : "N/A"}</td>
          </tr>)}</tbody>
      </table></div>
    </section>

    <section className={`${styles.card} ${pgStyles.printSection}`}>
      <h2 className={`${styles.sectionTitle} ${pgStyles.headingReset}`}>Students Needing Attention</h2>
      <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th scope="col">Student</th><th scope="col">Progress</th><th scope="col">Failed attempts</th><th scope="col">Last activity</th><th scope="col">Attention reasons</th></tr></thead>
        <tbody>{!(data.attention || []).length
          ? <tr><td colSpan="5" className={styles.emptyRow}>No students match the current attention rules.</td></tr>
          : data.attention.map((student) => <tr key={student.studentId}>
            <th scope="row">{student.name}</th><td>{display(student.progress, "%")}</td>
            <td>{display(student.failedAttempts)}</td>
            <td>{student.lastActivityAt ? new Date(student.lastActivityAt).toLocaleDateString() : "N/A"}</td>
            <td>{student.attentionReasons.join(" ")}</td>
          </tr>)}</tbody>
      </table></div>
    </section>

    <section className={`${styles.card} ${pgStyles.printSection}`}>
      <h2 className={`${styles.sectionTitle} ${pgStyles.headingReset}`}>Failure Summary</h2>
      <div className={pgStyles.reportMetrics}>
        <span>Current unresolved signals<strong>{unresolved.signalCount ?? 0}</strong></span>
        <span>Affected students<strong>{unresolved.affectedStudents ?? 0}</strong></span>
        <span>Historical recorded failures<strong>{totals.failedAttempts ?? 0}</strong></span>
      </div>
      {!historicalFailures.length
        ? <p className={styles.emptyText}>No recorded failures for this period.</p>
        : <ul className={pgStyles.reportFailureList}>{historicalFailures.map((failure) => <li key={failure.category}><span>{failure.label}</span><strong>{failure.count}</strong></li>)}</ul>}
    </section>
  </article>;
}

export default TeacherAnalyticsReport;
