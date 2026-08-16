import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Link, useSearchParams } from "react-router-dom";
import { buildApiUrl } from "../../utils/auth";
import styles from "./EmailVerificationPage.module.css";

function EmailVerificationPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [status, setStatus] = useState(token ? "verifying" : "waiting");
  const [message, setMessage] = useState(
    searchParams.get("sent") === "1"
      ? "We sent a verification link to your email address."
      : "Enter your email to request a new verification link.",
  );
  const [isResending, setIsResending] = useState(false);
  const verificationStarted = useRef(false);

  useEffect(() => {
    if (!token || verificationStarted.current) return;
    verificationStarted.current = true;

    axios.post(buildApiUrl("/api/auth/verify-email"), { token })
      .then((response) => {
        setStatus("success");
        setMessage(response.data.message);
      })
      .catch((error) => {
        setStatus("error");
        setMessage(
          error.response?.data?.message ||
            "We could not verify this email. Request a new link below.",
        );
      });
  }, [token]);

  const resend = async (event) => {
    event.preventDefault();
    if (!email.trim()) return;
    setIsResending(true);

    try {
      const response = await axios.post(
        buildApiUrl("/api/auth/resend-verification"),
        { email: email.trim() },
      );
      setStatus("waiting");
      setMessage(response.data.message);
    } catch (error) {
      setStatus("error");
      setMessage(error.response?.data?.message || "Please try again later.");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <Link to="/" className={styles.brand}>SharpRunner</Link>
        <div className={styles.icon} aria-hidden="true">✉</div>
        <h1>{status === "success" ? "Email verified" : "Verify your email"}</h1>
        <p className={status === "error" ? styles.error : styles.message}>
          {status === "verifying" ? "Verifying your link..." : message}
        </p>

        {status !== "success" && status !== "verifying" && (
          <form onSubmit={resend} className={styles.form}>
            <label htmlFor="verification-email">Email address</label>
            <input
              id="verification-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
            <button type="submit" disabled={isResending}>
              {isResending ? "Sending..." : "Resend verification email"}
            </button>
          </form>
        )}

        <div className={styles.footer}>
          <Link to="/login">Back to sign in</Link>
          {status !== "success" && <span>Links expire after 30 minutes.</span>}
        </div>
      </section>
    </main>
  );
}

export default EmailVerificationPage;
