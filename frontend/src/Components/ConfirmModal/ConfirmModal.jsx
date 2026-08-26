import { createPortal } from "react-dom";
import { useEffect, useRef } from "react";
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
  confirmDisabled = false,
  onConfirm,
  onCancel,
}) {
  const cancelRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    cancelRef.current?.focus();
    const onKeyDown = (event) => { if (event.key === "Escape" && !confirmDisabled) onCancel?.(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirmDisabled, onCancel, open]);
  if (!open) return null;

  return createPortal(
    <div className={s.backdrop} onClick={onCancel}>
      <div className={s.dialog} role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title" onClick={(e) => e.stopPropagation()}>
        <div className={s.iconWrap}>
          <span className={`${s.icon} ${danger ? s.iconDanger : s.iconInfo}`}>
            {danger ? "!" : "?"}
          </span>
        </div>
        <div className={s.title} id="confirm-modal-title">{title}</div>
        {message && <div className={s.message}>{message}</div>}
        <div className={s.actions}>
          <button ref={cancelRef} type="button" className={s.cancelBtn} onClick={onCancel} disabled={confirmDisabled}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`${s.confirmBtn} ${danger ? s.confirmDanger : s.confirmPrimary}`}
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
