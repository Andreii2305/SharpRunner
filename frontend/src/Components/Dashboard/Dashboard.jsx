import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import styles from "./Dashboard.module.css";
import Button from "../Button/Button.jsx";
import Achievements from "../Achievements/Achivements.jsx";
import LoopMasterBadge from "../../assets/Loop-Master.svg";
import SyntaxExpertBadge from "../../assets/Syntax-Expert.svg";
import QuickCoderBadge from "../../assets/Quick-Coder.svg";
import CircularProgressBar from "../CircularProgressBar/CircularProgressBar.jsx";
import ProgressBarComponent from "../ProgressBarComponent/ProgressBarComponent.jsx";
import Sidebar from "../SideBar/Sidebar.jsx";
import { buildApiUrl, getAuthHeaders } from "../../utils/auth";

const FALLBACK_LESSONS = [
  {
    lessonKey: "variables-and-data-types",
    lessonTitle: "Variables and Data Types",
    progressPercent: 0,
  },
  { lessonKey: "operators", lessonTitle: "Operators", progressPercent: 0 },
  {
    lessonKey: "conditional-statements",
    lessonTitle: "Conditional Statements",
    progressPercent: 0,
  },
  { lessonKey: "loops", lessonTitle: "Loops", progressPercent: 0 },
];

function Dashboard() {
  const navigate = useNavigate();
  const [progressData, setProgressData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const achievements = [
    { title: "Loop Master", badgeSrc: LoopMasterBadge },
    { title: "Syntax Expert", badgeSrc: SyntaxExpertBadge },
    { title: "Quick Coder", badgeSrc: QuickCoderBadge },
  ];

  useEffect(() => {
    let isMounted = true;

    const fetchProgress = async () => {
      try {
        const response = await axios.get(buildApiUrl("/api/progress/me"), {
          headers: getAuthHeaders(),
        });

        if (!isMounted) {
          return;
        }

        setProgressData(response.data);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setLoadError("Unable to load live progress. Showing local defaults.");
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchProgress();

    return () => {
      isMounted = false;
    };
  }, []);

  const lessons = useMemo(() => {
    if (progressData?.lessons?.length > 0) {
      return progressData.lessons;
    }

    return FALLBACK_LESSONS;
  }, [progressData]);

  const overallProgress = progressData?.summary?.overallProgress ?? 0;
  const currentLesson =
    progressData?.summary?.currentLesson ?? FALLBACK_LESSONS[0].lessonTitle;
  const completedLessons = progressData?.summary?.completedLessons ?? 0;

  return (
    <div className={styles.dashboardContainer}>
      <Sidebar variant="active" />
      <section className={styles.dashboard}>
        <div className={styles.currentLessonCard}>
          <div className={styles.lessonInfo}>
            <h4 className={styles.title}>Current Lesson</h4>
            <p className={styles.currentLesson}>
              {isLoading ? "Loading..." : currentLesson}
            </p>
          </div>
          <Button
            label="Continue Game"
            variant="primary"
            size="md"
            onClick={() => navigate("/Map")}
          />
        </div>
        <div className={styles.progressSection}>
          <div className={styles.progressContainer}>
            <h4 className={styles.title}>Your Progress</h4>
            <div className={styles.circularProgress}>
              <CircularProgressBar percentage={overallProgress} />
            </div>
          </div>
          <div className={styles.rightContainer}>
            <div className={styles.achievementContainer}>
              <h4 className={styles.title}>Achievements</h4>
              <div className={styles.achievementsGrid}>
                {achievements.map((achievement, index) => {
                  if (index < completedLessons) {
                    return (
                      <Achievements
                        key={achievement.title}
                        title={achievement.title}
                        badgeSrc={achievement.badgeSrc}
                      />
                    );
                  }

                  return <Achievements key={achievement.title} empty />;
                })}
                <Achievements empty />
                <Achievements empty />
              </div>
            </div>
            <div className={styles.lessonsContainer}>
              <h4 className={styles.title}>Lessons Completed</h4>
              {loadError && <p className={styles.lesson}>{loadError}</p>}
              <div className={styles.lessons}>
                {lessons.map((lesson) => (
                  <div key={lesson.lessonKey} className={styles.lessonContainer}>
                    <p className={styles.lesson}>{lesson.lessonTitle}</p>
                    <ProgressBarComponent progress={lesson.progressPercent} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default Dashboard;
