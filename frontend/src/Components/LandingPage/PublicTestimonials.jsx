import { useEffect, useReducer, useRef, useState } from "react";
import { publicTestimonialService } from "../../services/publicTestimonialService.js";
import {
  INITIAL_PUBLIC_TESTIMONIAL_STATE,
  createPublicTestimonialController,
  observeTestimonialLoop,
  subscribeToReducedMotion,
  testimonialMotionReducer,
} from "./publicTestimonialState.js";
import styles from "./PublicTestimonials.module.css";

const initialMotion = () => testimonialMotionReducer({
  userPaused: false,
  hovered: false,
  focusWithin: false,
  reducedMotion: false,
}, { type: "initialize" });

const TestimonialCard = ({ testimonial }) => (
  <article className={styles.card}>
    <p>{testimonial.message}</p>
    <footer>{testimonial.displayName}</footer>
  </article>
);

const TestimonialList = ({ testimonials, listRef, staticLayout = false }) => (
  <ul
    ref={listRef}
    className={`${styles.list} ${staticLayout ? styles.staticList : styles.movingList}`}
  >
    {testimonials.map((testimonial) => (
      <li key={testimonial.id} tabIndex="0">
        <TestimonialCard testimonial={testimonial} />
      </li>
    ))}
  </ul>
);

export function PublicTestimonialsView({
  state,
  reducedMotion,
  motionPaused,
  userPaused,
  focusWithin = false,
  sectionRef,
  listRef,
  trackRef,
  onRetry,
  onTogglePause,
  onHoverChange,
  onFocusChange,
}) {
  const hasItems = state.testimonials.length > 0;
  if (state.status === "success" && !hasItems) return null;

  if ((state.status === "idle" || state.status === "loading") && !hasItems) {
    return (
      <section className={styles.section} aria-labelledby="public-testimonials-title" aria-busy="true">
        <div className={styles.heading}>
          <h2 id="public-testimonials-title">What learners say</h2>
          <p>Loading public testimonials…</p>
        </div>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className={styles.section} aria-labelledby="public-testimonials-title">
        <div className={styles.heading}>
          <h2 id="public-testimonials-title">What learners say</h2>
          <p role="status">{state.error}</p>
          <button type="button" className={styles.retryButton} onClick={onRetry}>Retry</button>
        </div>
      </section>
    );
  }

  const animated = state.testimonials.length >= 4 && !reducedMotion;
  const sectionClass = [
    styles.section,
    focusWithin ? styles.focusWithin : "",
  ].filter(Boolean).join(" ");

  return (
    <section
      ref={sectionRef}
      className={sectionClass}
      aria-labelledby="public-testimonials-title"
      aria-busy={state.status === "loading" ? "true" : undefined}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      onFocusCapture={() => onFocusChange(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onFocusChange(false);
      }}
    >
      <div className={styles.headingRow}>
        <div className={styles.heading}>
          <h2 id="public-testimonials-title">What learners say</h2>
          <p>Approved public testimonials from SharpRunner users.</p>
        </div>
        {animated ? (
          <button
            type="button"
            className={styles.pauseButton}
            aria-pressed={userPaused}
            aria-label={`${userPaused ? "Resume" : "Pause"} testimonial movement`}
            onClick={onTogglePause}
          >
            {userPaused ? "Resume testimonials" : "Pause testimonials"}
          </button>
        ) : null}
      </div>

      {animated ? (
        <div className={`${styles.viewport} ${focusWithin ? styles.focusViewport : ""}`}>
          <div
            ref={trackRef}
            className={`${styles.track} ${motionPaused ? styles.trackPaused : ""} ${focusWithin ? styles.trackFocused : ""}`}
          >
            <TestimonialList testimonials={state.testimonials} listRef={listRef} />
            <div
              className={`${styles.cloneGroup} ${focusWithin ? styles.cloneHidden : ""}`}
              aria-hidden="true"
              data-testid="testimonial-clones"
            >
              {state.testimonials.map((testimonial) => (
                <div className={styles.cloneCard} key={`clone-${testimonial.id}`}>
                  <TestimonialCard testimonial={testimonial} />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <TestimonialList testimonials={state.testimonials} listRef={listRef} staticLayout />
      )}
    </section>
  );
}

export default function PublicTestimonials({ load = publicTestimonialService.list }) {
  const [state, setState] = useState(() => ({
    ...INITIAL_PUBLIC_TESTIMONIAL_STATE,
    testimonials: [],
  }));
  const [motion, dispatchMotion] = useReducer(testimonialMotionReducer, undefined, initialMotion);
  const controllerRef = useRef(null);
  const sectionRef = useRef(null);
  const listRef = useRef(null);
  const trackRef = useRef(null);

  useEffect(() => {
    const controller = createPublicTestimonialController({ load, onChange: setState });
    controllerRef.current = controller;
    controller.activate();
    return () => {
      controller.dispose();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [load]);

  useEffect(() => subscribeToReducedMotion({
    media: globalThis.window?.matchMedia?.("(prefers-reduced-motion: reduce)"),
    onChange: (value) => dispatchMotion({ type: "reduced-motion", value }),
  }), []);

  const animated = state.testimonials.length >= 4 && !motion.reducedMotion;
  useEffect(() => {
    if (!animated || !listRef.current || !trackRef.current) return undefined;
    const ResizeObserverImpl = globalThis.window?.ResizeObserver ?? globalThis.ResizeObserver;
    return observeTestimonialLoop({
      list: listRef.current,
      track: trackRef.current,
      section: sectionRef.current,
      ResizeObserverImpl,
    });
  }, [animated, state.testimonials]);

  useEffect(() => {
    if (!motion.focusWithin) return undefined;
    const requestFrame = globalThis.window?.requestAnimationFrame ?? ((callback) => setTimeout(callback, 0));
    const cancelFrame = globalThis.window?.cancelAnimationFrame ?? clearTimeout;
    const frame = requestFrame(() => {
      const active = globalThis.document?.activeElement;
      if (active && sectionRef.current?.contains(active)) {
        active.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      }
    });
    return () => cancelFrame(frame);
  }, [motion.focusWithin]);

  return (
    <PublicTestimonialsView
      state={state}
      reducedMotion={motion.reducedMotion}
      motionPaused={motion.motionPaused}
      userPaused={motion.userPaused}
      focusWithin={motion.focusWithin}
      sectionRef={sectionRef}
      listRef={listRef}
      trackRef={trackRef}
      onRetry={() => controllerRef.current?.refresh()}
      onTogglePause={() => dispatchMotion({ type: "toggle-user-pause" })}
      onHoverChange={(value) => dispatchMotion({ type: "hover", value })}
      onFocusChange={(value) => dispatchMotion({ type: "focus", value })}
    />
  );
}
