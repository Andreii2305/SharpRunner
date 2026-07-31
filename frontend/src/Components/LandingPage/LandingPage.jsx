import Header from "../Header/Header.jsx";
import HeroSection from "../HeroSection/HeroSection.jsx";
import FeaturesSection from "../FeatureSection/FeatureSection.jsx";
import ProductShowcase from "../ProductShowcase/ProductShowcase.jsx";
import HowItWorks from "../HowItWorks/HowItWorks.jsx";
import Footer from "../Footer/Footer.jsx";
import { Link } from "react-router-dom";
import { getHomeRouteForCurrentUser, isAuthenticated } from "../../utils/auth.js";
import styles from "./LandingPage.module.css";

const benefits = [
  {
    title: "Interactive coding challenges",
    description: "Learn by solving level objectives.",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m8 9-3 3 3 3m8-6 3 3-3 3m-2-9-4 12" />
      </svg>
    ),
  },
  {
    title: "Instant code feedback",
    description: "Run solutions and see the result.",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m13 2-8 12h7l-1 8 8-12h-7l1-8Z" />
      </svg>
    ),
  },
  {
    title: "Classroom progress tracking",
    description: "Keep learning progress visible.",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 20V10m6 10V4m6 16v-7m4 7H2" />
      </svg>
    ),
  },
];

function LandingPage() {
  const startRoute = isAuthenticated() ? getHomeRouteForCurrentUser() : "/signup";
  const joinRoute = isAuthenticated() ? "/join-class" : "/login";

  return (
    <div className={styles.landingPage}>
      <Header pageType="landingPage" />
      <main>
        <HeroSection />

        <section className={styles.benefitStrip} aria-label="SharpRunner benefits">
          <div className={styles.benefitGrid}>
            {benefits.map((benefit) => (
              <article className={styles.benefitItem} key={benefit.title}>
                <span className={styles.benefitIcon}>{benefit.icon}</span>
                <span>
                  <strong>{benefit.title}</strong>
                  <small>{benefit.description}</small>
                </span>
              </article>
            ))}
          </div>
        </section>

        <FeaturesSection />
        <ProductShowcase />
        <HowItWorks />

        <section className={styles.finalCta} aria-labelledby="final-cta-title">
          <div className={styles.finalCtaInner}>
            <div>
              <span className={styles.eyebrow}>Begin your next level</span>
              <h2 id="final-cta-title">
                Ready to Make Programming More Interactive?
              </h2>
              <p>
                Start exploring SharpRunner&apos;s C# lessons and platforming
                challenges.
              </p>
            </div>
            <div className={styles.ctaActions}>
              <Link className={styles.primaryAction} to={startRoute}>
                Start Learning
              </Link>
              <Link className={styles.secondaryAction} to={joinRoute}>
                Join a Classroom
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

export default LandingPage;
