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
  FiTrash2,
  FiUserCheck,
  FiUsers,
  FiXCircle,
  FiZap,
} from "react-icons/fi";
import {
  buildApiUrl,
  clearToken,
  getAuthHeaders,
  getUser,
} from "../../utils/auth";
import ConfirmModal from "../../Components/ConfirmModal/ConfirmModal.jsx";
import TeacherInviteModal from "../../Components/TeacherInviteModal/TeacherInviteModal.jsx";
import { useToast } from "../../Components/Toast/ToastProvider.jsx";
import styles from "./AdminDashboardPage.module.css";

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
  const toast = useToast();
  const adminUser = getUser();
  const [allUsers, setAllUsers] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [isCreatingTeacher, setIsCreatingTeacher] = useState(false);
  const [teacherInviteError, setTeacherInviteError] = useState("");
  const [updatingUserId, setUpdatingUserId] = useState(null);
  const [userPendingDeletion, setUserPendingDeletion] = useState(null);
  const [deletingUserId, setDeletingUserId] = useState(null);
  const [showTeacherInviteModal, setShowTeacherInviteModal] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(Date.now());

  const fetchDashboardData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const [usersResponse, logsResponse] = await Promise.all([
        axios.get(buildApiUrl("/api/admin/users"), {
          headers: getAuthHeaders(),
        }),
        axios.get(buildApiUrl("/api/admin/logs?limit=20"), {
          headers: getAuthHeaders(),
        }),
      ]);

      setAllUsers(usersResponse.data.users ?? []);
      setActivityLogs(logsResponse.data.logs ?? []);
      setLastUpdated(Date.now());
    } catch (error) {
      setErrorMessage(
        error.response?.data?.message ??
          "Failed to load dashboard data. Please refresh.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

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
    return activityLogs.map((log) => ({
      id: log.id,
      time: formatTime(log.createdAt),
      username: log.actorUsername || log.targetUsername || "system",
      role: log.role || "system",
      activity: log.activity || "System activity",
      details: log.details || "-",
      status:
        (log.status || "success").toLowerCase() === "failed"
          ? "Failed"
          : "Success",
    }));
  }, [activityLogs]);

  const createTeacher = async (teacherForm) => {
    setSuccessMessage("");
    setErrorMessage("");
    setTeacherInviteError("");

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
        response.data.message ?? "Teacher invitation sent successfully.",
      );
      toast.success(`Teacher invitation sent to ${teacherForm.email}.`);
      setShowTeacherInviteModal(false);
      await fetchDashboardData();
    } catch (error) {
      setTeacherInviteError(
        error.response?.data?.message ?? "Failed to send teacher invitation",
      );
    } finally {
      setIsCreatingTeacher(false);
    }
  };

  const onChangeUserStatus = async (user, nextStatus) => {
    setErrorMessage("");
    setSuccessMessage("");
    setUpdatingUserId(user.id);

    try {
      const response = await axios.patch(
        buildApiUrl(`/api/admin/users/${user.id}/status`),
        { status: nextStatus },
        {
          headers: getAuthHeaders(),
        },
      );

      setSuccessMessage(response.data.message ?? "User status updated.");
      await fetchDashboardData();
    } catch (error) {
      setErrorMessage(
        error.response?.data?.message ?? "Failed to update user status",
      );
    } finally {
      setUpdatingUserId(null);
    }
  };

  const confirmDeleteUser = async () => {
    if (!userPendingDeletion || deletingUserId) return;

    const user = userPendingDeletion;
    setErrorMessage("");
    setSuccessMessage("");
    setDeletingUserId(user.id);

    try {
      const response = await axios.delete(
        buildApiUrl(`/api/admin/users/${user.id}`),
        { headers: getAuthHeaders() },
      );
      setUserPendingDeletion(null);
      setSuccessMessage(response.data.message ?? "User permanently deleted.");
      await fetchDashboardData();
    } catch (error) {
      setErrorMessage(error.response?.data?.message ?? "Failed to delete user");
    } finally {
      setDeletingUserId(null);
    }
  };

  const getDeleteWarning = (user) => {
    if (!user) return "";
    const relatedData = user.role === "teacher"
      ? "their classrooms and related class data"
      : "their progress and classroom membership data";
    return `Delete ${user.username}? This permanently removes the account and ${relatedData}. This action cannot be undone.`;
  };

  const onSignOut = () => {
    clearToken();
    navigate("/login", { replace: true });
  };

  return (
    <div className={styles.page}>
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
            <article
              className={`${styles.statCard} ${styles.statCardCentered}`}
            >
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
                <option value="pending">Status: Pending verification</option>
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
              onClick={() => {
                setTeacherInviteError("");
                setShowTeacherInviteModal(true);
              }}
            >
              <FiPlus size={15} />
              Add user
            </button>

            <button
              type="button"
              className={styles.refreshButton}
              onClick={fetchDashboardData}
            >
              Refresh
            </button>
          </div>

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
                              : user.status === "pending"
                                ? styles.pendingText
                                : styles.successText
                          }
                        >
                          {user.status === "inactive"
                            ? "Inactive"
                            : user.status === "pending"
                              ? "Pending verification"
                              : "Active"}
                        </span>
                      </td>
                      <td>
                        <div className={styles.userActions}>
                          {user.role === "admin" ? (
                            <button
                              type="button"
                              className={styles.tableActionButton}
                              disabled
                            >
                              <FiEdit2 size={12} />
                              Edit
                            </button>
                          ) : user.status === "pending" ? (
                            <span className={styles.pendingAction}>Awaiting email</span>
                          ) : user.status === "inactive" ? (
                            <button
                              type="button"
                              className={`${styles.tableActionButton} ${styles.activateButton}`}
                              onClick={() => onChangeUserStatus(user, "active")}
                              disabled={updatingUserId === user.id}
                            >
                              <FiPlus size={12} />
                              {updatingUserId === user.id
                                ? "Updating..."
                                : "Activate"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className={`${styles.tableActionButton} ${styles.deactivateButton}`}
                              onClick={() => onChangeUserStatus(user, "inactive")}
                              disabled={updatingUserId === user.id}
                            >
                              <FiXCircle size={12} />
                              {updatingUserId === user.id
                                ? "Updating..."
                                : "Deactivate"}
                            </button>
                          )}
                          {user.role !== "admin" && (
                            <button
                              type="button"
                              className={`${styles.tableActionButton} ${styles.deleteButton}`}
                              onClick={() => setUserPendingDeletion(user)}
                              disabled={deletingUserId === user.id}
                            >
                              <FiTrash2 size={12} />
                              Remove
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      <ConfirmModal
        open={Boolean(userPendingDeletion)}
        title="Permanently delete user?"
        message={getDeleteWarning(userPendingDeletion)}
        confirmLabel={deletingUserId ? "Deleting..." : "Delete user"}
        danger
        confirmDisabled={Boolean(deletingUserId)}
        onConfirm={confirmDeleteUser}
        onCancel={() => {
          if (!deletingUserId) setUserPendingDeletion(null);
        }}
      />
      {showTeacherInviteModal && (
        <TeacherInviteModal
          isSubmitting={isCreatingTeacher}
          errorMessage={teacherInviteError}
          onInvite={createTeacher}
          onClose={() => {
            if (isCreatingTeacher) return;
            setTeacherInviteError("");
            setShowTeacherInviteModal(false);
          }}
        />
      )}
    </div>
  );
}

export default AdminDashboardPage;
