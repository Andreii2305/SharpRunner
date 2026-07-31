import styles from "./HowItWorks.module.css";

const steps = [
  {
    title: "Join a Classroom",
    description:
      "Students enter a classroom code shared by their teacher to connect with their class.",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm10-4v6m3-3h-6" />
      </svg>
    ),
  },
  {
    title: "Complete Coding Levels",
    description:
      "Follow lesson goals, write C# solutions, and run the code to control the game.",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m8 9-3 3 3 3m8-6 3 3-3 3m-2-9-4 12" />
      </svg>
    ),
  },
  {
    title: "Track Your Progress",
    description:
      "Review completed lessons and performance while teachers monitor class development.",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 20V10m6 10V4m6 16v-7m4 7H2" />
      </svg>
    ),
  },
];

function HowItWorks() {
  return (
    <section
      id="howItWorks"
      className={styles.section}
      aria-labelledby="how-title"
    >
      <div className={styles.sectionInner}>
        <div className={styles.heading}>
          <span>Three simple steps</span>
          <h2 id="how-title">How It Works</h2>
          <p>From joining a class to seeing progress, the learning path stays clear.</p>
        </div>
        <div className={styles.stepsContainer}>
          {steps.map((step, index) => (
            <article className={styles.step} key={step.title}>
              <div className={styles.iconWrap}>{step.icon}</div>
              <span className={styles.stepNumber}>0{index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default HowItWorks;
