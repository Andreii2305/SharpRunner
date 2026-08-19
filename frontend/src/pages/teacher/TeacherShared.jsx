import styles from "./TeacherPage.module.css";

const ANNOUNCEMENT_HEADER_PREFIX = "HEADER:";

export const clampPercent = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(100, Math.max(0, Math.round(number))) : 0;
};

export const buildAnnouncementPayload = (header, message) =>
  `${ANNOUNCEMENT_HEADER_PREFIX} ${`${header ?? ""}`.trim()}\n${`${message ?? ""}`.trim()}`;

export const parseAnnouncementPayload = (raw) => {
  const text = `${raw ?? ""}`.trim();
  const [first = "", ...rest] = text.split(/\r?\n/);
  if (!first.toUpperCase().startsWith(ANNOUNCEMENT_HEADER_PREFIX)) {
    return { header: "Announcement", body: text };
  }
  return {
    header: first.slice(ANNOUNCEMENT_HEADER_PREFIX.length).trim() || "Announcement",
    body: rest.join("\n").trim(),
  };
};

export const formatDateTime = (value) => {
  if (!value) return "Just now";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Just now" : date.toLocaleString();
};

export function CreateClassModal({ form, onChange, onSubmit, onClose, isCreating, error }) {
  return (
    <div className={styles.modalBackdrop}>
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <h3>Create new class</h3>
          <button type="button" className={styles.modalCloseBtn} onClick={onClose}>×</button>
        </div>
        {error && <div className={styles.modalError}>{error}</div>}
        <form onSubmit={onSubmit} className={styles.modalForm}>
          <label className={styles.modalLabel}>
            <span>Class name</span>
            <input type="text" name="className" value={form.className} onChange={onChange} placeholder="e.g. BSIT - C# Fundamentals" />
          </label>
          <label className={styles.modalLabel}>
            <span>Section</span>
            <input type="text" name="section" value={form.section} onChange={onChange} placeholder="e.g. BSIT 1A" autoComplete="off" />
          </label>
          <label className={styles.modalLabel}>
            <span>School year</span>
            <input type="text" name="schoolYear" value={form.schoolYear} onChange={onChange} placeholder="e.g. 2025-2026" />
          </label>
          <label className={styles.modalLabel}>
            <span>Max students (optional)</span>
            <input type="number" name="maxStudents" value={form.maxStudents} onChange={onChange} min={1} placeholder="No limit" />
          </label>
          <label className={`${styles.modalLabel} ${styles.modalLabelFull}`}>
            <span>Description (optional)</span>
            <input type="text" name="description" value={form.description} onChange={onChange} placeholder="Short description" />
          </label>
          <div className={styles.modalActions}>
            <button type="button" className={styles.btnOutline} onClick={onClose} disabled={isCreating}>Cancel</button>
            <button type="submit" className={styles.btnPrimary} disabled={isCreating}>{isCreating ? "Creating..." : "Create class"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function SuccessModal({ classCode, onClose }) {
  return (
    <div className={styles.modalBackdrop}>
      <div className={styles.successCard}>
        <div className={styles.successIcon}>✓</div>
        <h3>Classroom created!</h3>
        <p>Share this code with your students.</p>
        <div className={styles.codeBlock}>{classCode || "N/A"}</div>
        <button type="button" className={styles.btnPrimary} onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
