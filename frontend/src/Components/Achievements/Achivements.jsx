import styles from "./Achievements.module.css";

function Achievements({ title, badgeSrc, empty }) {
  return (
    <div className={styles.card}>
      {empty ? (
        <>
          <div className={styles.plus}>+</div>
          <p className={styles.label}>Add Badge</p>
        </>
      ) : (
        <>
          <img src={badgeSrc} alt={title} className={styles.badge} />
          <p className={styles.label}>{title}</p>
        </>
      )}
    </div>
  );
}

export default Achievements;
