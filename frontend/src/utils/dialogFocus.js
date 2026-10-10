const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const focusableControls = (dialog) => [...(dialog?.querySelectorAll?.(FOCUSABLE_SELECTOR) ?? [])]
  .filter((element) => !element.disabled && element.getAttribute?.("aria-hidden") !== "true");

export const focusDialog = (dialog, preferredControl) => {
  const preferredIsAvailable = preferredControl
    && !preferredControl.disabled
    && preferredControl.getAttribute?.("aria-hidden") !== "true";
  const target = preferredIsAvailable ? preferredControl : focusableControls(dialog)[0] ?? dialog;
  target?.focus?.();
  return Boolean(target);
};

export const requestDialogDismiss = ({ disabled, onDismiss }) => {
  if (disabled) return false;
  onDismiss?.();
  return true;
};

export const handleDialogKeyDown = ({ event, dialog, disabled, onDismiss }) => {
  if (event?.key === "Escape") {
    event.preventDefault?.();
    return requestDialogDismiss({ disabled, onDismiss });
  }
  if (event?.key !== "Tab") return false;

  const controls = focusableControls(dialog);
  if (!controls.length) {
    event.preventDefault?.();
    dialog?.focus?.();
    return true;
  }

  const first = controls[0];
  const last = controls.at(-1);
  const targetIsOutside = !dialog?.contains?.(event.target);
  const targetIsDialog = event.target === dialog;
  const shouldWrap = event.shiftKey
    ? event.target === first || targetIsOutside || targetIsDialog
    : event.target === last || targetIsOutside || targetIsDialog;
  if (!shouldWrap) return false;

  event.preventDefault?.();
  (event.shiftKey ? last : first).focus?.();
  return true;
};

export const restoreDialogFocus = (element) => {
  if (!element?.isConnected || typeof element.focus !== "function") return false;
  element.focus();
  return true;
};
