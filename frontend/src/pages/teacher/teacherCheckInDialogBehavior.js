import {
  focusDialog,
  handleDialogKeyDown,
  requestDialogDismiss,
  restoreDialogFocus,
} from "../../utils/dialogFocus.js";

export const closeTeacherCheckInDialog = ({ controller, origin, restore = true }) => {
  controller?.close?.();
  return restore ? restoreDialogFocus(origin) : true;
};

export const createTeacherCheckInDialogBehavior = ({ onClose }) => {
  let focused = false;
  const close = () => requestDialogDismiss({ disabled: false, onDismiss: onClose });
  return {
    open(dialog, preferredControl) {
      if (focused) return false;
      focused = true;
      return focusDialog(dialog, preferredControl);
    },
    reset() {
      focused = false;
    },
    handleKeyDown(event, dialog) {
      return handleDialogKeyDown({ event, dialog, disabled: false, onDismiss: onClose });
    },
    handleBackdropClick(event) {
      if (event.target !== event.currentTarget) return false;
      return close();
    },
    requestClose: close,
  };
};
