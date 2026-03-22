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
  const [classroomData, setClassroomData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isClassroomLoading, setIsClassroomLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [classroomLoadError, setClassroomLoadError] = useState("");

  const achievements = [
    { title: "Loop Master", badgeSrc: LoopMasterBadge },
    { title: "Syntax Expert", badgeSrc: SyntaxExpertBadge },
    { title: "Quick Coder", badgeSrc: QuickCoderBadge },
  ];

  useEffect(() => {
    let isMounted = true;

    const fetchDashboardData = async () => {
      const authHeaders = { headers: getAuthHeaders() };
      const [progressResult, classroomResult] = await Promise.allSettled([
        axios.get(buildApiUrl("/api/progress/me"), authHeaders),
        axios.get(buildApiUrl("/api/classrooms/me"), authHeaders),
      ]);

      if (!isMounted) {
        return;
      }

      if (progressResult.status === "fulfilled") {
        setProgressData(progressResult.value.data);
      } else {
        setLoadError("Unable to load live progress. Showing local defaults.");
      }

      if (classroomResult.status === "fulfilled") {
        setClassroomData(classroomResult.value.data);
      } else {
        setClassroomLoadError("Unable to load classroom info right now.");
      }

      setIsLoading(false);
      setIsClassroomLoading(false);
    };

    fetchDashboardData();

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
  const joinedClassroom = classroomData?.primaryClassroom ?? null;

  return (
    <div className={styles.dashboardContainer}>
      <Sidebar variant="active" />
      <section className={styles.dashboard}>
        <div className={styles.topRow}>
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

          <div className={styles.classroomCard}>
            {isClassroomLoading ? (
              <p className={styles.classroomFallback}>Loading class...</p>
            ) : joinedClassroom ? (
              <>
                <p className={styles.classroomName}>
                  {joinedClassroom.className}
                </p>
                <p className={styles.classroomMeta}>
                  Section: {joinedClassroom.section || "N/A"}
                </p>
                <p className={styles.classroomMeta}>
                  School Year: {joinedClassroom.schoolYear || "N/A"}
                </p>
                {/*<p className={styles.classroomCode}>
                  Class Code: <span>{joinedClassroom.classCode || "N/A"}</span>
                </p>*/}
              </>
            ) : (
              <>
                <p className={styles.classroomFallback}>
                  You are not enrolled in any class yet.
                </p>
                <Button
                  label="Join Class"
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/join-class")}
                />
              </>
            )}
            {classroomLoadError ? (
              <p className={styles.classroomError}>{classroomLoadError}</p>
            ) : null}
          </div>
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
                  <div
                    key={lesson.lessonKey}
                    className={styles.lessonContainer}
                  >
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
