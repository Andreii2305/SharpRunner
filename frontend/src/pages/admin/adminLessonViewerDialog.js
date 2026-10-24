import {
  focusDialog,
  handleDialogKeyDown,
  requestDialogDismiss,
} from "../../utils/dialogFocus.js";

export const createAdminLessonDialogBehavior = ({ onClose }) => {
  let opened = false;
  const requestClose = () => requestDialogDismiss({ disabled: false, onDismiss: onClose });

  return {
    open(dialog, preferredControl) {
      if (opened) return false;
      opened = true;
      return focusDialog(dialog, preferredControl);
    },
    handleKeyDown(event, dialog) {
      return handleDialogKeyDown({ event, dialog, disabled: false, onDismiss: onClose });
    },
    handleBackdropClick(event) {
      if (event.target !== event.currentTarget) return false;
      return requestClose();
    },
    requestClose,
  };
};
