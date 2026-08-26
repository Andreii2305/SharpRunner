import { useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { buildApiUrl } from "../../utils/auth";
import styles from "./PasswordRecoveryPage.module.css";

const GENERIC_MESSAGE =
  "If an account exists for that email, password reset instructions have been sent.";

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (isSending) return;
    setIsSending(true);
    setError("");

    try {
      const response = await axios.post(buildApiUrl("/api/auth/forgot-password"), {
        email: email.trim(),
      });
      setMessage(response.data?.message || GENERIC_MESSAGE);
    } catch (requestError) {
      if (requestError.response?.status === 429) {
        setError(requestError.response.data?.message || "Please wait before trying again.");
      } else {
        setError("We could not process the request right now. Please try again later.");
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="forgot-password-title">
        <Link to="/" className={styles.brand}>SharpRunner</Link>
        <div className={styles.icon} aria-hidden="true">?</div>
        <h1 id="forgot-password-title">Forgot your password?</h1>
        <p className={styles.message}>
          Enter the email associated with your SharpRunner account. We&apos;ll send you a secure password reset link.
        </p>

        {message ? (
          <div className={styles.notice} role="status">{message}</div>
        ) : (
          <form className={styles.form} onSubmit={submit}>
            <label htmlFor="forgot-email">Email address</label>
            <input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              autoFocus
            />
            {error && <p className={styles.error} role="alert">{error}</p>}
            <button type="submit" disabled={isSending}>
              {isSending ? "Sending..." : "Send Reset Link"}
            </button>
          </form>
        )}

        <div className={styles.footer}>
          <Link to="/login">← Back to Login</Link>
        </div>
      </section>
    </main>
  );
}

export default ForgotPasswordPage;
