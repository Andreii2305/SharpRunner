import Card from "../Card/Card.jsx";
import gamifiedLearningImage from "../../assets/gamified-learning.png";
import analytics from "../../assets/Analytics.png";
import computer from "../../assets/Computer.png";
import performance from "../../assets/performance.png";
import styles from "./FeatureSection.module.css";

function FeaturesSection() {
  return (
    <div id="featureSection" className={styles.featuresContainer}>
      <h1>Features</h1>
      <div className={styles.featuresSection}>
        <Card
          title="Gamified Learning"
          description="Experience coding lessons as inactive game levels designed to make Java concept fun and easy to understand."
          imageSrc={gamifiedLearningImage}
          altText="gamified-learning"
          bgColor="#FFD166"
        />

        <Card
          title="Teacher Dashboard"
          description="Track student progress, classroom activities, and performance through an intuitive management dashboard."
          imageSrc={analytics}
          altText="teacher-dash"
          bgColor="#06D6A0"
        />

        <Card
          title="Code Execution Engine"
          description="Test your Java code instantly within the platform using a built-in compiler with real-time feedback."
          imageSrc={computer}
          altText="code-execution-engine"
          bgColor="#EF476F"
        />

        <Card
          title="Performance Analytics"
          description="Measure learning outcomes and identify challenging topics through detailed analytics and reports."
          imageSrc={performance}
          altText="performance-analytics"
          bgColor="#26547C"
        />
      </div>
    </div>
  );
}

export default FeaturesSection;
