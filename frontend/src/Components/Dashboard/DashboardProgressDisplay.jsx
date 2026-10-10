import {
  DASHBOARD_GAME_REGIONS,
  createDashboardProgressDisplay,
  createDashboardRegionTileDisplays,
} from "./dashboardProgressDisplay.js";
import styles from "./Dashboard.module.css";

const RegionTile = ({ region, progress }) => {
  const pct = progress.progressPercent ?? 0;
  const statusClass = progress.locked
    ? styles.statusLocked
    : progress.availability === "unknown"
      ? styles.statusUnavailable
    : progress.isCompleted
      ? styles.statusDone
      : styles.statusProgress;

  return (
    <div className={`${styles.regionTile} ${progress.locked ? styles.locked : ""}`}>
      <div
        className={styles.regionIcon}
        style={{ background: region.fill, color: region.accent }}
      >
        {region.letter}
      </div>
      <div className={styles.regionName}>{region.label}</div>
      <div className={styles.regionTopic}>{region.topic}</div>
      <div className={styles.miniBarTrack}>
        <div
          className={styles.miniBarFill}
          style={{ width: `${pct}%`, background: region.accent }}
        />
      </div>
      <div className={`${styles.regionStatus} ${statusClass}`}>
        {progress.statusText}
      </div>
    </div>
  );
};

export const DashboardGameProgressStat = ({ progressData }) => {
  const display = createDashboardProgressDisplay(progressData);
  return (
    <div className={styles.statCard}>
      <div className={styles.statLabel}>{display.label}</div>
      <div className={styles.statValue}>{display.percentageText}</div>
      <div className={styles.statSub}>{display.countText}</div>
    </div>
  );
};

export const DashboardGameProgressPanel = ({ progressData }) => {
  const display = createDashboardProgressDisplay(progressData);
  const regionDisplays = createDashboardRegionTileDisplays(progressData);

  return (
    <div className={styles.card}>
      <div className={styles.sectionHead}>
        <div className={styles.sectionTitle}>Lesson progress</div>
        <div className={styles.sectionSub}>{display.compactCountText}</div>
      </div>
      <div className={styles.overallBarWrap}>
        <div className={styles.overallBar}>
          <div
            className={styles.overallFill}
            style={{ width: `${display.progressPercent ?? 0}%` }}
          />
        </div>
        <span className={styles.overallPct}>{display.percentageText}</span>
      </div>
      <div className={styles.lessonGrid}>
        {DASHBOARD_GAME_REGIONS.map((region, index) => (
          <RegionTile
            key={region.key}
            region={region}
            progress={regionDisplays[index]}
          />
        ))}
      </div>
    </div>
  );
};
