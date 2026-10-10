import { createPortal } from "react-dom";
import { useEffect, useRef } from "react";
import {
  focusDialog,
  handleDialogKeyDown,
  requestDialogDismiss,
  restoreDialogFocus,
} from "../../utils/dialogFocus.js";
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
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const onCancelRef = useRef(onCancel);
  const disabledRef = useRef(confirmDisabled);
  onCancelRef.current = onCancel;
  disabledRef.current = confirmDisabled;

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    focusDialog(dialogRef.current, cancelRef.current);
    const onKeyDown = (event) => handleDialogKeyDown({
      event,
      dialog: dialogRef.current,
      disabled: disabledRef.current,
      onDismiss: () => onCancelRef.current?.(),
    });
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      restoreDialogFocus(previousFocus);
    };
  }, [open]);

  useEffect(() => {
    if (open && confirmDisabled) focusDialog(dialogRef.current);
  }, [confirmDisabled, open]);

  if (!open) return null;

  const requestCancel = () => requestDialogDismiss({
    disabled: confirmDisabled,
    onDismiss: onCancel,
  });

  return createPortal(
    <div className={s.backdrop} onClick={requestCancel}>
      <div ref={dialogRef} className={s.dialog} role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className={s.iconWrap}>
          <span className={`${s.icon} ${danger ? s.iconDanger : s.iconInfo}`}>
            {danger ? "!" : "?"}
          </span>
        </div>
        <div className={s.title} id="confirm-modal-title">{title}</div>
        {message && <div className={s.message}>{message}</div>}
        <div className={s.actions}>
          <button ref={cancelRef} type="button" className={s.cancelBtn} onClick={requestCancel} disabled={confirmDisabled}>
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
