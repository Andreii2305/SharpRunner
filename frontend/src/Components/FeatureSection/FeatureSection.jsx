import styles from "./FeatureSection.module.css";

const features = [
  {
    title: "Learn Through Gameplay",
    description:
      "Turn programming exercises into interactive platforming challenges with clear level goals.",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 8H6a4 4 0 0 0-4 4v3a3 3 0 0 0 5.2 2l1.3-1.5h7L16.8 17a3 3 0 0 0 5.2-2v-3a4 4 0 0 0-4-4h-2M8 12H5m1.5-1.5v3M17 11h.01M19 13h.01M9 5h6" />
      </svg>
    ),
  },
  {
    title: "Write and Run Real C# Code",
    description:
      "Practice variables, arrays, and methods, then immediately observe the result inside a level.",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m8 9-3 3 3 3m8-6 3 3-3 3m-2-9-4 12" />
      </svg>
    ),
  },
  {
    title: "Track Student Progress",
    description:
      "Help teachers understand lesson completion, performance, and student development.",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 19V9m5 10V5m5 14v-7m5 7V8M2 21h20" />
      </svg>
    ),
  },
  {
    title: "Manage Virtual Classrooms",
    description:
      "Organize learners, share classroom codes, and guide students through the curriculum.",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87m0-11.26a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
];

function FeaturesSection() {
  return (
    <section
      id="featureSection"
      className={styles.featuresSection}
      aria-labelledby="features-title"
    >
      <div className={styles.sectionInner}>
        <div className={styles.sectionHeading}>
          <span>Everything you need to begin</span>
          <h2 id="features-title">A more active way to learn programming</h2>
          <p>
            SharpRunner connects focused C# practice with gameplay and practical
            classroom tools.
          </p>
        </div>
        <div className={styles.featureGrid}>
          {features.map((feature, index) => (
            <article className={styles.featureCard} key={feature.title}>
              <div className={styles.cardNumber}>0{index + 1}</div>
              <div className={styles.iconWrap}>{feature.icon}</div>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default FeaturesSection;
