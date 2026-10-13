const LEGEND_DEFINITIONS = Object.freeze([
  { status: "completed", statuses: ["completed"], label: "Completed", className: "legendCompleted" },
  { status: "current", statuses: ["current"], label: "Available", className: "legendAvailable" },
  {
    status: "assessment-required",
    statuses: ["assessment-required"],
    label: "Assessment required",
    className: "legendAssessment",
  },
  {
    status: "action-required",
    statuses: ["assessment-recovery", "assessment-invalid"],
    label: "Action required",
    className: "legendActionRequired",
  },
  { status: "expired", statuses: ["expired"], label: "Deadline passed", className: "legendExpired" },
  { status: "locked", statuses: ["locked"], label: "Locked", className: "legendLocked" },
  { status: "unassigned", statuses: ["unassigned"], label: "Not assigned", className: "legendUnassigned" },
  {
    status: "unavailable",
    statuses: ["unavailable"],
    label: "Availability unavailable",
    className: "legendUnavailable",
  },
]);

export const createVisibleMapLegend = (nodes = []) => {
  const statuses = new Set(nodes.map((node) => node?.status));
  return LEGEND_DEFINITIONS.filter((item) => (
    item.statuses.some((status) => statuses.has(status))
  ));
};
