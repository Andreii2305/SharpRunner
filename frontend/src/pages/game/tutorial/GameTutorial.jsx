import { forwardRef, useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getSpotlightRect, placeTutorialCard } from "./gameTutorialPosition.js";
import { moveTutorialStep } from "./gameTutorialState.js";
import styles from "./GameTutorial.module.css";

const viewportSize = () => ({ width: window.innerWidth, height: window.innerHeight });

const findVisibleTarget = (root, targetId) => {
  if (!root || !targetId) return null;
  const element = root.querySelector(`[data-game-tutorial-target="${targetId}"]`);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || rect.width <= 0 || rect.height <= 0) return null;
  return element;
};

export const GameTutorialCard = forwardRef(function GameTutorialCard({
  step, stepIndex, stepCount, position, onBack, onNext, onSkip, onFinish,
}, ref) {
  const isLast = stepIndex === stepCount - 1;
  return (
    <section
      ref={ref}
      className={styles.card}
      style={{ left: position.left, top: position.top }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-tutorial-title"
      aria-describedby="game-tutorial-description game-tutorial-progress"
    >
      <span className={styles.eyebrow}>SharpRunner tutorial</span>
      <h2 id="game-tutorial-title" tabIndex={-1}>{step.title}</h2>
      <p id="game-tutorial-description">{step.description}</p>
      <p id="game-tutorial-progress" className={styles.progress} aria-live="polite">
        {stepIndex + 1} of {stepCount}
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.skip} onClick={onSkip}>Skip Tutorial</button>
        <button type="button" className={styles.secondary} onClick={onBack} disabled={stepIndex === 0}>Back</button>
        {isLast ? (
          <button type="button" className={styles.primary} onClick={onFinish}>Finish</button>
        ) : (
          <button type="button" className={styles.primary} onClick={onNext}>Next</button>
        )}
      </div>
      <span className={styles.keyboardHelp}>Use Skip Tutorial to close this guide.</span>
    </section>
  );
});

export default function GameTutorial({
  steps, rootRef, isMobile = false, activeMobileTab, onBeforeStep, onSkip, onFinish,
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [geometry, setGeometry] = useState({ spotlight: null, card: { left: 16, top: 16 } });
  const cardRef = useRef(null);
  const frameRef = useRef(null);
  const step = steps[stepIndex];

  const measure = useCallback(() => {
    const viewport = viewportSize();
    const target = findVisibleTarget(rootRef.current, step?.target);
    const spotlight = getSpotlightRect(target?.getBoundingClientRect() ?? null, viewport);
    const cardBounds = cardRef.current?.getBoundingClientRect();
    const card = placeTutorialCard({
      target: spotlight,
      card: { width: cardBounds?.width ?? 360, height: cardBounds?.height ?? 240 },
      viewport,
      preferred: step?.placement,
    });
    setGeometry((previous) => {
      const unchanged = previous.card.left === card.left && previous.card.top === card.top
        && previous.spotlight?.left === spotlight?.left
        && previous.spotlight?.top === spotlight?.top
        && previous.spotlight?.width === spotlight?.width
        && previous.spotlight?.height === spotlight?.height;
      return unchanged ? previous : { spotlight, card };
    });
  }, [rootRef, step]);

  const requestMeasure = useCallback(() => {
    if (frameRef.current != null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      measure();
    });
  }, [measure]);

  useLayoutEffect(() => {
    if (!step) return;
    onBeforeStep?.(step);
    step.onEnter?.();
  }, [onBeforeStep, step]);

  useLayoutEffect(() => {
    if (!step || (isMobile && step.mobileTab && activeMobileTab !== step.mobileTab)) return undefined;
    findVisibleTarget(rootRef.current, step.target)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    measure();

    const target = findVisibleTarget(rootRef.current, step.target);
    const observer = window.ResizeObserver ? new ResizeObserver(requestMeasure) : null;
    if (target) observer?.observe(target);
    if (rootRef.current) observer?.observe(rootRef.current);
    const mutations = window.MutationObserver && rootRef.current
      ? new MutationObserver(requestMeasure)
      : null;
    mutations?.observe(rootRef.current, { attributes: true, childList: true, subtree: true });
    window.addEventListener("resize", requestMeasure);
    window.addEventListener("orientationchange", requestMeasure);
    window.addEventListener("scroll", requestMeasure, true);
    window.visualViewport?.addEventListener("resize", requestMeasure);
    window.visualViewport?.addEventListener("scroll", requestMeasure);
    return () => {
      observer?.disconnect();
      mutations?.disconnect();
      window.removeEventListener("resize", requestMeasure);
      window.removeEventListener("orientationchange", requestMeasure);
      window.removeEventListener("scroll", requestMeasure, true);
      window.visualViewport?.removeEventListener("resize", requestMeasure);
      window.visualViewport?.removeEventListener("scroll", requestMeasure);
      if (frameRef.current != null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [activeMobileTab, isMobile, measure, requestMeasure, rootRef, step]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const previousFocus = document.activeElement;
    const wasInert = root?.inert ?? false;
    if (root) root.inert = true;
    cardRef.current?.querySelector("h2")?.focus();

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.key !== "Tab") return;
      const buttons = [...(cardRef.current?.querySelectorAll("button:not([disabled])") ?? [])];
      if (!buttons.length) return;
      const first = buttons[0];
      const last = buttons.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === cardRef.current?.querySelector("h2"))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      if (root) root.inert = wasInert;
      if (previousFocus instanceof HTMLElement && document.contains(previousFocus)) previousFocus.focus();
    };
  }, [rootRef]);

  useLayoutEffect(() => {
    cardRef.current?.querySelector("h2")?.focus();
  }, [stepIndex]);

  if (!step || typeof document === "undefined") return null;
  const { spotlight } = geometry;
  const shades = spotlight ? [
    { top: 0, left: 0, right: 0, height: spotlight.top },
    { top: spotlight.bottom, left: 0, right: 0, bottom: 0 },
    { top: spotlight.top, left: 0, width: spotlight.left, height: spotlight.height },
    { top: spotlight.top, left: spotlight.right, right: 0, height: spotlight.height },
  ] : [{ inset: 0 }];

  return createPortal(
    <div className={styles.overlay}>
      <div className={styles.blocker} aria-hidden="true" />
      {shades.map((shade, index) => <div key={index} className={styles.shade} style={shade} aria-hidden="true" />)}
      {spotlight && <div className={styles.spotlight} style={{ left: spotlight.left, top: spotlight.top, width: spotlight.width, height: spotlight.height }} aria-hidden="true" />}
      <GameTutorialCard
        ref={cardRef}
        step={step}
        stepIndex={stepIndex}
        stepCount={steps.length}
        position={geometry.card}
        onBack={() => setStepIndex((index) => moveTutorialStep(index, "back", steps.length))}
        onNext={() => setStepIndex((index) => moveTutorialStep(index, "next", steps.length))}
        onSkip={onSkip}
        onFinish={onFinish}
      />
    </div>,
    document.body,
  );
}
