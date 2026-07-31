import styles from "./HeroSection.module.css";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getHomeRouteForCurrentUser, isAuthenticated } from "../../utils/auth";
import heroGameplayVideo from "../../assets/landing/hero-gameplay.mp4";
import heroGameplayPoster from "../../assets/landing/hero-gameplay.png";

function HeroSection() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );
  const loggedIn = isAuthenticated();
  const startRoute = loggedIn ? getHomeRouteForCurrentUser() : "/signup";
  const joinRoute = loggedIn ? "/join-class" : "/login";

  useEffect(() => {
    const motionPreference = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    const updateMotionPreference = (event) =>
      setPrefersReducedMotion(event.matches);

    motionPreference.addEventListener("change", updateMotionPreference);
    return () =>
      motionPreference.removeEventListener("change", updateMotionPreference);
  }, []);

  return (
    <section id="heroSection" className={styles.heroSection}>
      <div className={styles.heroInner}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>
            <span aria-hidden="true">✦</span> Interactive C# Learning Platform
          </span>
          <h1>Learn C# by Coding Your Way Through an Adventure</h1>
          <p>
            SharpRunner helps beginners understand programming through
            interactive lessons, platforming challenges, instant code feedback,
            and classroom progress tracking.
          </p>
          <div className={styles.buttons}>
            <Link className={styles.primaryButton} to={startRoute}>
              Start Learning <span aria-hidden="true">→</span>
            </Link>
            <Link className={styles.secondaryButton} to={joinRoute}>
              Join a Classroom
            </Link>
          </div>
          <p className={styles.helperText}>
            Built for beginner students and the teachers guiding them.
          </p>
        </div>

        <div className={styles.heroVisual}>
          <div className={styles.windowBar}>
            <span />
            <span />
            <span />
            <strong>First Compile Trial</strong>
          </div>
          <div className={styles.videoFrame}>
            {prefersReducedMotion ? (
              <img
                src={heroGameplayPoster}
                width="1026"
                height="572"
                className={styles.heroMedia}
                alt="SharpRunner gameplay level with a character navigating toward a glowing portal"
              />
            ) : (
              <video
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                poster={heroGameplayPoster}
                width="1026"
                height="572"
                className={styles.heroMedia}
                aria-label="SharpRunner gameplay demonstration"
              >
                <source src={heroGameplayVideo} type="video/mp4" />
                Your browser does not support embedded video.
              </video>
            )}
          </div>
          <div className={styles.visualStatus}>
            <span className={styles.statusDot} />
            Write C# code. Run it. Watch the level respond.
          </div>
        </div>
      </div>
    </section>
  );
}

export default HeroSection;
