import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import CheckOutlinedIcon from "@mui/icons-material/CheckOutlined";
import Button from "../Button/Button.jsx";
import CircularProgressBar from "../CircularProgressBar/CircularProgressBar.jsx";
import styles from "./LessonMap.module.css";

/* ─── Sound effects hook (Web Audio API, no files) ──────────── */
function useSounds(enabled = true) {
  const ctxRef = useRef(null);

  const getCtx = useCallback(() => {
    if (!enabled) return null;
    if (!ctxRef.current) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctxRef.current = new AC();
      } catch {
        return null;
      }
    }
    if (ctxRef.current.state === "suspended") {
      ctxRef.current.resume().catch(() => {});
    }
    return ctxRef.current;
  }, [enabled]);

  const tone = useCallback(
    (freq, duration, type = "sine", gain = 0.08) => {
      const ctx = getCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      g.gain.setValueAtTime(gain, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    },
    [getCtx],
  );

  const playHover = useCallback(
    () => tone(520, 0.05, "triangle", 0.04),
    [tone],
  );

  const playClick = useCallback(() => {
    tone(660, 0.08, "square", 0.06);
    setTimeout(() => tone(880, 0.1, "triangle", 0.05), 20);
  }, [tone]);

  const playLocked = useCallback(() => {
    tone(120, 0.18, "sawtooth", 0.05);
  }, [tone]);

  const playFootstep = useCallback(() => {
    tone(180, 0.04, "square", 0.025);
  }, [tone]);

  return { playHover, playClick, playLocked, playFootstep };
}

