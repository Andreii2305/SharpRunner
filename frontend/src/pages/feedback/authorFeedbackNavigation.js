export const resolveFeedbackNavigation = (request, state) => {
  if (request?.kind === "edit"
    && state.draftMode === "edit"
    && state.optionsStatus === "success") return "edit";
  if (request?.kind === "history"
    && state.detailStatus === "success"
    && Number(state.selectedSubmissionId) === request.submissionId
    && Number(state.detail?.testimonial?.id) === request.submissionId) return "history";
  return null;
};

export const scheduleFeedbackNavigation = ({
  section,
  focusTarget,
  reducedMotion,
  onComplete = () => {},
  schedule = (callback) => window.requestAnimationFrame(callback),
  cancel = (handle) => window.cancelAnimationFrame(handle),
}) => {
  const handle = schedule(() => {
    section?.scrollIntoView?.({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "start",
      inline: "nearest",
    });
    focusTarget?.focus?.({ preventScroll: true });
    onComplete();
  });
  return () => cancel(handle);
};
