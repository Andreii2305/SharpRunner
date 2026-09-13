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

          <div className={styles.agreementGroup}>
            <div className={styles.checkboxRow}>
              <input
                id="requiredAgreement"
                type="checkbox"
                name="requiredAgreement"
                checked={formData.requiredAgreement}
                onChange={handleChange}
                required
              />
              <div>
                <label htmlFor="requiredAgreement">I have read and agree to the </label>
                <Link to="/terms" target="_blank" rel="noreferrer">Terms &amp; Conditions<span className={styles.srOnly}> (opens in a new tab)</span></Link>
                <span> and acknowledge the </span>
                <Link to="/privacy-policy" target="_blank" rel="noreferrer">Privacy Policy<span className={styles.srOnly}> (opens in a new tab)</span></Link>
                <span>.</span>
              </div>
            </div>
          </div>

          <fieldset className={styles.researchGroup}>
            <legend>Optional research participation</legend>
            <div className={styles.checkboxRow}>
              <input
                id="researchConsent"
                type="checkbox"
                name="researchConsent"
                checked={formData.researchConsent}
                onChange={handleChange}
              />
              <label htmlFor="researchConsent">I voluntarily consent to the use of my de-identified learning activity and learning-preference data for academic research and evaluation of SharpRunner.</label>
            </div>
            <p>This is optional. Declining does not affect account creation or normal SharpRunner features.</p>
          </fieldset>

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
        <p className={styles.googlePolicyNotice}>New Google users review the same required Terms and Privacy notice before entering SharpRunner.</p>
      </div>
    </div>
  );
}

export default SignUpComp;
