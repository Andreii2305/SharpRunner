import styles from "./LessonSection.module.css";
import Sidebar from "../SideBar/Sidebar.jsx";
import Header from "../Header/Header.jsx";
import Button from "../Button/Button.jsx";
import ProgressBar from "../ProgressBarComponent/ProgressBarComponent.jsx";

function LessonSection() {
  return (
    <div className={styles.lessonPage}>
      <Header pageType="primary" userName="Andres" />
      <div className={styles.lessonContainer}>
        <Sidebar variant="active" />
        <section className={styles.lessons}>
          <div className={styles.currentLessonCard}>
            <div className={styles.lessonInfo}>
              <h4 className={styles.title}>Current Lesson</h4>
              <p className={styles.currentLesson}>Variables and Data Types</p>
            </div>
            <Button
              label="Continue Game"
              variant="primary"
              onClick={() => alert("Continue to Game")}
            />
          </div>
          <div className={styles.container}>
            <div className={styles.lessonBar}>
              <div className={styles.infos}>
                <h4>Variables and Data Types</h4>
                <p>
                  Explore magical castle to learn about variables and data
                  types.
                </p>
                <div className={styles.progress}>
                  <p>Progress</p>
                  <ProgressBar progress={75} />
                </div>
              </div>
              <div className={styles.button}></div>
            </div>
            <div className={styles.lessonBar}>
              <div className={styles.infos}>
                <h4>Variables and Data Types</h4>
                <p>
                  Explore magical castle to learn about variables and data
                  types.
                </p>
                <div className={styles.progress}>
                  <p>Progress</p>
                  <ProgressBar progress={75} />
                </div>
              </div>
              <div className={styles.button}></div>
            </div>
            <div className={styles.lessonBar}>
              <div className={styles.infos}>
                <h4>Variables and Data Types</h4>
                <p>
                  Explore magical castle to learn about variables and data
                  types.
                </p>
                <div className={styles.progress}>
                  <p>Progress</p>
                  <ProgressBar progress={75} />
                </div>
              </div>
              <div className={styles.button}></div>
            </div>
            <div className={styles.lessonBar}>
              <div className={styles.infos}>
                <h4>Variables and Data Types</h4>
                <p>
                  Explore magical castle to learn about variables and data
                  types.
                </p>
                <div className={styles.progress}>
                  <p>Progress</p>
                  <ProgressBar progress={75} />
                </div>
              </div>
              <div className={styles.button}></div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default LessonSection;
