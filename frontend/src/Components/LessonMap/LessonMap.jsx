import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import CheckOutlinedIcon from "@mui/icons-material/CheckOutlined";
import Button from "../Button/Button.jsx";
import CircularProgressBar from "../CircularProgressBar/CircularProgressBar.jsx";
import styles from "./LessonMap.module.css";

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
function MapNode({ node, onNodeClick }) {
  const isLocked = node.status === "locked";
  const isCurrent = node.status === "current";
  const isDone = node.status === "completed";
  const isBoss = node.levelNumber === 5 || node.levelNumber === 10;

  return (
    <button
      type="button"
      className={`${styles.nodeSlot} ${isLocked ? styles.nodeSlotDisabled : ""}`}
      style={{ left: `${node.x}%`, top: `${node.y}%` }}
      onClick={() => !isLocked && onNodeClick?.(node)}
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

/* ─── Main component ─────────────────────────────────────────── */
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
  onContinue,
  onExit,
  onNodeClick,
  continueLabel = "Onward",
  continueDisabled = false,
  exitLabel = "Retreat",
}) {
  const orderedNodes = [...nodes].sort((a, b) => a.levelNumber - b.levelNumber);
  const nodeById = new Map(orderedNodes.map((n) => [n.id, n]));

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
              onClick={onContinue}
              disabled={continueDisabled}
            />
            <Button
              label={exitLabel}
              variant="outline"
              size="md"
              onClick={onExit}
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
              <MapNode key={node.id} node={node} onNodeClick={onNodeClick} />
            ))}

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
