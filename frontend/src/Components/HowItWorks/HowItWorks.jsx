import styles from "./HowItWorks.module.css";
import classroom from "../../assets/Webinar.svg";
import playgames from "../../assets/Gameanalytics.svg";
import progress from "../../assets/Webinar1.svg";
import lineConnector1 from "../../assets/lineConnector1.svg";
import lineConnector2 from "../../assets/lineConnector2.svg";

function HowItWorks() {
  return (
    <section id="howItWorks" className={styles.section}>
      <div className={styles.background}></div>
      <h2 className={styles.title}>How it Works?</h2>

      <div className={styles.stepsContainer}>
        <div className={`${styles.step} ${styles.step1}`}>
          <img src={classroom} alt="Create a Classroom" />
          <h3>1. Create a Classroom</h3>
          <p>Teachers create classrooms and share codes with students.</p>
        </div>

        <div className={`${styles.step} ${styles.step2}`}>
          <img src={playgames} alt="Start Lessons and Play Games" />
          <h3>2. Start Lessons and Play Games</h3>
          <p>
            Students explore Java topics through interactive mini-games and
            challenges.
          </p>
        </div>

        <div className={`${styles.step} ${styles.step3}`}>
          <img src={progress} alt="Track Progress" />
          <h3>3. Track Progress</h3>
          <p>
            Teachers and students view overall learning progress through
            analytics dashboards.
          </p>
        </div>
      </div>
    </section>
  );
}

export default HowItWorks;
