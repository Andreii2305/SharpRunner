import { PUBLIC_TESTIMONIAL_LIMIT } from "../../services/publicTestimonialService.js";

export const INITIAL_PUBLIC_TESTIMONIAL_STATE = Object.freeze({
  status: "idle",
  testimonials: [],
  page: 1,
  limit: PUBLIC_TESTIMONIAL_LIMIT,
  total: 0,
  totalPages: 0,
  error: "",
});

const failInvalidResponse = () => {
  throw new Error("Invalid public testimonial response");
};

const isSafeNonNegativeInteger = (value) => Number.isSafeInteger(value) && value >= 0;
const hasExactKeys = (value, keys) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
};

export const validatePublicTestimonialSnapshot = (value) => {
  if (!hasExactKeys(value, ["testimonials", "page", "limit", "total", "totalPages"])) {
    return failInvalidResponse();
  }
  if (
    value.page !== 1
    || value.limit !== PUBLIC_TESTIMONIAL_LIMIT
    || !isSafeNonNegativeInteger(value.total)
    || !isSafeNonNegativeInteger(value.totalPages)
    || value.totalPages !== Math.max(1, Math.ceil(value.total / value.limit))
    || !Array.isArray(value.testimonials)
    || value.testimonials.length > value.limit
    || value.testimonials.length > value.total
  ) return failInvalidResponse();

  const seen = new Set();
  const testimonials = value.testimonials.map((testimonial) => {
    if (!hasExactKeys(testimonial, ["id", "message", "displayName", "approvedAt"])) {
      return failInvalidResponse();
    }
    if (
      !Number.isSafeInteger(testimonial.id)
      || testimonial.id <= 0
      || seen.has(testimonial.id)
      || typeof testimonial.message !== "string"
      || testimonial.message.length === 0
      || typeof testimonial.displayName !== "string"
      || testimonial.displayName.length === 0
      || typeof testimonial.approvedAt !== "string"
      || !Number.isFinite(Date.parse(testimonial.approvedAt))
    ) return failInvalidResponse();
    seen.add(testimonial.id);
    return Object.freeze({ ...testimonial });
  });

  return Object.freeze({
    testimonials: Object.freeze(testimonials),
    page: value.page,
    limit: value.limit,
    total: value.total,
    totalPages: value.totalPages,
  });
};

const copyState = (state) => ({ ...state, testimonials: [...state.testimonials] });

export const createPublicTestimonialController = ({
  load,
  onChange = () => {},
  windowTarget = globalThis.window,
  documentTarget = globalThis.document,
  AbortControllerImpl = globalThis.AbortController,
} = {}) => {
  let state = copyState(INITIAL_PUBLIC_TESTIMONIAL_STATE);
  let active = false;
  let disposed = false;
  let inFlight = null;
  let requestNumber = 0;
  let abortController = null;
  let wasHidden = documentTarget?.visibilityState === "hidden";

  const emit = (next) => {
    if (disposed) return;
    state = next;
    onChange(copyState(state));
  };

  const refresh = () => {
    if (disposed || !active) return Promise.resolve(false);
    if (inFlight) return inFlight;
    const operationId = ++requestNumber;
    abortController = typeof AbortControllerImpl === "function"
      ? new AbortControllerImpl()
      : null;
    emit({ ...state, status: "loading", error: "" });

    let loaded;
    try {
      loaded = load?.({ signal: abortController?.signal });
    } catch (error) {
      loaded = Promise.reject(error);
    }
    const operation = Promise.resolve(loaded)
      .then((result) => {
        if (disposed || !active || operationId !== requestNumber) return false;
        const snapshot = validatePublicTestimonialSnapshot(result);
        emit({ ...snapshot, status: "success", error: "" });
        return true;
      })
      .catch((error) => {
        if (disposed || !active || operationId !== requestNumber || error?.name === "AbortError") {
          return false;
        }
        emit({
          ...copyState(INITIAL_PUBLIC_TESTIMONIAL_STATE),
          status: "error",
          error: "Testimonials are unavailable right now.",
        });
        return false;
      })
      .finally(() => {
        if (inFlight === operation) inFlight = null;
        if (operationId === requestNumber) abortController = null;
      });
    inFlight = operation;
    return operation;
  };

  const onPageShow = () => { refresh(); };
  const onVisibilityChange = () => {
    if (documentTarget?.visibilityState === "hidden") {
      wasHidden = true;
      return;
    }
    if (documentTarget?.visibilityState === "visible" && wasHidden) {
      wasHidden = false;
      refresh();
    }
  };

  return {
    activate() {
      if (disposed) return Promise.resolve(false);
      if (!active) {
        active = true;
        windowTarget?.addEventListener?.("pageshow", onPageShow);
        documentTarget?.addEventListener?.("visibilitychange", onVisibilityChange);
      }
      return refresh();
    },
    refresh,
    getState: () => copyState(state),
    dispose() {
      if (disposed) return;
      disposed = true;
      active = false;
      requestNumber += 1;
      abortController?.abort?.();
      abortController = null;
      windowTarget?.removeEventListener?.("pageshow", onPageShow);
      documentTarget?.removeEventListener?.("visibilitychange", onVisibilityChange);
      inFlight = null;
      wasHidden = false;
    },
  };
};

const withMotionPaused = (state) => ({
  ...state,
  motionPaused: Boolean(
    state.userPaused || state.hovered || state.focusWithin || state.reducedMotion,
  ),
});

export const testimonialMotionReducer = (state, action) => {
  if (action.type === "toggle-user-pause") {
    return withMotionPaused({ ...state, userPaused: !state.userPaused });
  }
  if (action.type === "hover") {
    return withMotionPaused({ ...state, hovered: Boolean(action.value) });
  }
  if (action.type === "focus") {
    return withMotionPaused({ ...state, focusWithin: Boolean(action.value) });
  }
  if (action.type === "reduced-motion") {
    return withMotionPaused({ ...state, reducedMotion: Boolean(action.value) });
  }
  return withMotionPaused(state);
};

export const subscribeToReducedMotion = ({ media, onChange }) => {
  if (!media || typeof onChange !== "function") return () => {};
  const handleChange = (event) => onChange(Boolean(event.matches));
  onChange(Boolean(media.matches));
  media.addEventListener?.("change", handleChange);
  return () => media.removeEventListener?.("change", handleChange);
};

export const observeTestimonialLoop = ({
  list,
  track,
  section,
  ResizeObserverImpl,
  windowTarget = globalThis.window,
}) => {
  if (!list || !track) return () => {};
  const measure = () => {
    const width = Math.ceil(list.getBoundingClientRect().width);
    if (width <= 0) return;
    track.style.setProperty("--testimonial-loop-distance", `${width}px`);
    track.style.setProperty("--testimonial-loop-duration", `${Math.max(24, width / 36)}s`);
  };
  measure();
  if (typeof ResizeObserverImpl === "function") {
    const observer = new ResizeObserverImpl(measure);
    observer.observe(list);
    if (section) observer.observe(section);
    return () => observer.disconnect();
  }
  windowTarget?.addEventListener?.("resize", measure);
  return () => windowTarget?.removeEventListener?.("resize", measure);
};
