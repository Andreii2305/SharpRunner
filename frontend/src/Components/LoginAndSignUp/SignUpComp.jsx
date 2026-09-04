import React, { useState } from "react";
import styles from "./login.module.css";
import { FaGoogle } from "react-icons/fa";
import { FiEye, FiEyeOff } from "react-icons/fi";
import { Link } from "react-router-dom";

function SignUpComp({
  user,
  formData,
  handleChange,
  handleSubmit,
  onGoogleLogin,
  isSubmitting,
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  return (
    <div className={styles.loginContainer}>
      {/* Brand Logo */}
      <div className={styles.brandLogo}>
        <Link to="/" className={styles.brandLogoLink}>
          SharpRunner
        </Link>
      </div>

      <div className={styles.loginContent}>
        {/* Main Header */}
        <h1 className={styles.welcomeText}>Welcome,</h1>
        <h2 className={styles.subHeader}>{user}</h2>

        {/* Separator */}
        <div className={styles.separator}>
          <span>Student Sign Up</span>
        </div>
        <p className={styles.signupNotice}>
          Teacher and admin accounts are created by system administrators.
        </p>

        {/* Sign Up Form */}
        <form
          onSubmit={handleSubmit}
          className={styles.loginForm}
          aria-busy={isSubmitting}
        >
          <div className={styles.inputGroup}>
            <input
              type="text"
              name="firstName"
              placeholder="First name"
              value={formData.firstName}
              onChange={handleChange}
              autoComplete="given-name"
              required
            />
          </div>
          <div className={styles.inputGroup}>
            <input
              type="text"
              name="lastName"
              placeholder="Last name"
              value={formData.lastName}
              onChange={handleChange}
              autoComplete="family-name"
              required
            />
          </div>
          <div className={styles.inputGroup}>
            <input
              type="text"
              name="username"
              placeholder="Username"
              value={formData.username}
              onChange={handleChange}
              autoComplete="username"
              required
            />
          </div>

          <div className={styles.inputGroup}>
            <input
              type="email"
              name="email"
              placeholder="Email"
              value={formData.email}
              onChange={handleChange}
              autoComplete="email"
              required
            />
          </div>

          <div className={`${styles.inputGroup} ${styles.passwordField}`}>
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              placeholder="Password (min 6 characters)"
              value={formData.password}
              onChange={handleChange}
              autoComplete="new-password"
              minLength={6}
              required
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

          <div className={`${styles.inputGroup} ${styles.passwordField}`}>
            <input
              type={showConfirmPassword ? "text" : "password"}
              name="confirmPassword"
              placeholder="Confirm Password"
              value={formData.confirmPassword}
              onChange={handleChange}
              autoComplete="new-password"
              minLength={6}
              required
            />
            <button
              type="button"
              className={styles.passwordToggle}
              onClick={() => setShowConfirmPassword((visible) => !visible)}
              aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
              aria-pressed={showConfirmPassword}
              title={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
            >
              {showConfirmPassword ? <FiEyeOff /> : <FiEye />}
            </button>
          </div>

          <button
            type="submit"
            className={styles.loginBtn}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Creating account..." : "Sign Up"}
          </button>

          <div className={styles.formFooter}>
            <span className={styles.signupText}>
              Already have an account? <Link to="/login">Sign In</Link>
            </span>
          </div>
        </form>
        <div className={styles.socialSeparator}>
          <span>or sign up with</span>
        </div>

        <div className={styles.socialIcons}>
          <button
            type="button"
            className={`${styles.socialBtn} ${styles.google}`}
            onClick={onGoogleLogin}
            disabled={isSubmitting}
          >
            <FaGoogle />
          </button>
        </div>
      </div>
    </div>
  );
}

export default SignUpComp;
