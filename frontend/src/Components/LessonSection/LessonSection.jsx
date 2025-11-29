import styles from "./LessonSection.module.css";
import Sidebar from "../SideBar/Sidebar.jsx";
import Header from "../Header/Header.jsx";

function LessonSection() {
  return (
    <div className={styles.lessonPage}>
      <Header />
    </div>
  );
}

export default LessonSection;
