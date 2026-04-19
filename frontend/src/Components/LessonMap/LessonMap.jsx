import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import CheckOutlinedIcon from "@mui/icons-material/CheckOutlined";
import Button from "../Button/Button.jsx";
import CircularProgressBar from "../CircularProgressBar/CircularProgressBar.jsx";
import styles from "./LessonMap.module.css";

/* ─── Connector colour by node state ────────────────────────── */
const getConnectorClass = (from, to) => {
  if (from.status === "completed" && to.status === "completed")
    return styles.connectorCompleted;
  if (from.status === "completed" && to.status === "current")
    return styles.connectorActive;
  return styles.connectorUpcoming;
};

/* ─── SVG pixel-art castle hero ─────────────────────────────── */
function CastleHero() {
  return (
    <svg
      viewBox="0 0 260 160"
      xmlns="http://www.w3.org/2000/svg"
      className={styles.heroSvg}
      aria-hidden="true"
    >
      <rect width="260" height="160" fill="#0d2b1e" />
      <rect y="108" width="260" height="52" fill="#1a3a2a" />
      {/* Far-left tower */}
      <rect x="18" y="48" width="20" height="80" fill="#0f2318" />
      <rect x="13" y="36" width="9" height="22" fill="#0f2318" />
      <rect x="29" y="36" width="9" height="22" fill="#0f2318" />
      <rect x="21" y="26" width="14" height="14" fill="#0f2318" />
      <rect x="20" y="60" width="4" height="6" fill="#1D9E75" opacity="0.5" />
      {/* Mid-left tower */}
      <rect x="68" y="56" width="24" height="72" fill="#0f2318" />
      <rect x="63" y="42" width="10" height="20" fill="#0f2318" />
      <rect x="85" y="42" width="10" height="20" fill="#0f2318" />
      <rect x="71" y="30" width="18" height="16" fill="#0f2318" />
      <rect x="69" y="68" width="5" height="7" fill="#1D9E75" opacity="0.45" />
      {/* Main castle */}
      <rect x="104" y="48" width="52" height="80" fill="#122b1e" />
      <rect x="99" y="32" width="12" height="24" fill="#122b1e" />
      <rect x="150" y="32" width="12" height="24" fill="#122b1e" />
      <rect x="108" y="20" width="44" height="18" fill="#122b1e" />
      <rect x="125" y="10" width="12" height="14" fill="#1a3a2a" />
      <rect x="128" y="6" width="6" height="8" fill="#1D9E75" opacity="0.7" />
      <rect x="118" y="60" width="8" height="10" fill="#1D9E75" opacity="0.4" />
      <rect x="134" y="60" width="8" height="10" fill="#1D9E75" opacity="0.4" />
      <rect x="122" y="90" width="16" height="38" fill="#0d2318" />
      {/* Far-right tower */}
      <rect x="192" y="62" width="22" height="66" fill="#0f2318" />
      <rect x="187" y="50" width="9" height="18" fill="#0f2318" />
      <rect x="207" y="50" width="9" height="18" fill="#0f2318" />
      <rect x="191" y="40" width="24" height="14" fill="#0f2318" />
      {/* Trees */}
      <rect x="28" y="96" width="7" height="32" fill="#1a3d28" />
      <rect x="52" y="90" width="6" height="38" fill="#163320" />
      <rect x="220" y="94" width="6" height="34" fill="#1a3d28" />
      <rect x="238" y="98" width="7" height="30" fill="#163320" />
      {/* Ground shimmer */}
      <rect
        x="0"
        y="118"
        width="260"
        height="6"
        fill="#1D9E75"
        opacity="0.07"
      />
      {/* Moon */}
      <circle cx="210" cy="28" r="14" fill="#1a3a2a" />
      <circle cx="210" cy="28" r="11" fill="#FAC775" opacity="0.75" />
      <circle cx="210" cy="28" r="6" fill="#EF9F27" opacity="0.9" />
      {/* Stars */}
      <rect x="50" y="18" width="2" height="2" fill="#fff" opacity="0.5" />
      <rect x="90" y="10" width="2" height="2" fill="#fff" opacity="0.4" />
      <rect x="170" y="15" width="2" height="2" fill="#fff" opacity="0.45" />
      <rect x="242" y="22" width="2" height="2" fill="#fff" opacity="0.35" />
      {/* Pixel hero */}
      <rect x="36" y="110" width="6" height="14" fill="#1D9E75" />
      <rect x="37" y="105" width="4" height="5" fill="#FAC775" />
      <rect x="35" y="112" width="2" height="6" fill="#26547c" />
      <rect x="43" y="112" width="2" height="6" fill="#26547c" />
    </svg>
  );
}

