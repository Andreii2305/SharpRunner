import { useRef, useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import { buildApiUrl } from "../../utils/auth";
import styles from "./AdminInviteRegisterPage.module.css";

function AdminInviteRegisterPage() {
  const navigate = useNavigate();
  const submittingRef = useRef(false);
  const [formData, setFormData] = useState({
    inviteCode: "",
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    requiredAgreement: false,
    researchConsent: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const onFieldChange = (event) => {
    const { name, value, type, checked } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (submittingRef.current) return;
    setErrorMessage("");
    setSuccessMessage("");

    if (
      !formData.inviteCode.trim() ||
      !formData.firstName.trim() ||
      !formData.lastName.trim() ||
      !formData.username.trim() ||
      !formData.email.trim() ||
      !formData.password
    ) {
      setErrorMessage("All fields are required.");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    if (!formData.requiredAgreement) {
      setErrorMessage("Please agree to the Terms & Conditions and acknowledge the Privacy Policy.");
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);

    try {
      const response = await axios.post(buildApiUrl("/api/auth/register-admin-invite"), {
        inviteCode: formData.inviteCode.trim(),
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        username: formData.username.trim(),
        email: formData.email.trim(),
        password: formData.password,
        acceptTerms: formData.requiredAgreement,
        acknowledgePrivacy: formData.requiredAgreement,
        researchConsent: formData.researchConsent,
      });

      setSuccessMessage(response.data.message);
      navigate(
        `/admin-verify-email?email=${encodeURIComponent(response.data.email)}&sent=1`,
        { replace: true },
      );
    } catch (error) {
      if (error.response?.data?.code === "EMAIL_VERIFICATION_PENDING") {
        const email = error.response.data.email || formData.email;
        navigate(`/admin-verify-email?email=${encodeURIComponent(email)}`);
        return;
      }
      setErrorMessage(
        error.response?.data?.message ?? "Unable to create admin account."
      );
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <header>
          <h1>Create Admin Account</h1>
          <p>Use your developer-issued invite code to register as admin.</p>
        </header>

        <form className={styles.form} onSubmit={onSubmit}>
          <label htmlFor="inviteCode">Invite Code</label>
          <input
            id="inviteCode"
            name="inviteCode"
            value={formData.inviteCode}
            onChange={onFieldChange}
            placeholder="Enter invite code"
            autoComplete="off"
          />

          <div className={styles.row}>
            <div>
              <label htmlFor="firstName">First Name</label>
              <input
                id="firstName"
                name="firstName"
                value={formData.firstName}
                onChange={onFieldChange}
                placeholder="First name"
              />
            </div>
            <div>
              <label htmlFor="lastName">Last Name</label>
              <input
                id="lastName"
                name="lastName"
                value={formData.lastName}
                onChange={onFieldChange}
                placeholder="Last name"
              />
            </div>
          </div>

          <label htmlFor="username">Username</label>
          <input
            id="username"
            name="username"
            value={formData.username}
            onChange={onFieldChange}
            placeholder="Username"
            autoComplete="off"
          />

          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            value={formData.email}
            onChange={onFieldChange}
            placeholder="admin@email.com"
            autoComplete="off"
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            value={formData.password}
            onChange={onFieldChange}
            placeholder="At least 6 characters"
          />

          <label htmlFor="confirmPassword">Confirm Password</label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            value={formData.confirmPassword}
            onChange={onFieldChange}
            placeholder="Confirm password"
          />

          <div className={styles.agreementBox}>
            <input id="adminRequiredAgreement" name="requiredAgreement" type="checkbox" checked={formData.requiredAgreement} onChange={onFieldChange} required />
            <div><label htmlFor="adminRequiredAgreement">I have read and agree to the </label><Link to="/terms" target="_blank" rel="noreferrer">Terms &amp; Conditions</Link><span> and acknowledge the </span><Link to="/privacy-policy" target="_blank" rel="noreferrer">Privacy Policy</Link><span>.</span></div>
          </div>

          <fieldset className={styles.researchBox}>
            <legend>Optional research participation</legend>
            <div><input id="adminResearchConsent" name="researchConsent" type="checkbox" checked={formData.researchConsent} onChange={onFieldChange} /><label htmlFor="adminResearchConsent">I voluntarily consent to the use of my de-identified learning activity and learning-preference data for academic research and evaluation of SharpRunner.</label></div>
            <p>Declining does not affect account creation or normal platform access.</p>
          </fieldset>

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating account..." : "Create Admin Account"}
          </button>
        </form>

        {successMessage ? <p className={styles.success}>{successMessage}</p> : null}
        {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}

        <footer className={styles.footer}>
          <Link to="/developer">Back to Developer Page</Link>
          <Link to="/login">Back to Login</Link>
        </footer>
      </section>
    </main>
  );
}

export default AdminInviteRegisterPage;
