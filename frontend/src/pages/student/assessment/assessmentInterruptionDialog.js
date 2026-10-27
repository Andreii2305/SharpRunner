import {
  focusDialog,
  handleDialogKeyDown,
  restoreDialogFocus,
} from "../../../utils/dialogFocus.js";

export const createAssessmentInterruptionDialogBehavior = ({
  onContinue,
  restoreTarget,
}) => {
  let opened = false;

  const requestContinue = () => {
    onContinue?.();
    restoreDialogFocus(restoreTarget);
    return true;
  };

  return {
    open(dialog, preferredControl) {
      if (opened) return false;
      opened = true;
      return focusDialog(dialog, preferredControl);
    },
    handleKeyDown(event, dialog) {
      return handleDialogKeyDown({
        event,
        dialog,
        disabled: false,
        onDismiss: requestContinue,
      });
    },
    requestContinue,
  };
};
