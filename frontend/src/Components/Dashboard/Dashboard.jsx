import styles from "./Dashboard.module.css";
import Header from "../Header/Header.jsx";
import Button from "../Button/Button.jsx";
import Achievements from "../Achievements/Achivements.jsx";
import CircularProgressBar from "../CircularProgressBar/CircularProgressBar.jsx";
import ProgressBarComponent from "../ProgressBarComponent/ProgressBarComponent.jsx";
import Sidebar from "../SideBar/Sidebar.jsx";

function Dashboard() {
  const percentage = 85;

  // This could come from an API or user data in a real application
  const achievements = [
    {
      title: "Loop Master",
      badgeSrc: "/src/assets/Loop-Master.svg",
    },
    {
      title: "Syntax Expert",
      badgeSrc: "/src/assets/Syntax-Expert.svg",
    },
    {
      title: "Quick Coder",
      badgeSrc: "/src/assets/Quick-Coder.svg",
    },
  ];

  // Try different container approach to solve dashboard bug.
  return (
    <>
      <div className={styles.dashboardPage}>
        <Header pageType="primary" userName="Andres" />
        <div className={styles.dashboardContainer}>
          <Sidebar variant="active" />
          <section className={styles.dashboard}>
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
            <div className={styles.progressSection}>
              <div className={styles.progressContainer}>
                <h4 className={styles.title}>Your Progress</h4>
                <div className={styles.circularProgress}>
                  <CircularProgressBar percentage={percentage} />
                </div>
              </div>
              <div className={styles.rightContainer}>
                <div className={styles.achievementContainer}>
                  <h4 className={styles.title}>Achievements</h4>
                  <div className={styles.achievementsGrid}>
                    {achievements.map((achivement, index) => (
                      <Achievements
                        key={index}
                        title={achivement.title}
                        badgeSrc={achivement.badgeSrc}
                      />
                    ))}
                    <Achievements empty />
                    <Achievements empty />
                  </div>
                </div>
                <div className={styles.lessonsContainer}>
                  <h4 className={styles.title}>Lessons Completed</h4>
                  <div className={styles.lessons}>
                    <div className={styles.lessonContainer}>
                      <p className={styles.lesson}>Variables and Data Types</p>
                      <ProgressBarComponent progress={75} />
                    </div>
                    <div className={styles.lessonContainer}>
                      <p className={styles.lesson}>Operators</p>
                      <ProgressBarComponent progress={0} />
                    </div>
                    <div className={styles.lessonContainer}>
                      <p className={styles.lesson}>Conditional Statements</p>
                      <ProgressBarComponent progress={0} />
                    </div>
                    <div className={styles.lessonContainer}>
                      <p className={styles.lesson}>Loops</p>
                      <ProgressBarComponent progress={0} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

export default Dashboard;
