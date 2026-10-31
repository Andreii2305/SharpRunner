import styles from "./GamePage.module.css";

const formatSignedRewardAmount = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount === 0) return "0";
  return amount > 0 ? `+${amount}` : `${amount}`;
};

export function GameCompletionRewards({ xpAward, completionDeductions, totalXp }) {
  const newlyGranted = Number(xpAward?.amount ?? 0);
  const originalAward = Number(xpAward?.originalAmount ?? xpAward?.amount ?? 0);
  const breakdown = Array.isArray(xpAward?.breakdown) ? xpAward.breakdown : [];

  return (
    <>
      <div className={styles.gradeXp}>
        &#10022; Original completion award: {originalAward} XP · {Number(totalXp ?? 0)} total XP
      </div>
      <div className={styles.gradeXpGranted}>
        XP newly granted by this save: {newlyGranted}
      </div>
      {breakdown.length > 0 && (
        <div className={styles.gradeXpBreakdown}>
          {breakdown.map((item) => (
            <span key={item.key}>{formatSignedRewardAmount(item.amount)} {item.label}</span>
          ))}
        </div>
      )}
      {completionDeductions ? (
        <dl className={styles.completionDeductions}>
          <div><dt>Recorded interruptions</dt><dd>{completionDeductions.eventCount}</dd></div>
          <div>
            <dt>Score</dt>
            <dd>{completionDeductions.score.base} - {completionDeductions.score.deducted} = {completionDeductions.score.final}</dd>
          </div>
          <div>
            <dt>Completion XP</dt>
            <dd>{completionDeductions.xp.gross} - {completionDeductions.xp.deducted} = {completionDeductions.xp.net}</dd>
          </div>
        </dl>
      ) : null}
    </>
  );
}
