import { createPortal } from "react-dom";
import s from "./ConfirmModal.module.css";

/**
 * Props:
 *   open        boolean
 *   title       string
 *   message     string
 *   confirmLabel string  (default "Confirm")
 *   cancelLabel  string  (default "Cancel")
 *   danger       boolean (red confirm button)
 *   onConfirm   () => void
 *   onCancel    () => void
 */
export default function ConfirmModal({
  open,
  title = "Are you sure?",
  message,
  confirmLabel = "Confirm",
  cancelLabel  = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  return createPortal(
    <div className={s.backdrop} onClick={onCancel}>
      <div className={s.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={s.iconWrap}>
          <span className={`${s.icon} ${danger ? s.iconDanger : s.iconInfo}`}>
            {danger ? "!" : "?"}
          </span>
        </div>
        <div className={s.title}>{title}</div>
        {message && <div className={s.message}>{message}</div>}
        <div className={s.actions}>
          <button type="button" className={s.cancelBtn} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`${s.confirmBtn} ${danger ? s.confirmDanger : s.confirmPrimary}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
