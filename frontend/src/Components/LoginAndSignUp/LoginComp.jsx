import React, { useState } from "react";
import styles from "./login.module.css";
import { FaGoogle, FaFacebookF } from "react-icons/fa";
import { FiEye, FiEyeOff } from "react-icons/fi";
import { Link } from "react-router-dom";

function LoginComp({ user, formData, handleChange, handleSubmit, onGoogleLogin }) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className={styles.loginContainer}>
      <div className={styles.brandLogo}>
        <Link to="/" className={styles.brandLogoLink}>
          SharpRunner
        </Link>
      </div>

      <div className={styles.loginContent}>
        <h1 className={styles.welcomeText}>Welcome,</h1>
        <h2 className={styles.subHeader}>{user}</h2>

        <div className={styles.separator}>
          <span>Sign In</span>
        </div>

        <form onSubmit={handleSubmit} className={styles.loginForm}>
          <div className={styles.inputGroup}>
            <input
              type="text"
              name="identifier"
              placeholder="Username or Email"
              value={formData.identifier}
              onChange={handleChange}
            />
          </div>

          <div className={`${styles.inputGroup} ${styles.passwordField}`}>
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
              autoComplete="current-password"
            />
            <button
              type="button"
              className={styles.passwordToggle}
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              title={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <FiEyeOff /> : <FiEye />}
            </button>
          </div>

          <button type="submit" className={styles.loginBtn}>
            Login
          </button>

          <div className={styles.formFooter}>
            <Link to="/forgot-password" className={styles.forgotLink}>
              Forgot Password?
            </Link>
            <span className={styles.signupText}>
              Don't have account? <Link to="/signup">Sign Up</Link>
            </span>
          </div>
        </form>

        <div className={styles.socialSeparator}>
          <span>or sign in with</span>
        </div>

        <div className={styles.socialIcons}>
          <button
            type="button"
            className={`${styles.socialBtn} ${styles.google}`}
            onClick={onGoogleLogin}
          >
            <FaGoogle />
          </button>
          <button className={`${styles.socialBtn} ${styles.facebook}`}>
            <FaFacebookF />
          </button>
        </div>
      </div>
    </div>
  );
}

export default LoginComp;
