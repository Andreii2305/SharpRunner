import React, { useState } from "react";
import styles from "./login.module.css";
import { FaGoogle, FaFacebookF } from "react-icons/fa";
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
          <span>Sign Up</span>
        </div>

        {/* Sign Up Form */}
        <form onSubmit={handleSubmit} className={styles.loginForm}>
          <div className={styles.inputGroup}>
            <input
              type="text"
              name="firstName"
              placeholder="Firstname"
              value={formData.firstname}
              onChange={handleChange}
            />
          </div>
          <div className={styles.inputGroup}>
            <input
              type="text"
              name="lastName"
              placeholder="Lastname"
              value={formData.lastname}
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
              placeholder="Password"
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

        {/* Social Login Section */}
        <div className={styles.socialSeparator}>
          <span>or sign up with</span>
        </div>

        <div className={styles.socialIcons}>
          <button className={`${styles.socialBtn} ${styles.google}`}>
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

export default SignUpComp;
