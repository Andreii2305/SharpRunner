import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { buildApiUrl } from "../../utils/auth";
import styles from "./DeveloperPage.module.css";

const DEV_TOKEN_STORAGE_KEY = "sr_developer_token";

const formatDateTime = (value) => {
  if (!value) {
    return "N/A";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "N/A";
  }

  return date.toLocaleString();
};

function DeveloperPage() {
  const [setupKey, setSetupKey] = useState("");
  const [developerToken, setDeveloperToken] = useState(
    () => localStorage.getItem(DEV_TOKEN_STORAGE_KEY) ?? ""
  );
  const [invitedEmail, setInvitedEmail] = useState("");
  const [expiresInHours, setExpiresInHours] = useState("72");
  const [generatedInvite, setGeneratedInvite] = useState(null);
  const [inviteRows, setInviteRows] = useState([]);
  const [activeInviteCount, setActiveInviteCount] = useState(0);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isGeneratingInvite, setIsGeneratingInvite] = useState(false);
  const [isLoadingInvites, setIsLoadingInvites] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const developerHeaders = useMemo(
    () => ({
      Authorization: `Bearer ${developerToken}`,
    }),
    [developerToken]
  );

  const loadInvites = useCallback(async () => {
    if (!developerToken) {
      return;
    }

    setIsLoadingInvites(true);
    setErrorMessage("");

    try {
      const [invitesResponse, countResponse] = await Promise.all([
        axios.get(buildApiUrl("/api/developer/admin-invites?limit=20"), {
          headers: developerHeaders,
        }),
        axios.get(buildApiUrl("/api/developer/admin-invites/active/count"), {
          headers: developerHeaders,
        }),
      ]);

      setInviteRows(invitesResponse.data?.invites ?? []);
      setActiveInviteCount(countResponse.data?.activeCount ?? 0);
    } catch (error) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        localStorage.removeItem(DEV_TOKEN_STORAGE_KEY);
        setDeveloperToken("");
        setInviteRows([]);
        setActiveInviteCount(0);
        setErrorMessage("Developer session expired. Enter setup key again.");
      } else {
        setErrorMessage(
          error.response?.data?.message ?? "Unable to load invite history."
        );
      }
    } finally {
      setIsLoadingInvites(false);
    }
  }, [developerHeaders, developerToken]);

  useEffect(() => {
    loadInvites();
  }, [loadInvites]);

  const onDeveloperLogin = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setGeneratedInvite(null);
    setIsAuthenticating(true);

    try {
      const response = await axios.post(buildApiUrl("/api/developer/login"), {
        setupKey: setupKey.trim(),
      });

      const token = response.data?.token;
      if (!token) {
        throw new Error("No developer token returned");
      }

      setDeveloperToken(token);
      localStorage.setItem(DEV_TOKEN_STORAGE_KEY, token);
      setSuccessMessage("Developer session started.");
      setSetupKey("");
    } catch (error) {
      setErrorMessage(error.response?.data?.message ?? "Developer login failed.");
    } finally {
      setIsAuthenticating(false);
    }
  };

  const onGenerateInvite = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setGeneratedInvite(null);
    setIsGeneratingInvite(true);

    try {
      const response = await axios.post(
        buildApiUrl("/api/developer/admin-invites"),
        {
          invitedEmail: invitedEmail.trim(),
          expiresInHours: expiresInHours.trim(),
        },
        { headers: developerHeaders }
      );

      const invite = response.data?.invite ?? null;
      setGeneratedInvite(invite);
      setSuccessMessage(response.data?.message ?? "Invite code generated.");
      await loadInvites();
    } catch (error) {
      setErrorMessage(
        error.response?.data?.message ?? "Failed to generate invite code."
      );
    } finally {
      setIsGeneratingInvite(false);
    }
  };

  const onCopyInviteCode = async () => {
    if (!generatedInvite?.inviteCode) {
      return;
    }

    try {
      await navigator.clipboard.writeText(generatedInvite.inviteCode);
      setSuccessMessage("Invite code copied.");
    } catch {
      setErrorMessage("Unable to copy invite code automatically.");
    }
  };

  const onSignOutDeveloper = () => {
    localStorage.removeItem(DEV_TOKEN_STORAGE_KEY);
    setDeveloperToken("");
    setInviteRows([]);
    setGeneratedInvite(null);
    setSuccessMessage("Developer session cleared.");
    setErrorMessage("");
  };

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <header className={styles.header}>
          <div>
            <h1>Developer Tools</h1>
            <p>Generate secure admin invite codes for account creation.</p>
          </div>
          <div className={styles.headerLinks}>
            <Link to="/login">Back to Login</Link>
            <Link to="/admin-invite">Open Admin Invite Signup</Link>
          </div>
        </header>

        {!developerToken ? (
          <form className={styles.form} onSubmit={onDeveloperLogin}>
            <h2>Developer Access</h2>
            <label htmlFor="setupKey">Developer Setup Key</label>
            <input
              id="setupKey"
              type="password"
              value={setupKey}
              onChange={(event) => setSetupKey(event.target.value)}
              placeholder="Enter DEVELOPER_SETUP_KEY"
              autoComplete="off"
              required
            />
            <button type="submit" disabled={isAuthenticating}>
              {isAuthenticating ? "Validating..." : "Unlock Developer Tools"}
            </button>
          </form>
        ) : (
          <>
            <div className={styles.toolbar}>
              <p>
                Active Invites: <strong>{activeInviteCount}</strong>
              </p>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={onSignOutDeveloper}
              >
                End Developer Session
              </button>
            </div>

            <form className={styles.form} onSubmit={onGenerateInvite}>
              <h2>Generate Admin Invite</h2>
              <label htmlFor="invitedEmail">Admin Email (Optional)</label>
              <input
                id="invitedEmail"
                type="email"
                value={invitedEmail}
                onChange={(event) => setInvitedEmail(event.target.value)}
                placeholder="admin@example.com"
                autoComplete="off"
              />

              <label htmlFor="expiresInHours">Expiry (Hours)</label>
              <input
                id="expiresInHours"
                type="number"
                min={1}
                max={720}
                value={expiresInHours}
                onChange={(event) => setExpiresInHours(event.target.value)}
              />

              <button type="submit" disabled={isGeneratingInvite}>
                {isGeneratingInvite ? "Generating..." : "Generate Invite Code"}
              </button>
            </form>

            {generatedInvite ? (
              <section className={styles.generatedCard}>
                <p className={styles.generatedLabel}>Generated Invite Code</p>
                <p className={styles.generatedCode}>{generatedInvite.inviteCode}</p>
                <p className={styles.generatedMeta}>
                  Expires: {formatDateTime(generatedInvite.expiresAt)}
                </p>
                <div className={styles.generatedActions}>
                  <button type="button" onClick={onCopyInviteCode}>
                    Copy Code
                  </button>
                  <Link to="/admin-invite" className={styles.linkButton}>
                    Go to Admin Signup
                  </Link>
                </div>
              </section>
            ) : null}

            <section className={styles.inviteHistory}>
              <h2>Recent Invites</h2>
              {isLoadingInvites ? (
                <p className={styles.muted}>Loading invites...</p>
              ) : inviteRows.length === 0 ? (
                <p className={styles.muted}>No invites created yet.</p>
              ) : (
                <div className={styles.tableWrap}>
                  <table>
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Email</th>
                        <th>Status</th>
                        <th>Expires</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inviteRows.map((invite) => (
                        <tr key={invite.id}>
                          <td>{invite.inviteCode}</td>
                          <td>{invite.invitedEmail || "-"}</td>
                          <td>{invite.status}</td>
                          <td>{formatDateTime(invite.expiresAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {successMessage ? <p className={styles.success}>{successMessage}</p> : null}
        {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}
      </section>
    </main>
  );
}

export default DeveloperPage;
