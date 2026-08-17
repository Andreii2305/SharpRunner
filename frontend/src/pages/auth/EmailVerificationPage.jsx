import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Link, useSearchParams } from "react-router-dom";
import { buildApiUrl } from "../../utils/auth";
import useResendCooldown from "../../hooks/useResendCooldown";
import styles from "./EmailVerificationPage.module.css";

function EmailVerificationPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const emailFromSignup = searchParams.get("email") || "";
  const [email, setEmail] = useState(emailFromSignup);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState(token ? "verifying" : "waiting");
  const [message, setMessage] = useState(
    searchParams.get("sent") === "1"
      ? "Enter the six-digit code below to activate your account."
      : "Enter the code from your email, or request a new one.",
  );
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const { secondsRemaining, startCooldown } = useResendCooldown(
    searchParams.get("sent") === "1",
  );
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

  const verifyCode = async (event) => {
    event.preventDefault();
    if (!email.trim() || code.length !== 6) return;
    setIsVerifyingCode(true);

    try {
      const response = await axios.post(
        buildApiUrl("/api/auth/verify-email-code"),
        { email: email.trim(), code },
      );
      setStatus("success");
      setMessage(response.data.message);
    } catch (error) {
      setStatus("error");
      setMessage(
        error.response?.data?.message || "We could not verify that code.",
      );
    } finally {
      setIsVerifyingCode(false);
    }
  };

  const resend = async (event) => {
    event.preventDefault();
    if (!email.trim()) return;
    setIsResending(true);

    try {
      const response = await axios.post(
        buildApiUrl("/api/auth/resend-verification"),
        { email: email.trim() },
      );
      setCode("");
      setStatus("waiting");
      setMessage(response.data.message);
      startCooldown();
    } catch (error) {
      if (error.response?.status === 429) {
        startCooldown(
          error.response.data?.retryAfter || error.response.headers?.["retry-after"],
        );
      }
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
          <form onSubmit={verifyCode} className={styles.form}>
            {emailFromSignup ? (
              <div className={styles.emailSummary}>
                <span>Code sent to</span>
                <strong>{email}</strong>
              </div>
            ) : (
              <>
                <label htmlFor="verification-email">Email address</label>
                <input
                  id="verification-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
              </>
            )}
            <label htmlFor="verification-code">Six-digit code</label>
            <input
              id="verification-code"
              className={styles.codeInput}
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              autoComplete="one-time-code"
              placeholder="000000"
              required
            />
            <button
              type="submit"
              disabled={isVerifyingCode || code.length !== 6}
            >
              {isVerifyingCode ? "Verifying..." : "Verify code"}
            </button>
            <div className={styles.divider}><span>Didn’t receive a code?</span></div>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={resend}
              disabled={isResending || secondsRemaining > 0 || !email.trim()}
            >
              {isResending
                ? "Sending..."
                : secondsRemaining > 0
                  ? `Send a new code (${secondsRemaining}s)`
                  : "Send a new code"}
            </button>
          </form>
        )}

        <div className={styles.footer}>
          <Link to="/login">Back to sign in</Link>
          {status !== "success" && <span>Codes expire after 30 minutes.</span>}
        </div>
      </section>
    </main>
  );
}

export default EmailVerificationPage;
