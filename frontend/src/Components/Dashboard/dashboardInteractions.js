const scheduleAfterRender = (callback) => window.requestAnimationFrame(callback);

export const revealDashboardNotifications = ({
  selectNotifications,
  getDestination,
  schedule = scheduleAfterRender,
}) => {
  selectNotifications();
  schedule(() => {
    const destination = getDestination();
    destination?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    destination?.focus?.({ preventScroll: true });
  });
};
