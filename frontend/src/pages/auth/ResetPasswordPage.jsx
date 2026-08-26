import { useEffect, useState } from "react";
import axios from "axios";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { buildApiUrl } from "../../utils/auth";
import styles from "./PasswordRecoveryPage.module.css";

const INVALID_LINK_MESSAGE = "This password reset link is invalid or has expired.";

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [token] = useState(() => searchParams.get("token") || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState(token ? "form" : "invalid");
  const [error, setError] = useState(token ? "" : INVALID_LINK_MESSAGE);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    if (token) navigate("/reset-password", { replace: true });
  }, [navigate, token]);

  const submit = async (event) => {
    event.preventDefault();
    if (isResetting) return;
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsResetting(true);
    setError("");
    try {
      await axios.post(buildApiUrl("/api/auth/reset-password"), {
        token,
        password,
        confirmPassword,
      });
      setStatus("success");
      setPassword("");
      setConfirmPassword("");
    } catch (requestError) {
      if (requestError.response?.status === 400) {
        const responseMessage = requestError.response.data?.message || INVALID_LINK_MESSAGE;
        if (responseMessage === INVALID_LINK_MESSAGE) setStatus("invalid");
        setError(responseMessage);
      } else if (requestError.response?.status === 429) {
        setError(requestError.response.data?.message || "Please wait before trying again.");
      } else {
        setError("We could not reset your password right now. Please try again later.");
      }
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="reset-password-title">
        <Link to="/" className={styles.brand}>SharpRunner</Link>
        <div className={styles.icon} aria-hidden="true">{status === "success" ? "✓" : "🔒"}</div>

        {status === "success" ? (
          <>
            <h1 id="reset-password-title">Password reset successful</h1>
            <p className={styles.message}>
              Your password has been changed. You can now sign in with your new password.
            </p>
            <Link className={styles.primaryLink} to="/login">Go to Login</Link>
          </>
        ) : status === "invalid" ? (
          <>
            <h1 id="reset-password-title">Reset link unavailable</h1>
            <p className={styles.error} role="alert">{error || INVALID_LINK_MESSAGE}</p>
            <Link className={styles.primaryLink} to="/forgot-password">Request a new reset link</Link>
          </>
        ) : (
          <>
            <h1 id="reset-password-title">Create a new password</h1>
            <p className={styles.message}>Use at least 8 characters for your new password.</p>
            <form className={styles.form} onSubmit={submit}>
              <label htmlFor="new-password">New password</label>
              <div className={styles.passwordField}>
                <input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                  autoFocus
                />
                <button
                  type="button"
                  className={styles.visibilityButton}
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <label htmlFor="confirm-password">Confirm password</label>
              <input
                id="confirm-password"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
              {error && <p className={styles.error} role="alert">{error}</p>}
              <button type="submit" disabled={isResetting}>
                {isResetting ? "Resetting..." : "Reset Password"}
              </button>
            </form>
            <div className={styles.footer}>
              <Link to="/login">← Back to Login</Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

export default ResetPasswordPage;