/* ─── Roman numeral helper (I, II, III … X) ──────────────────── */
const toRoman = (num) => {
  const map = [
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let n = num;
  let out = "";
  for (const [v, s] of map) {
    while (n >= v) {
      out += s;
      n -= v;
    }
  }
  return out;
};

/* ─── Connector colour by node state ────────────────────────── */
const getConnectorClass = (from, to) => {
  if (from.status === "completed" && to.status === "completed")
    return styles.connectorCompleted;
  if (from.status === "completed" && to.status === "current")
    return styles.connectorActive;
  return styles.connectorUpcoming;
};

/* ─── Medieval pixel-art castle hero ─────────────────────────── */
function CastleHero() {
  return (
    <svg
      viewBox="0 0 260 160"
      xmlns="http://www.w3.org/2000/svg"
      className={styles.heroSvg}
      aria-hidden="true"
    >
      {/* Twilight sky */}
      <rect width="260" height="160" fill="#2a1810" />
      <rect y="0" width="260" height="80" fill="#3d2817" opacity="0.6" />
      {/* Distant mountains */}
      <polygon
        points="0,110 40,80 80,105 120,75 160,100 200,78 260,108 260,130 0,130"
        fill="#1a0f08"
      />
      {/* Ground */}
      <rect y="118" width="260" height="42" fill="#2a1810" />
      <rect y="118" width="260" height="3" fill="#c9a662" opacity="0.3" />
      {/* Far-left tower */}
      <rect x="18" y="48" width="20" height="80" fill="#1a0f08" />
      <rect x="13" y="36" width="9" height="22" fill="#1a0f08" />
      <rect x="29" y="36" width="9" height="22" fill="#1a0f08" />
      <rect x="21" y="26" width="14" height="14" fill="#1a0f08" />
      <rect x="25" y="14" width="6" height="14" fill="#8b2c1a" />
      <rect x="20" y="62" width="4" height="6" fill="#ffd93d" opacity="0.8" />
      {/* Mid-left tower */}
      <rect x="68" y="56" width="24" height="72" fill="#1a0f08" />
      <rect x="63" y="42" width="10" height="20" fill="#1a0f08" />
      <rect x="85" y="42" width="10" height="20" fill="#1a0f08" />
      <rect x="71" y="30" width="18" height="16" fill="#1a0f08" />
      <rect x="69" y="70" width="5" height="7" fill="#ffd93d" opacity="0.75" />
      {/* Main castle keep */}
      <rect x="104" y="48" width="52" height="80" fill="#241a10" />
      <rect x="99" y="32" width="12" height="24" fill="#241a10" />
      <rect x="150" y="32" width="12" height="24" fill="#241a10" />
      <rect x="108" y="20" width="44" height="18" fill="#241a10" />
      <rect x="125" y="10" width="12" height="14" fill="#3d2817" />
      <rect x="128" y="4" width="6" height="8" fill="#8b2c1a" />
      <rect x="118" y="60" width="8" height="10" fill="#ffd93d" opacity="0.8" />
      <rect x="134" y="60" width="8" height="10" fill="#ffd93d" opacity="0.8" />
      {/* Castle gate */}
      <rect x="122" y="90" width="16" height="38" fill="#0d0704" />
      <rect x="124" y="92" width="12" height="4" fill="#3d2817" />
      {/* Far-right tower */}
      <rect x="192" y="62" width="22" height="66" fill="#1a0f08" />
      <rect x="187" y="50" width="9" height="18" fill="#1a0f08" />
      <rect x="207" y="50" width="9" height="18" fill="#1a0f08" />
      <rect x="191" y="40" width="24" height="14" fill="#1a0f08" />
      <rect x="200" y="28" width="6" height="14" fill="#8b2c1a" />
      {/* Trees */}
      <rect x="28" y="96" width="7" height="32" fill="#1a3d28" />
      <rect x="52" y="90" width="6" height="38" fill="#163320" />
      <rect x="220" y="94" width="6" height="34" fill="#1a3d28" />
      <rect x="238" y="98" width="7" height="30" fill="#163320" />
      {/* Moon */}
      <circle cx="210" cy="28" r="14" fill="#2a1810" />
      <circle cx="210" cy="28" r="11" fill="#ffeb99" opacity="0.85" />
      <circle cx="208" cy="26" r="5" fill="#ffd93d" opacity="0.6" />
      {/* Stars */}
      <rect x="50" y="18" width="2" height="2" fill="#ffd93d" opacity="0.7" />
      <rect x="90" y="10" width="2" height="2" fill="#fff" opacity="0.6" />
      <rect x="170" y="15" width="2" height="2" fill="#ffd93d" opacity="0.65" />
      <rect x="242" y="22" width="2" height="2" fill="#fff" opacity="0.5" />
      <rect x="30" y="8" width="2" height="2" fill="#fff" opacity="0.5" />
      <rect x="150" y="6" width="2" height="2" fill="#ffd93d" opacity="0.6" />
      {/* Pixel knight with shield */}
      <rect x="36" y="110" width="6" height="14" fill="#5c3a1e" />
      <rect x="37" y="105" width="4" height="5" fill="#c9a662" />
      <rect x="33" y="112" width="3" height="8" fill="#8b2c1a" />
      <rect x="35" y="112" width="2" height="6" fill="#1a0f08" />
      <rect x="43" y="112" width="2" height="6" fill="#1a0f08" />
    </svg>
  );
}

/* ─── Single map node (shield-shaped) ────────────────────────── */
function MapNode({ node, onNodeClick, sounds }) {
  const isLocked = node.status === "locked";
  const isCurrent = node.status === "current";
  const isDone = node.status === "completed";
  const isBoss = node.levelNumber === 5 || node.levelNumber === 10;

  const handleClick = () => {
    if (isLocked) {
      sounds?.playLocked();
      return;
    }
    sounds?.playClick();
    onNodeClick?.(node);
  };

  const handleEnter = () => {
    if (!isLocked) sounds?.playHover();
  };

  return (
    <button
      type="button"
      className={`${styles.nodeSlot} ${isLocked ? styles.nodeSlotDisabled : ""}`}
      style={{ left: `${node.x}%`, top: `${node.y}%` }}
      onClick={handleClick}
      onMouseEnter={handleEnter}
      disabled={isLocked}
      aria-label={`Level ${node.levelNumber}: ${node.title}${isLocked ? " — locked" : ""}`}
    >
      {/* Boss crown banner */}
      {isBoss && !isLocked && (
        <span className={styles.bossBadge} aria-hidden="true">
          ♛ Boss
        </span>
      )}

      {/* Active pennant */}
      {isCurrent && (
        <span className={styles.activeBanner} aria-hidden="true">
          Active
        </span>
      )}

      {/* Shield node */}
      <span
        className={`
          ${styles.nodeShield}
          ${isDone ? styles.nodeDone : ""}
          ${isCurrent ? styles.nodeCurrent : ""}
          ${node.status === "unlocked" ? styles.nodeUnlocked : ""}
          ${isLocked ? styles.nodeLocked : ""}
          ${isBoss ? styles.nodeBoss : ""}
        `}
      >
        <span className={styles.shieldOuter} />
        <span className={styles.shieldInner} />
        {isCurrent && <span className={styles.pulseRing} aria-hidden="true" />}
        <span className={styles.nodeContent}>
          {isDone ? (
            <CheckOutlinedIcon sx={{ fontSize: 20, color: "#e8ffd4" }} />
          ) : isLocked ? (
            <LockOutlinedIcon sx={{ fontSize: 16, color: "#8b6f3f" }} />
          ) : (
            <span className={styles.nodeNum}>{toRoman(node.levelNumber)}</span>
          )}
        </span>
      </span>

      {/* Label below */}
      <span
        className={`
          ${styles.nodeLabel}
          ${isDone ? styles.nodeLabelDone : ""}
          ${isCurrent ? styles.nodeLabelCurrent : ""}
          ${isLocked ? styles.nodeLabelLocked : ""}
        `}
      >
        {node.title}
      </span>

      {/* Score badge (gold coin) */}
      {isDone && node.finalScore != null && (
        <span className={styles.scoreBadge}>
          <span className={styles.coinIcon} aria-hidden="true" />
          {node.finalScore}
        </span>
      )}
    </button>
  );
}

/* ─── Stage header (parchment banner) ────────────────────────── */
function StageHeader({ stage, completedCount, totalCount, isLocked }) {
  const stageNum = stage.id.replace("stage-", "");
  return (
    <div
      className={styles.stageHeader}
      style={{ left: `${stage.x}%`, top: `${stage.y}%` }}
    >
      <div
        className={`${styles.stageNum} ${
          isLocked ? styles.stageNumLocked : styles.stageNumActive
        }`}
      >
        {toRoman(parseInt(stageNum, 10))}
      </div>
      <div className={styles.stageInfo}>
        <div
          className={`${styles.stageName} ${
            isLocked ? styles.stageNameLocked : ""
          }`}
        >
          ❦ {stage.title} ❦
        </div>
        <div className={styles.stageSub}>{stage.subtitle}</div>
      </div>
      <div
        className={`${styles.stageCount} ${
          isLocked ? styles.stageCountLocked : styles.stageCountActive
        }`}
      >
        {isLocked
          ? "⚿ Sealed"
          : `${toRoman(completedCount) || "0"} / ${toRoman(totalCount)} conquered`}
      </div>
    </div>
  );
}

/* ─── Walking knight sprite (spritesheet-driven) ──────────────
   Sheet: /game/assets/characters/players/char_blue.png
   Layout: 8 cols × 7 rows, 56×56 per frame
   Row 0 = idle (6 frames)
   Row 2 = walk/run (8 frames)
─────────────────────────────────────────────────────────── */
const SPRITE_FRAME_SIZE = 56; // source frame size in px
const SPRITE_COLS = 8;
const WALK_ROW = 2;
const WALK_FRAMES = 8;
const IDLE_ROW = 0;
const IDLE_FRAMES = 6;

function KnightSprite({ path, onStep, spriteSrc }) {
  const [frame, setFrame] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isWalking, setIsWalking] = useState(true);
  const stepCountRef = useRef(0);

  /* Keep onStep in a ref so frame-cycle interval doesn't tear down */
  const onStepRef = useRef(onStep);
  useEffect(() => {
    onStepRef.current = onStep;
  }, [onStep]);

  /* Animate position along path */
  useEffect(() => {
    if (!path || path.length < 2) {
      setProgress(1);
      setIsWalking(false);
      return;
    }
    setIsWalking(true);
    setProgress(0);
    const duration = Math.min(2400, 600 + path.length * 400);
    const start = performance.now();
    let raf;
    const tick = (t) => {
      const elapsed = t - start;
      const p = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - p, 2);
      setProgress(eased);
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setIsWalking(false);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [path]);

  /* Sprite frame cycling — only depends on isWalking */
  useEffect(() => {
    const frames = isWalking ? WALK_FRAMES : IDLE_FRAMES;
    const interval = isWalking ? 100 : 220;
    const id = setInterval(() => {
      setFrame((f) => {
        const next = (f + 1) % frames;
        if (isWalking) {
          stepCountRef.current += 1;
          if (stepCountRef.current % 4 === 0) onStepRef.current?.();
        }
        return next;
      });
    }, interval);
    return () => clearInterval(id);
  }, [isWalking]);

  /* Reset frame when switching animations */
  useEffect(() => {
    setFrame(0);
  }, [isWalking]);

  /* Compute current position on the path — fully defensive */
  const pos = useMemo(() => {
    // Guard 1: empty or missing path
    if (!Array.isArray(path) || path.length === 0) {
      return null;
    }

    // Guard 2: validate every point has x/y
    const safePath = path.filter(
      (p) => p && typeof p.x === "number" && typeof p.y === "number",
    );
    if (safePath.length === 0) return null;

    // Single point OR animation finished — stand at the last valid point
    if (safePath.length === 1 || progress >= 1) {
      const last = safePath[safePath.length - 1];
      const prev = safePath[safePath.length - 2] ?? last;
      return {
        x: last.x,
        y: last.y,
        angle: Math.atan2(last.y - prev.y, last.x - prev.x),
      };
    }

    // Walking between segments
    const segCount = safePath.length - 1;
    const t = progress * segCount;
    const i = Math.max(0, Math.min(segCount - 1, Math.floor(t)));
    const localT = Math.max(0, Math.min(1, t - i));
    const a = safePath[i];
    const b = safePath[i + 1];

    // Guard 3: if a or b is somehow missing, fall back to last point
    if (!a || !b) {
      const last = safePath[safePath.length - 1];
      return { x: last.x, y: last.y, angle: 0 };
    }

    return {
      x: a.x + (b.x - a.x) * localT,
      y: a.y + (b.y - a.y) * localT - Math.sin(localT * Math.PI) * 2,
      angle: Math.atan2(b.y - a.y, b.x - a.x),
    };
  }, [path, progress]);

  // Bail out of rendering if we have no valid position
  if (!pos) return null;

  const facingLeft = Math.cos(pos.angle) < -0.05;
  const row = isWalking ? WALK_ROW : IDLE_ROW;

  return (
    <div
      className={styles.knightSprite}
      style={{
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        transform: `translate(-50%, -100%) scaleX(${facingLeft ? -1 : 1})`,
      }}
      aria-hidden="true"
    >
      <div
        className={styles.knightFrame}
        style={{
          backgroundImage: `url(${spriteSrc})`,
          backgroundPosition: `-${frame * SPRITE_FRAME_SIZE}px -${row * SPRITE_FRAME_SIZE}px`,
          backgroundSize: `${SPRITE_COLS * SPRITE_FRAME_SIZE}px auto`,
        }}
      />
    </div>
  );
}

function LessonMap({
  lessonTitle,
  subtitle,
  description,
  progressPercent,
  stages,
  nodes,
  connections = [],
  lessonDetails = [],
  backgroundImageSrc,
  characterSpriteSrc,
  onContinue,
  onExit,
  onNodeClick,
  continueLabel = "Onward",
  continueDisabled = false,
  exitLabel = "Retreat",
}) {
  /* Default character sprite — relative to the Vite BASE_URL */
  const knightSpriteSrc =
    characterSpriteSrc ??
    `${import.meta.env.BASE_URL}game/assets/characters/players/char_blue.png`;

  const orderedNodes = [...nodes].sort((a, b) => a.levelNumber - b.levelNumber);
  const nodeById = new Map(orderedNodes.map((n) => [n.id, n]));

  /* Sound FX */
  const sounds = useSounds(true);

  /* connectors */
  const fallback = orderedNodes
    .slice(1)
    .map((n, i) => ({ fromId: orderedNodes[i].id, toId: n.id }));

  const connectors = (connections.length > 0 ? connections : fallback)
    .map((conn) => {
      const from = nodeById.get(conn.fromId);
      const to = nodeById.get(conn.toId);
      if (!from || !to) return null;
      return { key: `${conn.fromId}-${conn.toId}`, from, to };
    })
    .filter(Boolean);

  /* derived state */
  const currentNode = orderedNodes.find((n) => n.status === "current");
  const stage1Nodes = orderedNodes.filter((n) => n.levelNumber <= 5);
  const stage2Nodes = orderedNodes.filter((n) => n.levelNumber > 5);
  const stage1Done = stage1Nodes.filter((n) => n.status === "completed").length;
  const stage2Done = stage2Nodes.filter((n) => n.status === "completed").length;
  const stage2Locked = stage2Nodes.every((n) => n.status === "locked");
  const totalDone = stage1Done + stage2Done;

  /* Knight path — completed nodes → current node.
     Depends on a serialized signature so identical paths share a reference
     (prevents KnightSprite from remounting on every parent render). */
  const knightKey = orderedNodes
    .filter((n) => n.status === "completed" || n.status === "current")
    .map((n) => `${n.levelNumber}:${n.status}:${n.x},${n.y}`)
    .join("|");

  const knightPath = useMemo(() => {
    const completed = orderedNodes.filter((n) => n.status === "completed");
    const current = orderedNodes.find((n) => n.status === "current");
    const pts = completed.map((n) => ({ x: n.x, y: n.y }));
    if (current) pts.push({ x: current.x, y: current.y });
    return pts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knightKey]);

  const LEGEND = [
    { label: "Conquered", cls: "legendDone" },
    { label: "In Quest", cls: "legendCurrent" },
    { label: "Awaits", cls: "legendUnlocked" },
    { label: "Sealed", cls: "legendLocked" },
  ];

  return (
    <div className={styles.lessonMapRoot}>
      {/* Mobile fallback */}
      <div className={styles.mobileNotice}>
        <h3>⚔ Desktop Realm Required ⚔</h3>
        <p>This quest map is available on desktop and tablet screens.</p>
      </div>

      <div className={styles.mapLayout}>
        {/* ══ LEFT PANEL — parchment scroll ══ */}
        <aside className={styles.leftPanel}>
          {/* Pixel-art hero */}
          <div
            className={`${styles.heroWrap} ${
              backgroundImageSrc ? styles.heroWrapWithImage : ""
            }`}
            style={
              backgroundImageSrc
                ? { backgroundImage: `url(${backgroundImageSrc})` }
                : undefined
            }
          >
            {!backgroundImageSrc && <CastleHero />}
            <div className={styles.heroBadge}>⚔ Region I</div>
            <div className={styles.heroTitleBlock}>
              <div className={styles.heroName}>The Castle of Syntax</div>
              <div className={styles.heroSub}>Variables &amp; Data Types</div>
            </div>
          </div>

          {/* Progress ring — framed as a royal seal */}
          <div className={styles.progressRow}>
            <div className={styles.progressRing}>
              <CircularProgressBar
                percentage={progressPercent}
                strokeWidth={7}
                showText
              />
            </div>
            <div className={styles.progressMeta}>
              <div className={styles.progressLabel}>⚜ Quest Progress</div>
              <div className={styles.progressVal}>
                {Math.round(progressPercent)}%
              </div>
              <div className={styles.progressSub}>
                {toRoman(totalDone) || "0"} of X levels
              </div>
            </div>
          </div>

          {/* Current level pill */}
          {currentNode && (
            <div className={styles.currentPill}>
              <span className={styles.currentDot} />
              <div>
                <div className={styles.currentPillLabel}>⚔ Now Questing</div>
                <div className={styles.currentPillVal}>
                  Level {toRoman(currentNode.levelNumber)} · {currentNode.title}
                </div>
              </div>
            </div>
          )}

          {/* Scroll of wisdom */}
          {lessonDetails.length > 0 && (
            <div className={styles.lessonNotes}>
              <div className={styles.notesHeading}>📜 Scroll of Wisdom</div>
              {lessonDetails.map((line, i) => (
                <div key={i} className={styles.noteRow}>
                  <span className={styles.noteBullet}>✦</span>
                  <span className={styles.noteText}>{line}</span>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className={styles.panelActions}>
            <Button
              label={continueLabel}
              variant="primary"
              size="md"
              onClick={() => {
                sounds.playClick();
                onContinue?.();
              }}
              disabled={continueDisabled}
            />
            <Button
              label={exitLabel}
              variant="outline"
              size="md"
              onClick={() => {
                sounds.playHover();
                onExit?.();
              }}
            />
          </div>
        </aside>

        {/* ══ RIGHT PANEL — the map ══ */}
        <section className={styles.rightPanel}>
          <header className={styles.mapHeader}>
            <div className={styles.headerText}>
              <h2 className={styles.mapTitle}>⚔ {lessonTitle} ⚔</h2>
              <p className={styles.mapSubtitle}>{subtitle}</p>
              <span className={styles.mapDesc}>{description}</span>
            </div>

            {/* Legend */}
            <div className={styles.legend}>
              {LEGEND.map(({ label, cls }) => (
                <div key={label} className={styles.legendItem}>
                  <span className={`${styles.legendDot} ${styles[cls]}`} />
                  <span className={styles.legendLabel}>{label}</span>
                </div>
              ))}
            </div>
          </header>

          <div className={styles.mapCanvas}>
            {/* Parchment corner decorations */}
            <div className={styles.cornerTL} aria-hidden="true" />
            <div className={styles.cornerTR} aria-hidden="true" />
            <div className={styles.cornerBL} aria-hidden="true" />
            <div className={styles.cornerBR} aria-hidden="true" />

            {/* Compass rose */}
            <div className={styles.compass} aria-hidden="true">
              ✥
            </div>

            {/* Stage band backgrounds */}
            <div className={`${styles.stageBand} ${styles.stageBandOne}`} />
            <div
              className={`${styles.stageBand} ${styles.stageBandTwo} ${
                stage2Locked ? styles.stageBandLocked : ""
              }`}
            />
            <div className={styles.stageDivider} />

            {/* Stage headers */}
            {stages.map((stage, idx) => (
              <StageHeader
                key={stage.id}
                stage={stage}
                completedCount={idx === 0 ? stage1Done : stage2Done}
                totalCount={5}
                isLocked={idx === 1 && stage2Locked}
              />
            ))}

            {/* SVG connectors */}
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className={styles.connectorLayer}
              aria-hidden="true"
            >
              <defs>
                <marker
                  id="arrowDone"
                  markerWidth="3"
                  markerHeight="3"
                  refX="2.5"
                  refY="1.5"
                  orient="auto"
                >
                  <path d="M0,0 L0,3 L3,1.5 z" fill="#2a5a2a" />
                </marker>
                <marker
                  id="arrowLock"
                  markerWidth="3"
                  markerHeight="3"
                  refX="2.5"
                  refY="1.5"
                  orient="auto"
                >
                  <path d="M0,0 L0,3 L3,1.5 z" fill="#8b6f3f" />
                </marker>
              </defs>

              {connectors.map(({ key, from, to }) => {
                const dx = to.x - from.x;
                const dy = to.y - from.y;
                const cpOff = Math.max(3, Math.abs(dy) * 0.25);
                const sway = (from.levelNumber % 2 === 0 ? 1 : -1) * 2.2;
                const d = `M ${from.x} ${from.y} C ${from.x + dx * 0.35} ${from.y + cpOff + sway}, ${to.x - dx * 0.35} ${to.y - cpOff - sway}, ${to.x} ${to.y}`;
                const isDone =
                  from.status === "completed" && to.status === "completed";
                return (
                  <path
                    key={key}
                    d={d}
                    className={`${styles.connectorPath} ${getConnectorClass(from, to)}`}
                    markerEnd={isDone ? "url(#arrowDone)" : "url(#arrowLock)"}
                  />
                );
              })}
            </svg>

            {/* Nodes */}
            {orderedNodes.map((node) => (
              <MapNode
                key={node.id}
                node={node}
                onNodeClick={onNodeClick}
                sounds={sounds}
              />
            ))}

            {/* Walking knight sprite */}
            {knightPath.length > 0 && knightPath[0] && (
              <KnightSprite
                key={knightKey}
                path={knightPath}
                spriteSrc={knightSpriteSrc}
                onStep={sounds.playFootstep}
              />
            )}

            {/* Stage 2 locked overlay */}
            {stage2Locked && (
              <div className={styles.stage2Overlay}>
                <LockOutlinedIcon sx={{ fontSize: 22, color: "#8b6f3f" }} />
                <span className={styles.overlayText}>
                  Conquer Stage I to unseal Stage II
                </span>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export default LessonMap;