/* ─── Single map node ────────────────────────────────────────── */
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
      {/* Boss crown badge */}
      {isBoss && !isLocked && (
        <span className={styles.bossBadge} aria-hidden="true">
          BOSS
        </span>
      )}

      {/* Node circle */}
      <span
        className={`
          ${styles.nodeCircle}
          ${isDone ? styles.nodeDone : ""}
          ${isCurrent ? styles.nodeCurrent : ""}
          ${node.status === "unlocked" ? styles.nodeUnlocked : ""}
          ${isLocked ? styles.nodeLocked : ""}
          ${isBoss ? styles.nodeBoss : ""}
        `}
      >
        {isCurrent && <span className={styles.pulseRing} aria-hidden="true" />}
        {isDone ? (
          <CheckOutlinedIcon sx={{ fontSize: 20, color: "#fff" }} />
        ) : isLocked ? (
          <LockOutlinedIcon sx={{ fontSize: 16, color: "#94a3b8" }} />
        ) : (
          <span className={styles.nodeNum}>{node.levelNumber}</span>
        )}
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

      {/* Score badge */}
      {isDone && node.finalScore != null && (
        <span className={styles.scoreBadge}>{node.finalScore}</span>
      )}
    </button>
  );
}

/* ─── Stage header (absolutely positioned inside canvas) ─────── */
function StageHeader({ stage, completedCount, totalCount, isLocked }) {
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
        {stage.id.replace("stage-", "")}
      </div>
      <div className={styles.stageInfo}>
        <div
          className={`${styles.stageName} ${
            isLocked ? styles.stageNameLocked : ""
          }`}
        >
          {stage.title}
        </div>
        <div className={styles.stageSub}>{stage.subtitle}</div>
      </div>
      <div
        className={`${styles.stageCount} ${
          isLocked ? styles.stageCountLocked : styles.stageCountActive
        }`}
      >
        {isLocked ? "Locked" : `${completedCount} / ${totalCount} done`}
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
  continueLabel = "Continue",
  continueDisabled = false,
  exitLabel = "Exit",
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

  const LEGEND = [
    { label: "Completed", cls: "legendDone" },
    { label: "Current", cls: "legendCurrent" },
    { label: "Unlocked", cls: "legendUnlocked" },
    { label: "Locked", cls: "legendLocked" },
  ];

  return (
    <div className={styles.lessonMapRoot}>
      {/* Mobile fallback */}
      <div className={styles.mobileNotice}>
        <h3>Desktop / Tablet Only</h3>
        <p>This lesson map is available on desktop and tablet screens.</p>
      </div>

      <div className={styles.mapLayout}>
        {/* ══ LEFT PANEL ══ */}
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
            <div className={styles.heroBadge}>Region 1</div>
            <div className={styles.heroTitleBlock}>
              <div className={styles.heroName}>The Castle of Syntax</div>
              <div className={styles.heroSub}>Variables &amp; Data Types</div>
            </div>
          </div>

          {/* Progress ring + meta */}
          <div className={styles.progressRow}>
            <div className={styles.progressRing}>
              <CircularProgressBar
                percentage={progressPercent}
                strokeWidth={7}
                showText
              />
            </div>
            <div className={styles.progressMeta}>
              <div className={styles.progressLabel}>Progress</div>
              <div className={styles.progressVal}>
                {Math.round(progressPercent)}%
              </div>
              <div className={styles.progressSub}>
                {stage1Done + stage2Done} / 10 levels
              </div>
            </div>
          </div>

          {/* Current level pill */}
          {currentNode && (
            <div className={styles.currentPill}>
              <span className={styles.currentDot} />
              <div>
                <div className={styles.currentPillLabel}>Now playing</div>
                <div className={styles.currentPillVal}>
                  Level {currentNode.levelNumber} · {currentNode.title}
                </div>
              </div>
            </div>
          )}

          {/* Lesson notes */}
          {lessonDetails.length > 0 && (
            <div className={styles.lessonNotes}>
              <div className={styles.notesHeading}>Lesson Notes</div>
              {lessonDetails.map((line, i) => (
                <div key={i} className={styles.noteRow}>
                  <span className={styles.noteBullet} />
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

        {/* ══ RIGHT PANEL ══ */}
        <section className={styles.rightPanel}>
          <header className={styles.mapHeader}>
            <div className={styles.headerText}>
              <h2 className={styles.mapTitle}>{lessonTitle}</h2>
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
                  <path d="M0,0 L0,3 L3,1.5 z" fill="#1D9E75" />
                </marker>
                <marker
                  id="arrowLock"
                  markerWidth="3"
                  markerHeight="3"
                  refX="2.5"
                  refY="1.5"
                  orient="auto"
                >
                  <path d="M0,0 L0,3 L3,1.5 z" fill="#cbd5e1" />
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
                <LockOutlinedIcon sx={{ fontSize: 20, color: "#94a3b8" }} />
                <span className={styles.overlayText}>
                  Complete Stage 1 to unlock Stage 2
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
