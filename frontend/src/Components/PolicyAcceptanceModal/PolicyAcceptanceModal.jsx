import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import { buildApiUrl, clearToken, getAuthHeaders } from "../../utils/auth.js";
import styles from "./PolicyAcceptanceModal.module.css";

const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled])";

export default function PolicyAcceptanceModal({ initialResearchConsent = false, onAccepted }) {
  const navigate = useNavigate();
  const dialogRef = useRef(null);
  const checkboxRef = useRef(null);
  const [confirmed, setConfirmed] = useState(false);
  const [researchConsent, setResearchConsent] = useState(initialResearchConsent);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    checkboxRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll(FOCUSABLE) ?? [])];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, []);

  const accept = async () => {
    if (!confirmed || saving) return;
    setSaving(true);
    setError("");
    try {
      const { data } = await axios.put(
        buildApiUrl("/api/auth/me/policy-acceptance"),
        { acceptTerms: true, acknowledgePrivacy: true, researchConsent },
        { headers: getAuthHeaders() },
      );
      onAccepted(data.policyStatus, data.researchConsent);
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Unable to record your acceptance. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const logout = () => {
    clearToken();
    navigate("/login", { replace: true });
  };

  return createPortal(
    <div className={styles.backdrop} onMouseDown={(event) => {
      if (event.target === event.currentTarget) event.preventDefault();
    }}>
      <section
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="policy-update-title"
        aria-describedby="policy-update-description"
      >
        <div className={styles.content}>
          <span className={styles.eyebrow}>Action required</span>
          <h1 id="policy-update-title">Updated Terms &amp; Privacy Notice</h1>
          <p id="policy-update-description">We&apos;ve updated SharpRunner&apos;s Terms &amp; Conditions and Privacy Policy. Please review them before continuing.</p>
          <div className={styles.documentLinks}>
            <Link to="/terms" target="_blank" rel="noreferrer">View Terms &amp; Conditions <span className={styles.srOnly}>(opens in a new tab)</span></Link>
            <Link to="/privacy-policy" target="_blank" rel="noreferrer">View Privacy Policy <span className={styles.srOnly}>(opens in a new tab)</span></Link>
          </div>
          <div className={styles.confirmation}>
            <input ref={checkboxRef} id="policy-confirmation" type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            <label htmlFor="policy-confirmation">I agree to the current Terms &amp; Conditions and acknowledge the current Privacy Policy.</label>
          </div>
          <fieldset className={styles.researchChoice}>
            <legend>Optional research participation</legend>
            <div>
              <input id="modal-research-consent" type="checkbox" checked={researchConsent} onChange={(event) => setResearchConsent(event.target.checked)} />
              <label htmlFor="modal-research-consent">I voluntarily consent to the use of my de-identified learning activity and learning-preference data for academic research and evaluation of SharpRunner.</label>
            </div>
            <p>Optional. Your choice does not affect normal SharpRunner access or features.</p>
          </fieldset>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.logout} onClick={logout} disabled={saving}>Log Out</button>
          <button type="button" className={styles.accept} onClick={accept} disabled={!confirmed || saving}>{saving ? "Recording..." : "Accept and Continue"}</button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
