import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import Button from "../Button/Button.jsx";
import CircularProgressBar from "../CircularProgressBar/CircularProgressBar.jsx";
import styles from "./LessonMap.module.css";

const STATUS_CLASS_BY_KEY = {
  completed: "nodeCompleted",
  current: "nodeCurrent",
  unlocked: "nodeUnlocked",
  locked: "nodeLocked",
};

const NODE_SHAPE_CLASSES = [
  "nodeShapeA",
  "nodeShapeB",
  "nodeShapeC",
  "nodeShapeD",
  "nodeShapeE",
];

const buildConnectorPath = (fromNode, toNode, index) => {
  const deltaX = toNode.x - fromNode.x;
  const deltaY = toNode.y - fromNode.y;
  const controlYOffset = Math.max(2.5, Math.abs(deltaY) * 0.22);
  const sway = index % 2 === 0 ? 2.2 : -2.2;

  const c1x = fromNode.x + deltaX * 0.35;
  const c1y = fromNode.y + controlYOffset + sway;
  const c2x = toNode.x - deltaX * 0.35;
  const c2y = toNode.y - controlYOffset - sway;

  return `M ${fromNode.x} ${fromNode.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${toNode.x} ${toNode.y}`;
};

const getConnectorClassName = (fromNode, toNode) => {
  if (fromNode.status === "completed" && toNode.status === "completed") {
    return styles.connectorCompleted;
  }

  if (
    fromNode.status === "locked" ||
    toNode.status === "locked" ||
    toNode.status === "unlocked"
  ) {
    return styles.connectorUpcoming;
  }

  return styles.connectorActive;
};

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
  const nodeById = new Map(orderedNodes.map((node) => [node.id, node]));

  const fallbackConnections = orderedNodes.slice(1).map((node, index) => ({
    fromId: orderedNodes[index].id,
    toId: node.id,
  }));

  const connectors = (
    connections.length > 0 ? connections : fallbackConnections
  )
    .map((connection, index) => {
      const fromNode = nodeById.get(connection.fromId);
      const toNode = nodeById.get(connection.toId);

      if (!fromNode || !toNode) {
        return null;
      }

      return {
        key: `${connection.fromId}-${connection.toId}`,
        from: fromNode,
        to: toNode,
        index,
      };
    })
    .filter(Boolean);

  return (
    <div className={styles.lessonMapRoot}>
      <div className={styles.mobileNotice}>
        <h3>Desktop/Tablet Only</h3>
        <p>This lesson map is currently available on desktop and tablet.</p>
      </div>

      <div className={styles.mapLayout}>
        <aside className={styles.leftPanel}>
          <div className={styles.previewFrame}>
            <img
              src={backgroundImageSrc}
              alt={`${lessonTitle} background`}
              className={styles.previewImage}
            />
          </div>

          <div className={styles.leftMiddle}>
            <div className={styles.progressSection}>
              <span className={styles.progressSectionLabel}>Progress</span>
              <div className={styles.progressRing}>
                <CircularProgressBar
                  percentage={progressPercent}
                  strokeWidth={7}
                  showText
                />
              </div>
            </div>
          </div>

          {lessonDetails.length > 0 && (
            <div className={styles.lessonDetails}>
              <h4>Lesson Notes</h4>
              {lessonDetails.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          )}
        </aside>

        <section className={styles.rightPanel}>
          <header className={styles.mapHeader}>
            <div className={styles.headerText}>
              <h2>{lessonTitle}</h2>
              <p>{subtitle}</p>
              <span>{description}</span>
            </div>

            <div className={styles.headerRight}>
              <div className={styles.headerActions}>
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
            </div>
          </header>

          <div className={styles.mapCanvas}>
            <div className={`${styles.stageBand} ${styles.stageBandOne}`} />
            <div className={`${styles.stageBand} ${styles.stageBandTwo}`} />
            <div className={styles.stageDivider} />

            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className={styles.connectorLayer}
              aria-hidden="true"
            >
              {connectors.map((connector) => (
                <path
                  key={connector.key}
                  d={buildConnectorPath(
                    connector.from,
                    connector.to,
                    connector.index,
                  )}
                  className={`${styles.connectorPath} ${getConnectorClassName(
                    connector.from,
                    connector.to,
                  )}`}
                />
              ))}
            </svg>

            {stages.map((stage) => (
              <div
                key={stage.id}
                className={styles.stageLabel}
                style={{ left: `${stage.x}%`, top: `${stage.y}%` }}
              >
                <h3>{stage.title}</h3>
                <p>{stage.subtitle}</p>
              </div>
            ))}

            {orderedNodes.map((node) => {
              const statusClassKey =
                STATUS_CLASS_BY_KEY[node.status] ?? "nodeUnlocked";
              const isLocked = node.status === "locked";
              const shapeClass =
                NODE_SHAPE_CLASSES[
                  (node.levelNumber - 1) % NODE_SHAPE_CLASSES.length
                ];

              return (
                <button
                  key={node.id}
                  type="button"
                  className={styles.nodeSlot}
                  style={{ left: `${node.x}%`, top: `${node.y}%` }}
                  onClick={() => {
                    if (!isLocked) {
                      onNodeClick?.(node);
                    }
                  }}
                  disabled={isLocked}
                >
                  <span
                    className={`${styles.node} ${styles[statusClassKey]} ${styles[shapeClass]}`}
                    style={{ "--node-rotation": `${node.rotation ?? 0}deg` }}
                  >
                    {isLocked ? (
                      <LockOutlinedIcon fontSize="small" />
                    ) : (
                      <span>{node.levelNumber}</span>
                    )}
                  </span>
                  <span className={styles.nodeTitle}>{node.title}</span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

export default LessonMap;
