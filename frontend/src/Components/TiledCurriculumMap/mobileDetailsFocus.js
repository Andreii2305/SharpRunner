export const createMobileDetailsFocusController = () => {
  let openedId = null;
  let focusedId = null;
  let opener = null;

  const clear = ({ restoreFocus }) => {
    const previousOpener = opener;
    openedId = null;
    focusedId = null;
    opener = null;
    if (restoreFocus && previousOpener?.isConnected) previousOpener.focus();
  };

  return {
    open(nodeId, nextOpener) {
      openedId = nodeId;
      focusedId = null;
      opener = nextOpener ?? null;
    },
    focusOpenedDetails(nodeId, target) {
      if (!target || nodeId !== openedId || focusedId === nodeId) return false;
      target.focus();
      focusedId = nodeId;
      return true;
    },
    shouldCloseFromKey(event) {
      if (openedId == null || event?.key !== "Escape") return false;
      event.preventDefault?.();
      return true;
    },
    close() {
      clear({ restoreFocus: true });
    },
    clearForRegionChange() {
      clear({ restoreFocus: false });
    },
  };
};
