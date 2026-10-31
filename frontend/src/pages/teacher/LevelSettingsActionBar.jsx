import { FiRotateCcw, FiSave } from "react-icons/fi";
import s from "./TeacherLevelEditorPage.module.css";

export default function LevelSettingsActionBar({
  mutationKind,
  status,
  onSave,
  onReset,
}) {
  const busy = Boolean(mutationKind);
  const busyText = mutationKind === "reset"
    ? "Resetting classroom settings…"
    : "Saving classroom settings…";

  return (
    <div className={s.actionBar} aria-busy={busy}>
      <button type="button" className={s.saveBtn} onClick={onSave} disabled={busy}>
        <FiSave /> {mutationKind === "save" ? "Saving…" : "Save classroom settings"}
      </button>
      <button type="button" className={s.resetBtn} onClick={onReset} disabled={busy}>
        <FiRotateCcw /> {mutationKind === "reset" ? "Resetting…" : "Reset to default"}
      </button>
      <span className={s.spacer} />
      {busy ? <span role="status" aria-live="polite">{busyText}</span> : null}
      {status ? <span className={status.ok ? s.statusOk : s.statusErr}>{status.ok ? "✓" : "!"} {status.text}</span> : null}
    </div>
  );
}
