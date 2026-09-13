import { useEffect, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import Header from "../../Components/Header/Header.jsx";
import { buildApiUrl, getAuthHeaders, isAuthenticated } from "../../utils/auth.js";
import styles from "./LegalCenterPage.module.css";

export default function LegalCenterPage() {
  const signedIn = isAuthenticated();
  const [researchConsent, setResearchConsent] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!signedIn) return;
    axios.get(buildApiUrl("/api/auth/me"), { headers: getAuthHeaders() })
      .then(({ data }) => setResearchConsent(data.user?.researchConsent === true))
      .catch((error) => setMessage(error.response?.data?.message ?? "Unable to load research-participation status."))
      .finally(() => setLoaded(true));
  }, [signedIn]);

  const updateResearchConsent = async (event) => {
    const nextValue = event.target.checked;
    setSaving(true);
    setMessage("");
    try {
      const { data } = await axios.put(
        buildApiUrl("/api/auth/me/research-consent"),
        { researchConsent: nextValue },
        { headers: getAuthHeaders() },
      );
      setResearchConsent(data.researchConsent === true);
      setMessage(data.message);
    } catch (error) {
      setMessage(error.response?.data?.message ?? "Unable to update research participation.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.page}>
      <Header />
      <main className={styles.main}>
        <span className={styles.eyebrow}>Account information</span>
        <h1>Legal &amp; Privacy</h1>
        <p className={styles.intro}>Read the documents that govern SharpRunner and manage optional research participation.</p>
        <div className={styles.documentGrid}>
          <article><span>Privacy</span><h2>Privacy Policy</h2><p>Learn what account, classroom, and learning information SharpRunner processes and why.</p><Link to="/privacy-policy">Read Privacy Policy</Link></article>
          <article><span>Terms</span><h2>Terms &amp; Conditions</h2><p>Review the rules for accounts, classrooms, coding activities, academic integrity, and platform use.</p><Link to="/terms">Read Terms &amp; Conditions</Link></article>
        </div>
        {signedIn ? (
          <section className={styles.researchCard}>
            <div><span className={styles.optional}>Optional</span><h2>Research participation</h2><p>Allow your de-identified learning activity and learning-preference data to support academic research and evaluation of SharpRunner. This choice does not affect normal functionality.</p></div>
            <div className={styles.choice}>
              <input id="legalResearchConsent" type="checkbox" checked={researchConsent} disabled={!loaded || saving} onChange={updateResearchConsent} />
              <label htmlFor="legalResearchConsent">Research participation: <strong>{researchConsent ? "Enabled" : "Disabled"}</strong></label>
            </div>
            <p className={styles.note}>Withdrawal applies to future consent-based research use. Information already irreversibly anonymized may no longer be linkable to your account.</p>
            {message ? <p className={styles.message} role="status">{message}</p> : null}
          </section>
        ) : (
          <p className={styles.signInNote}><Link to="/login">Sign in</Link> to view or change your optional research-participation status.</p>
        )}
      </main>
    </div>
  );
}
