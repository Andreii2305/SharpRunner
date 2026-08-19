import { useEffect, useState } from "react";
import axios from "axios";
import ManageAccountsOutlinedIcon from "@mui/icons-material/ManageAccountsOutlined";
import LockResetOutlinedIcon from "@mui/icons-material/LockResetOutlined";
import Sidebar from "../../Components/SideBar/Sidebar.jsx";
import { buildApiUrl, getAuthHeaders, getUser, setUser } from "../../utils/auth.js";
import { useToast } from "../../Components/Toast/ToastProvider.jsx";
import styles from "./TeacherPage.module.css";
import pageStyles from "./TeacherSettingsPage.module.css";

function TeacherSettingsPage() {
  const toast = useToast();
  const localUser = getUser();
  const [profile, setProfile] = useState({ firstName: localUser?.firstName ?? "", lastName: localUser?.lastName ?? "", username: localUser?.username ?? "", email: localUser?.email ?? "" });
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    axios.get(buildApiUrl("/api/auth/me"), { headers: getAuthHeaders() })
      .then(({ data }) => data?.user && setProfile({ firstName: data.user.firstName ?? "", lastName: data.user.lastName ?? "", username: data.user.username ?? "", email: data.user.email ?? "" }))
      .catch(() => toast.error("Unable to refresh account details."));
  }, [toast]);

  const saveProfile = async (event) => {
    event.preventDefault();
    setSavingProfile(true);
    try {
      const { data } = await axios.put(buildApiUrl("/api/auth/me/profile"), {
        firstName: profile.firstName.trim(), lastName: profile.lastName.trim(), username: profile.username.trim(),
      }, { headers: getAuthHeaders() });
      setUser(data.user);
      setProfile((current) => ({ ...current, ...data.user }));
      toast.success("Profile updated.");
    } catch (error) {
      toast.error(error.response?.data?.message ?? "Unable to update profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    if (passwords.newPassword !== passwords.confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }
    setSavingPassword(true);
    try {
      const { data } = await axios.put(buildApiUrl("/api/auth/me/password"), {
        currentPassword: passwords.currentPassword, newPassword: passwords.newPassword,
      }, { headers: getAuthHeaders() });
      setPasswords({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast.success(data.message ?? "Password updated.");
    } catch (error) {
      toast.error(error.response?.data?.message ?? "Unable to update password.");
    } finally {
      setSavingPassword(false);
    }
  };

  return <div className={styles.root}>
    <Sidebar />
    <main className={styles.main}>
      <header className={styles.pageHeader}><div className={styles.pageTitle}>Account Settings</div></header>
      <div className={`${styles.body} ${pageStyles.settingsGrid}`}>
        <section className={pageStyles.card}>
          <div className={pageStyles.cardHeading}><ManageAccountsOutlinedIcon /><div><h1>Teacher profile</h1><p>Update the name and username shown across your classrooms.</p></div></div>
          <form onSubmit={saveProfile}>
            <div className={pageStyles.twoColumns}><label>First name<input required maxLength={80} value={profile.firstName} onChange={(event) => setProfile((current) => ({ ...current, firstName: event.target.value }))} /></label><label>Last name<input required maxLength={80} value={profile.lastName} onChange={(event) => setProfile((current) => ({ ...current, lastName: event.target.value }))} /></label></div>
            <label>Username<input required maxLength={80} value={profile.username} onChange={(event) => setProfile((current) => ({ ...current, username: event.target.value }))} /></label>
            <label>Email<input value={profile.email} disabled /><small>Email changes require a new verification workflow and are currently handled by an administrator.</small></label>
            <button className={styles.btnPrimary} disabled={savingProfile}>{savingProfile ? "Saving..." : "Save profile"}</button>
          </form>
        </section>
        <section className={pageStyles.card}>
          <div className={pageStyles.cardHeading}><LockResetOutlinedIcon /><div><h1>Change password</h1><p>Use at least eight characters and choose a new password.</p></div></div>
          <form onSubmit={changePassword}>
            <label>Current password<input type="password" autoComplete="current-password" required value={passwords.currentPassword} onChange={(event) => setPasswords((current) => ({ ...current, currentPassword: event.target.value }))} /></label>
            <label>New password<input type="password" autoComplete="new-password" required minLength={8} value={passwords.newPassword} onChange={(event) => setPasswords((current) => ({ ...current, newPassword: event.target.value }))} /></label>
            <label>Confirm new password<input type="password" autoComplete="new-password" required minLength={8} value={passwords.confirmPassword} onChange={(event) => setPasswords((current) => ({ ...current, confirmPassword: event.target.value }))} /></label>
            <button className={styles.btnPrimary} disabled={savingPassword}>{savingPassword ? "Updating..." : "Change password"}</button>
          </form>
        </section>
      </div>
    </main>
  </div>;
}

export default TeacherSettingsPage;
