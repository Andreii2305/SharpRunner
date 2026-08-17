import { useState } from "react";
import axios from "axios";
import { Link, useSearchParams } from "react-router-dom";
import { buildApiUrl } from "../../utils/auth";
import useResendCooldown from "../../hooks/useResendCooldown";
import styles from "./AdminInviteRegisterPage.module.css";

function AdminEmailVerificationPage() {
  const [searchParams] = useSearchParams();
  const emailFromInvite = searchParams.get("email") || "";
  const [email, setEmail] = useState(emailFromInvite);
  const [code, setCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const { secondsRemaining, startCooldown } = useResendCooldown(
    searchParams.get("sent") === "1",
  );
  const [isVerified, setIsVerified] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState(
    searchParams.get("sent") === "1"
      ? "A six-digit admin verification code was sent to your email."
      : "Enter the latest six-digit code sent to your email.",
  );

  const verifyCode = async (event) => {
    event.preventDefault();
    if (!email.trim() || code.length !== 6 || isVerifying) return;

    setErrorMessage("");
    setIsVerifying(true);
    try {
      const response = await axios.post(
        buildApiUrl("/api/auth/verify-email-code"),
        { email: email.trim(), code },
      );
      setIsVerified(true);
      setNotice(response.data.message);
    } catch (error) {
      setErrorMessage(
        error.response?.data?.message || "Unable to verify this code.",
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const resendCode = async () => {
    if (!email.trim() || isResending) return;

    setErrorMessage("");
    setIsResending(true);
    try {
      const response = await axios.post(
        buildApiUrl("/api/auth/resend-verification"),
        { email: email.trim() },
      );
      setCode("");
      setNotice(response.data.message);
      startCooldown();
    } catch (error) {
      if (error.response?.status === 429) {
        startCooldown(
          error.response.data?.retryAfter || error.response.headers?.["retry-after"],
        );
      }
      setErrorMessage(error.response?.data?.message || "Unable to send a new code.");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <header>
          <h1>Verify Admin Email</h1>
          <p>{notice}</p>
        </header>

        {isVerified ? (
          <div className={styles.verifiedPanel}>
            <p className={styles.success}>Admin email verified successfully.</p>
            <Link className={styles.primaryLink} to="/login">
              Continue to Admin Login
            </Link>
          </div>
        ) : (
          <form className={styles.form} onSubmit={verifyCode}>
            {emailFromInvite ? (
              <div className={styles.emailSummary}>
                <span>Code sent to</span>
                <strong>{email}</strong>
              </div>
            ) : (
              <>
                <label htmlFor="adminVerificationEmail">Email</label>
                <input
                  id="adminVerificationEmail"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
              </>
            )}

            <label htmlFor="adminVerificationCode">Verification Code</label>
            <input
              id="adminVerificationCode"
              className={styles.otpInput}
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              autoComplete="one-time-code"
              placeholder="000000"
              autoFocus
              required
            />

            <button type="submit" disabled={isVerifying || code.length !== 6}>
              {isVerifying ? "Verifying..." : "Verify Admin Email"}
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={resendCode}
              disabled={isResending || secondsRemaining > 0 || !email.trim()}
            >
              {isResending
                ? "Sending..."
                : secondsRemaining > 0
                  ? `Send New Code (${secondsRemaining}s)`
                  : "Send New Code"}
            </button>
          </form>
        )}

        {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}

        <footer className={styles.footer}>
          <Link to="/developer">Back to Developer Page</Link>
          <Link to="/login">Back to Login</Link>
        </footer>
      </section>
    </main>
  );
}

export default AdminEmailVerificationPage;
