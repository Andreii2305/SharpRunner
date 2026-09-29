const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export const containDialogTabFocus = (event, panel) => {
  if (event?.key !== "Tab" || !panel?.querySelectorAll) return false;
  const controls = [...panel.querySelectorAll(FOCUSABLE_SELECTOR)].filter(
    (element) => !element.disabled && element.getAttribute?.("aria-hidden") !== "true",
  );
  if (controls.length === 0) return false;

  const first = controls[0];
  const last = controls.at(-1);
  const target = event.target;
  const shouldWrap = event.shiftKey ? target === first : target === last;
  if (!shouldWrap) return false;

  event.preventDefault?.();
  (event.shiftKey ? last : first).focus?.();
  return true;
};

export const handleSubmitConfirmationKeyDown = ({
  event,
  panel,
  submitting,
  onCancel,
}) => {
  if (event.key === "Escape" && !submitting) {
    event.preventDefault();
    onCancel();
    return;
  }
  containDialogTabFocus(event, panel);
};
