import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiMail, FiX } from "react-icons/fi";
import styles from "./TeacherInviteModal.module.css";

const INITIAL_FORM = {
  firstName: "",
  lastName: "",
  username: "",
  email: "",
  password: "",
};

export default function TeacherInviteModal({
  isSubmitting,
  errorMessage,
  onInvite,
  onClose,
}) {
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [validationMessage, setValidationMessage] = useState("");
  const firstNameRef = useRef(null);

  useEffect(() => {
    firstNameRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === "Escape" && !isSubmitting) onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isSubmitting, onClose]);

  const onFieldChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
    setValidationMessage("");
  };

  const onSubmit = (event) => {
    event.preventDefault();

    if (!Object.values(formData).every((value) => value.trim())) {
      setValidationMessage("Complete all teacher account fields.");
      return;
    }

    if (formData.password.length < 6) {
      setValidationMessage("The temporary password must have at least 6 characters.");
      return;
    }

    onInvite({
      ...formData,
      firstName: formData.firstName.trim(),
      lastName: formData.lastName.trim(),
      username: formData.username.trim(),
      email: formData.email.trim(),
    });
  };

  return createPortal(
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) onClose();
      }}
    >
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="teacher-invite-title"
      >
        <button
          type="button"
          className={styles.closeButton}
          aria-label="Close teacher invitation"
          onClick={onClose}
          disabled={isSubmitting}
        >
          <FiX size={19} />
        </button>

        <div className={styles.iconWrap}>
          <FiMail size={22} />
        </div>
        <h2 id="teacher-invite-title">Invite a Teacher</h2>
        <p className={styles.description}>
          Create the teacher account and email their login details. A
          six-digit verification code will be sent after their first login.
        </p>

        <form className={styles.form} onSubmit={onSubmit}>
          <div className={styles.nameRow}>
            <label>
              <span>First name</span>
              <input
                ref={firstNameRef}
                type="text"
                name="firstName"
                value={formData.firstName}
                onChange={onFieldChange}
                autoComplete="given-name"
                disabled={isSubmitting}
              />
            </label>
            <label>
              <span>Last name</span>
              <input
                type="text"
                name="lastName"
                value={formData.lastName}
                onChange={onFieldChange}
                autoComplete="family-name"
                disabled={isSubmitting}
              />
            </label>
          </div>

          <label>
            <span>Username</span>
            <input
              type="text"
              name="username"
              value={formData.username}
              onChange={onFieldChange}
              autoComplete="off"
              disabled={isSubmitting}
            />
          </label>

          <label>
            <span>Email address</span>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={onFieldChange}
              placeholder="teacher@gmail.com"
              autoComplete="email"
              disabled={isSubmitting}
            />
          </label>

          <label>
            <span>Temporary password</span>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={onFieldChange}
              minLength={6}
              autoComplete="new-password"
              disabled={isSubmitting}
            />
            <small>This temporary password will be included in the invitation email.</small>
          </label>

          {(validationMessage || errorMessage) && (
            <p className={styles.error} role="alert">
              {validationMessage || errorMessage}
            </p>
          )}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.inviteButton}
              disabled={isSubmitting}
            >
              <FiMail size={15} />
              {isSubmitting ? "Sending invite..." : "Send email invite"}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
}
