import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useLocation, useNavigate } from "react-router-dom";
import {
  buildApiUrl,
  getAuthHeaders,
} from "../../utils/auth";
import styles from "./JoinClassPage.module.css";

const normalizeClassCode = (value) =>
  (typeof value === "string" ? value : "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

function JoinClassPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [classCode, setClassCode] = useState("");
  const [isCheckingMembership, setIsCheckingMembership] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const redirectTo = useMemo(() => {
    const fromPath = location.state?.from;
    return typeof fromPath === "string" && fromPath.startsWith("/")
      ? fromPath
      : "/dashboard";
  }, [location.state]);

  useEffect(() => {
    let isMounted = true;

    const fetchMembership = async () => {
      try {
        const response = await axios.get(buildApiUrl("/api/classrooms/me"), {
          headers: getAuthHeaders(),
        });

        if (!isMounted) {
          return;
        }

        if (response.data?.hasActiveMembership) {
          navigate("/dashboard", { replace: true });
          return;
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setErrorMessage(
          error.response?.data?.message ?? "Unable to verify classroom membership."
        );
      } finally {
        if (isMounted) {
          setIsCheckingMembership(false);
        }
      }
    };

    fetchMembership();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  const onSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    const normalizedCode = normalizeClassCode(classCode);
    if (!normalizedCode) {
      setErrorMessage("Enter your class code.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await axios.post(
        buildApiUrl("/api/classrooms/join"),
        { classCode: normalizedCode },
        { headers: getAuthHeaders() }
      );

      setSuccessMessage(
        response.data?.message ?? "Joined classroom successfully."
      );

      window.setTimeout(() => {
        navigate(redirectTo, { replace: true });
      }, 700);
    } catch (error) {
      setErrorMessage(error.response?.data?.message ?? "Failed to join classroom.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isCheckingMembership) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <h1>Checking your classroom status...</h1>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.badge}>Student Onboarding</p>
        <h1>Join Your Class</h1>
        <p className={styles.description}>
          Enter the class code shared by your teacher to unlock dashboard,
          map, and game progress.
        </p>

        <form className={styles.form} onSubmit={onSubmit}>
          <label htmlFor="classCode">Class Code</label>
          <input
            id="classCode"
            name="classCode"
            type="text"
            value={classCode}
            onChange={(event) => setClassCode(event.target.value)}
            placeholder="Example: NASDAQ"
            maxLength={12}
            autoComplete="off"
          />

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Joining..." : "Join Class"}
          </button>
        </form>

        {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}
        {successMessage ? <p className={styles.success}>{successMessage}</p> : null}
      </section>
    </main>
  );
}

export default JoinClassPage;
