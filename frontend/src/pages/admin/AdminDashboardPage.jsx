import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import {
  FiBell,
  FiEdit2,
  FiFilter,
  FiGrid,
  FiPlus,
  FiSearch,
  FiUserCheck,
  FiUsers,
  FiZap,
} from "react-icons/fi";
import {
  buildApiUrl,
  clearToken,
  getAuthHeaders,
  getUser,
} from "../../utils/auth";
import styles from "./AdminDashboardPage.module.css";

const INITIAL_FORM = {
  firstName: "",
  lastName: "",
  username: "",
  email: "",
  password: "",
};

const formatLastUpdated = (timestamp) =>
  new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const formatTime = (timestamp) =>
  new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

function AdminDashboardPage() {
  const navigate = useNavigate();
  const adminUser = getUser();
  const [allUsers, setAllUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [teacherForm, setTeacherForm] = useState(INITIAL_FORM);
  const [isCreatingTeacher, setIsCreatingTeacher] = useState(false);
  const [showTeacherForm, setShowTeacherForm] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(Date.now());

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const response = await axios.get(buildApiUrl("/api/admin/users"), {
        headers: getAuthHeaders(),
      });

      setAllUsers(response.data.users ?? []);
      setLastUpdated(Date.now());
    } catch (error) {
      setErrorMessage(error.response?.data?.message ?? "Failed to load users");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const usersByRole = useMemo(() => {
    const roleSummary = {
      all: allUsers.length,
      admin: 0,
      teacher: 0,
      student: 0,
    };

    allUsers.forEach((user) => {
      if (user.role && roleSummary[user.role] !== undefined) {
        roleSummary[user.role] += 1;
      }
    });

    return roleSummary;
  }, [allUsers]);

  const usersWithStatus = useMemo(
    () =>
      allUsers.map((user) => ({
        ...user,
        status:
          typeof user.status === "string" && user.status.trim()
            ? user.status.toLowerCase()
            : "active",
      })),
    [allUsers],
  );

  const filteredUsers = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return usersWithStatus.filter((user) => {
      const fullName = `${user.firstName} ${user.lastName}`.toLowerCase();
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      const matchesStatus =
        statusFilter === "all" || user.status === statusFilter;
      const matchesSearch =
        !normalizedSearch ||
        fullName.includes(normalizedSearch) ||
        user.username?.toLowerCase().includes(normalizedSearch) ||
        user.email?.toLowerCase().includes(normalizedSearch);

      return matchesRole && matchesStatus && matchesSearch;
    });
  }, [usersWithStatus, roleFilter, statusFilter, searchText]);

  const systemLogs = useMemo(() => {
    return usersWithStatus.slice(0, 5).map((user) => ({
      id: user.id,
      time: formatTime(user.createdAt),
      username: user.username,
      role: user.role,
      activity: "Account created",
      details: `${user.firstName} ${user.lastName}`,
      status: "Success",
    }));
  }, [usersWithStatus]);

  const onTeacherFieldChange = (event) => {
    const { name, value } = event.target;
    setTeacherForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const createTeacher = async (event) => {
    event.preventDefault();
    setSuccessMessage("");
    setErrorMessage("");

    const requiredValues = Object.values(teacherForm).every((value) =>
      value.trim(),
    );

    if (!requiredValues) {
      setErrorMessage("Please complete all teacher account fields.");
      return;
    }

    setIsCreatingTeacher(true);

    try {
      const response = await axios.post(
        buildApiUrl("/api/admin/users/teacher"),
        teacherForm,
        {
          headers: getAuthHeaders(),
        },
      );

      setSuccessMessage(
        response.data.message ?? "Teacher account created successfully.",
      );
      setTeacherForm(INITIAL_FORM);
      setShowTeacherForm(false);
      await fetchUsers();
    } catch (error) {
      setErrorMessage(
        error.response?.data?.message ?? "Failed to create teacher account",
      );
    } finally {
      setIsCreatingTeacher(false);
    }
  };

  const onSignOut = () => {
    clearToken();
    navigate("/login", { replace: true });
  };

  return (
    // <div className={styles.page}>
    <div className={styles.container}>
      <header className={styles.topbar}>
        <div className={styles.brandArea}>
          <h1>SharpRunner</h1>
        </div>

        <div className={styles.topbarRight}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="notifications"
          >
            <FiBell size={14} />
          </button>
          <nav className={styles.nav}>
            <button
              className={`${styles.navLink} ${styles.navLinkActive}`}
              type="button"
            >
              Dashboard
            </button>
            <button className={styles.navLink} type="button">
              Account
            </button>
          </nav>
          <div className={styles.avatar} aria-label="admin profile">
            {(
              adminUser?.firstName?.[0] ??
              adminUser?.username?.[0] ??
              "A"
            ).toUpperCase()}
          </div>
          <button
            type="button"
            className={styles.signOutButton}
            onClick={onSignOut}
          >
            Logout
          </button>
        </div>
      </header>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Dashboard Overview</h2>
          <span>Last updated: {formatLastUpdated(lastUpdated)}</span>
        </div>

        <div className={styles.statGrid}>
          <article className={styles.statCard}>
            <p className={styles.statTitle}>
              <FiUsers size={16} />
              <span>Total of Users</span>
            </p>
            <p className={styles.statValue}>{usersByRole.all}</p>
          </article>
          <article className={styles.statCard}>
            <p className={styles.statTitle}>
              <FiUserCheck size={16} />
              <span>Active Instructor</span>
            </p>
            <p className={styles.statValue}>{usersByRole.teacher}</p>
            <button type="button" className={styles.seeMoreButton}>
              See more
            </button>
          </article>
          <article className={`${styles.statCard} ${styles.statCardCentered}`}>
            <p className={styles.statTitle}>
              <FiGrid size={16} />
              <span>Active Classrooms</span>
            </p>
            <p className={styles.statValue}>{usersByRole.teacher}</p>
            <button type="button" className={styles.seeMoreButton}>
              See more
            </button>
          </article>
        </div>

        <div className={styles.logsCard}>
          <h3>
            <FiZap size={16} />
            <span>System Log Today</span>
          </h3>
          {isLoading ? (
            <p className={styles.feedback}>Loading logs...</p>
          ) : systemLogs.length === 0 ? (
            <p className={styles.feedback}>No activity logs yet.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>User</th>
                    <th>Role</th>
                    <th>Activity</th>
                    <th>Details</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {systemLogs.map((log) => (
                    <tr key={log.id}>
                      <td>{log.time}</td>
                      <td>{log.username}</td>
                      <td className={styles.capitalize}>{log.role}</td>
                      <td>{log.activity}</td>
                      <td>{log.details}</td>
                      <td
                        className={
                          log.status === "Failed"
                            ? styles.errorText
                            : styles.successText
                        }
                      >
                        {log.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.userHeader}>
          <div>
            <h2>User Management</h2>
            <p>Manage user accounts, permissions, and access levels.</p>
          </div>
        </div>

        <div className={styles.controlRow}>
          <div className={styles.searchBox}>
            <FiSearch size={14} className={styles.searchIcon} />
            <input
              type="text"
              value={searchText}
              className={styles.searchInput}
              placeholder="Search User..."
              onChange={(event) => setSearchText(event.target.value)}
            />
          </div>

          <div className={styles.filterWrap}>
            <FiFilter size={14} />
            <select
              value={statusFilter}
              className={styles.filterSelect}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">Status: All</option>
              <option value="active">Status: Active</option>
              <option value="inactive">Status: Inactive</option>
            </select>
          </div>

          <div className={styles.filterWrap}>
            <FiUsers size={14} />
            <select
              value={roleFilter}
              className={styles.filterSelect}
              onChange={(event) => setRoleFilter(event.target.value)}
            >
              <option value="all">Role: All</option>
              <option value="admin">Role: Admin</option>
              <option value="teacher">Role: Instructor</option>
              <option value="student">Role: Student</option>
            </select>
          </div>

          <button
            type="button"
            className={styles.addUserButton}
            onClick={() => setShowTeacherForm((current) => !current)}
          >
            <FiPlus size={15} />
            {showTeacherForm ? "Close" : "Add user"}
          </button>

          <button
            type="button"
            className={styles.refreshButton}
            onClick={fetchUsers}
          >
            Refresh
          </button>
        </div>

        {showTeacherForm && (
          <form onSubmit={createTeacher} className={styles.teacherForm}>
            <h3>Create Instructor Account</h3>
            <div className={styles.teacherGrid}>
              <label>
                <span>First name</span>
                <input
                  type="text"
                  name="firstName"
                  value={teacherForm.firstName}
                  onChange={onTeacherFieldChange}
                />
              </label>
              <label>
                <span>Last name</span>
                <input
                  type="text"
                  name="lastName"
                  value={teacherForm.lastName}
                  onChange={onTeacherFieldChange}
                />
              </label>
              <label>
                <span>Username</span>
                <input
                  type="text"
                  name="username"
                  value={teacherForm.username}
                  onChange={onTeacherFieldChange}
                />
              </label>
              <label>
                <span>Email</span>
                <input
                  type="email"
                  name="email"
                  value={teacherForm.email}
                  onChange={onTeacherFieldChange}
                />
              </label>
              <label>
                <span>Password</span>
                <input
                  type="password"
                  name="password"
                  value={teacherForm.password}
                  onChange={onTeacherFieldChange}
                />
              </label>
            </div>
            <button
              type="submit"
              className={styles.submitTeacherButton}
              disabled={isCreatingTeacher}
            >
              {isCreatingTeacher ? "Creating..." : "Create Instructor"}
            </button>
          </form>
        )}

        {errorMessage && <p className={styles.error}>{errorMessage}</p>}
        {successMessage && <p className={styles.success}>{successMessage}</p>}

        {isLoading ? (
          <p className={styles.feedback}>Loading users...</p>
        ) : filteredUsers.length === 0 ? (
          <p className={styles.feedback}>No users found for this filter.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th />
                  <th>Username</th>
                  <th>Full Name</th>
                  <th>Role</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <input
                        type="checkbox"
                        className={styles.rowCheckbox}
                        aria-label={`select-${user.username}`}
                      />
                    </td>
                    <td>{user.username}</td>
                    <td>{`${user.firstName} ${user.lastName}`}</td>
                    <td className={styles.capitalize}>{user.role}</td>
                    <td>{user.email}</td>
                    <td>
                      <span
                        className={
                          user.status === "inactive"
                            ? styles.errorText
                            : styles.successText
                        }
                      >
                        {user.status === "inactive" ? "Inactive" : "Active"}
                      </span>
                    </td>
                    <td>
                      {user.status === "inactive" ? (
                        <button
                          type="button"
                          className={`${styles.tableActionButton} ${styles.activateButton}`}
                        >
                          <FiPlus size={12} />
                          Activate
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={styles.tableActionButton}
                        >
                          <FiEdit2 size={12} />
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default AdminDashboardPage;
