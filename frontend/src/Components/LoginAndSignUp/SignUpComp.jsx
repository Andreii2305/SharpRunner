import React from "react";
import styles from "./login.module.css";
import { Link } from "react-router-dom";

function SignUpComp({ user, formData, handleChange, handleSubmit }) {
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
        <form onSubmit={handleSubmit} className={styles.loginForm}>
          <div className={styles.inputGroup}>
            <input
              type="text"
              name="firstName"
              placeholder="First name"
              value={formData.firstName}
              onChange={handleChange}
            />
          </div>
          <div className={styles.inputGroup}>
            <input
              type="text"
              name="lastName"
              placeholder="Last name"
              value={formData.lastName}
              onChange={handleChange}
            />
          </div>
          <div className={styles.inputGroup}>
            <input
              type="text"
              name="username"
              placeholder="Username"
              value={formData.username}
              onChange={handleChange}
            />
          </div>

          <div className={styles.inputGroup}>
            <input
              type="email"
              name="email"
              placeholder="Email"
              value={formData.email}
              onChange={handleChange}
            />
          </div>

          <div className={styles.inputGroup}>
            <input
              type="password"
              name="password"
              placeholder="Password (min 6 characters)"
              value={formData.password}
              onChange={handleChange}
            />
          </div>

          <div className={styles.inputGroup}>
            <input
              type="password"
              name="confirmPassword"
              placeholder="Confirm Password"
              value={formData.confirmPassword}
              onChange={handleChange}
            />
          </div>

          <button type="submit" className={styles.loginBtn}>
            Sign Up
          </button>

          <div className={styles.formFooter}>
            <span className={styles.signupText}>
              Already have an account? <Link to="/login">Sign In</Link>
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}

export default SignUpComp;
