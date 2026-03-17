import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import Button from "../../Components/Button/Button.jsx";
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

function AdminDashboardPage() {
  const navigate = useNavigate();
  const adminUser = getUser();
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [teacherForm, setTeacherForm] = useState(INITIAL_FORM);
  const [isCreatingTeacher, setIsCreatingTeacher] = useState(false);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const params = new URLSearchParams();
      if (roleFilter !== "all") {
        params.set("role", roleFilter);
      }

      const normalizedSearch = searchText.trim();
      if (normalizedSearch) {
        params.set("search", normalizedSearch);
      }

      const querySuffix = params.toString() ? `?${params.toString()}` : "";
      const response = await axios.get(buildApiUrl(`/api/admin/users${querySuffix}`), {
        headers: getAuthHeaders(),
      });

      setUsers(response.data.users ?? []);
    } catch (error) {
      setErrorMessage(error.response?.data?.message ?? "Failed to load users");
    } finally {
      setIsLoading(false);
    }
  }, [roleFilter, searchText]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const usersByRole = useMemo(() => {
    const roleSummary = {
      all: users.length,
      admin: 0,
      teacher: 0,
      student: 0,
    };

    users.forEach((user) => {
      if (user.role && roleSummary[user.role] !== undefined) {
        roleSummary[user.role] += 1;
      }
    });

    return roleSummary;
  }, [users]);

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
      value.trim()
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
        }
      );

      setSuccessMessage(
        response.data.message ?? "Teacher account created successfully."
      );
      setTeacherForm(INITIAL_FORM);
      await fetchUsers();
    } catch (error) {
      setErrorMessage(
        error.response?.data?.message ?? "Failed to create teacher account"
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
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Admin Dashboard</h1>
          <p>Manage platform users and create teacher accounts.</p>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.adminMeta}>
            Signed in as {adminUser?.username ?? "admin"}
          </span>
          <Button label="Sign Out" variant="outline" size="sm" onClick={onSignOut} />
        </div>
      </header>

      <main className={styles.layout}>
        <section className={styles.card}>
          <h2>User Management</h2>
          <div className={styles.filters}>
            <label>
              <span>Role</span>
              <select
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value)}
              >
                <option value="all">All ({usersByRole.all})</option>
                <option value="admin">Admin ({usersByRole.admin})</option>
                <option value="teacher">Teacher ({usersByRole.teacher})</option>
                <option value="student">Student ({usersByRole.student})</option>
              </select>
            </label>

            <label>
              <span>Search</span>
              <input
                type="text"
                value={searchText}
                placeholder="Name, username, or email"
                onChange={(event) => setSearchText(event.target.value)}
              />
            </label>

            <Button label="Refresh" variant="outline" size="sm" onClick={fetchUsers} />
          </div>

          {isLoading ? (
            <p className={styles.feedback}>Loading users...</p>
          ) : users.length === 0 ? (
            <p className={styles.feedback}>No users found for this filter.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Role</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>{`${user.firstName} ${user.lastName}`}</td>
                      <td>{user.username}</td>
                      <td>{user.email}</td>
                      <td>
                        <span className={styles.roleChip}>{user.role}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className={styles.card}>
          <h2>Create Teacher Account</h2>
          <form onSubmit={createTeacher} className={styles.form}>
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
            <Button
              type="submit"
              label={isCreatingTeacher ? "Creating..." : "Create Teacher"}
              variant="primary"
              size="md"
              disabled={isCreatingTeacher}
            />
          </form>

          {errorMessage && <p className={styles.error}>{errorMessage}</p>}
          {successMessage && <p className={styles.success}>{successMessage}</p>}
        </section>
      </main>
    </div>
  );
}

export default AdminDashboardPage;
