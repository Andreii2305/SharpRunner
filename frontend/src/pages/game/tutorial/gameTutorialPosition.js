const DEFAULT_MARGIN = 16;
const DEFAULT_GAP = 14;

const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

export const getSpotlightRect = (rect, viewport, padding = 8) => {
  if (!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.top)
    || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)
    || rect.width <= 0 || rect.height <= 0
    || rect.left >= viewport.width || rect.top >= viewport.height
    || rect.left + rect.width <= 0 || rect.top + rect.height <= 0) return null;

  const left = clamp(rect.left - padding, 0, viewport.width);
  const top = clamp(rect.top - padding, 0, viewport.height);
  const right = clamp(rect.left + rect.width + padding, 0, viewport.width);
  const bottom = clamp(rect.top + rect.height + padding, 0, viewport.height);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
};

export const placeTutorialCard = ({ target, card, viewport, preferred = "bottom", gap = DEFAULT_GAP, margin = DEFAULT_MARGIN }) => {
  const width = Math.min(card.width, viewport.width - margin * 2);
  const height = Math.min(card.height, viewport.height - margin * 2);
  const center = {
    left: Math.round((viewport.width - width) / 2),
    top: Math.round((viewport.height - height) / 2),
    placement: "center",
  };
  if (!target) return center;

  const horizontal = clamp(Math.round((target.left + target.right - width) / 2), margin, viewport.width - margin - width);
  const vertical = clamp(Math.round((target.top + target.bottom - height) / 2), margin, viewport.height - margin - height);
  const candidates = {
    bottom: { left: horizontal, top: Math.round(target.bottom + gap), placement: "bottom" },
    top: { left: horizontal, top: Math.round(target.top - gap - height), placement: "top" },
    right: { left: Math.round(target.right + gap), top: vertical, placement: "right" },
    left: { left: Math.round(target.left - gap - width), top: vertical, placement: "left" },
  };
  const order = [preferred, "bottom", "top", "right", "left"];
  for (const name of [...new Set(order)]) {
    const candidate = candidates[name];
    if (candidate && candidate.left >= margin && candidate.top >= margin
      && candidate.left + width <= viewport.width - margin
      && candidate.top + height <= viewport.height - margin) return candidate;
  }

  const overlapArea = ({ left, top }) => {
    const overlapWidth = Math.max(0, Math.min(left + width, target.right) - Math.max(left, target.left));
    const overlapHeight = Math.max(0, Math.min(top + height, target.bottom) - Math.max(top, target.top));
    return overlapWidth * overlapHeight;
  };
  let best = center;
  let bestOverlap = Infinity;
  for (const name of [...new Set(order)]) {
    const candidate = candidates[name];
    if (!candidate) continue;
    const bounded = {
      left: clamp(candidate.left, margin, viewport.width - margin - width),
      top: clamp(candidate.top, margin, viewport.height - margin - height),
      placement: candidate.placement,
    };
    const overlap = overlapArea(bounded);
    if (overlap < bestOverlap) {
      best = bounded;
      bestOverlap = overlap;
    }
  }
  return best;
};
