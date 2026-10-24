import { createElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { FiActivity, FiArchive, FiBookOpen, FiDownload, FiEye, FiGrid, FiKey, FiLogOut, FiMenu, FiMoreVertical, FiPlus, FiRefreshCw, FiSearch, FiShield, FiTrash2, FiUserCheck, FiUsers, FiX } from "react-icons/fi";
import { buildApiUrl, clearToken, getAuthHeaders, getUser } from "../../utils/auth";
import ConfirmModal from "../../Components/ConfirmModal/ConfirmModal.jsx";
import TeacherInviteModal from "../../Components/TeacherInviteModal/TeacherInviteModal.jsx";
import { useToast } from "../../Components/Toast/ToastProvider.jsx";
import { AdminStudentClassroomFilterView } from "./AdminStudentClassroomFilter.jsx";
import AdminLessonViewer from "./AdminLessonViewer.jsx";
import AdminBuiltInLessonViewer from "./AdminBuiltInLessonViewer.jsx";
import { createAdminLessonDownloadController, createAdminLessonViewerController } from "./adminLessonViewerState.js";
import { createAdminBuiltInLessonDetailController } from "./adminBuiltInLessonDetailState.js";
import {
  buildAdminContentListPath,
  createAdminContentRequestController,
  createAdminContentTransitions,
} from "./adminContentListState.js";
import {
  INITIAL_BUILT_IN_CATALOGUE_STATE,
  createAdminBuiltInCatalogueController,
  createAdminContentSourceTransitions,
} from "./adminBuiltInLessonCatalogueState.js";
import {
  buildAdminUserFilterSnapshot,
  buildClassroomLookupPath,
  buildQueryString,
  buildUserExportPath,
  buildUserListPath,
  createAdminFilterTransitions,
  createLatestRequestController,
} from "./adminStudentClassroomFilterState.js";
import styles from "./AdminDashboardPage.module.css";

const NAV_ITEMS = [["dashboard", "Dashboard", FiGrid], ["users", "Users", FiUsers], ["teachers", "Teachers", FiUserCheck], ["students", "Students", FiUsers], ["classrooms", "Classrooms", FiBookOpen], ["content", "Content", FiShield], ["audit", "Audit Logs", FiActivity], ["status", "System Status", FiActivity], ["legal", "Legal & Privacy", FiShield]];
const EMPTY_SUMMARY = { totalUsers: 0, activeUsers: 0, activeTeachers: 0, activeStudents: 0, activeClassrooms: 0, archivedAccounts: 0 };
const formatDate = (value) => value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
const api = () => ({ headers: getAuthHeaders() });

function StatusBadge({ value }) {
  const label = value === true ? "Active" : value === false ? "Archived" : String(value || "unknown").replaceAll("_", " ");
  return <span className={`${styles.badge} ${styles[`badge_${String(value).toLowerCase()}`] || ""}`}>{label}</span>;
}
export function Pager({ page, totalPages, total, label, onChange, paginationLabel = label }) {
  const paginationAvailable = Number.isInteger(total) && Number.isInteger(totalPages);
  return <div className={styles.pagination}><span>{paginationAvailable ? `${total} ${label}` : "Results unavailable"}</span><div><button type="button" aria-label={`Previous ${paginationLabel} page`} disabled={!paginationAvailable || page <= 1} onClick={() => onChange(page - 1)}>Previous</button><span>{paginationAvailable ? `Page ${page} of ${totalPages}` : "Pagination unavailable"}</span><button type="button" aria-label={`Next ${paginationLabel} page`} disabled={!paginationAvailable || page >= totalPages} onClick={() => onChange(page + 1)}>Next</button></div></div>;
}

function AdminDashboardPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const adminUser = getUser();
  const [activeView, setActiveView] = useState("dashboard");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [health, setHealth] = useState({ status: "checking", database: "checking" });
  const [users, setUsers] = useState([]); const [userPage, setUserPage] = useState(1); const [userMeta, setUserMeta] = useState({ total: null, totalPages: null });
  const [userFilters, setUserFilters] = useState({ search: "", status: "", role: "" });
  const [selectedClassroom, setSelectedClassroom] = useState(null);
  const [classroomLookup, setClassroomLookup] = useState({ options: [], search: "", page: 1, total: null, totalPages: null, status: "idle", error: "", retry: 0 });
  const [classrooms, setClassrooms] = useState([]); const [classPage, setClassPage] = useState(1); const [classMeta, setClassMeta] = useState({ total: 0, totalPages: 1 });
  const [classFilters, setClassFilters] = useState({ search: "", status: "", from: "", to: "" });
  const [content, setContent] = useState([]); const [contentPage, setContentPage] = useState(1); const [contentMeta, setContentMeta] = useState({ total: null, totalPages: null });
  const [contentFilters, setContentFilters] = useState({ search: "", type: "", status: "" });
  const [contentLoading, setContentLoading] = useState(false); const [contentError, setContentError] = useState("");
  const [contentSource, setContentSource] = useState("teacher");
  const contentSourceRef = useRef("teacher");
  const [builtInCatalogue, setBuiltInCatalogue] = useState(INITIAL_BUILT_IN_CATALOGUE_STATE);
  const [builtInDetail, setBuiltInDetail] = useState(null);
  const [logs, setLogs] = useState([]); const [logPage, setLogPage] = useState(1); const [logMeta, setLogMeta] = useState({ total: 0, totalPages: 1 });
  const [logFilters, setLogFilters] = useState({ actor: "", target: "", action: "", from: "", to: "" });
  const [confirmAction, setConfirmAction] = useState(null); const [deleteTarget, setDeleteTarget] = useState(null); const [deleteText, setDeleteText] = useState("");
  const [detail, setDetail] = useState(null); const [detailFileError, setDetailFileError] = useState(""); const [detailFileLoading, setDetailFileLoading] = useState(false); const [showInvite, setShowInvite] = useState(false); const [inviteBusy, setInviteBusy] = useState(false); const [inviteError, setInviteError] = useState(""); const [actionBusy, setActionBusy] = useState(false);
  const lessonViewer = useMemo(() => createAdminLessonViewerController({
    request: async (path, options) => (await axios.get(buildApiUrl(path), { ...api(), ...options })).data,
    setDetail,
  }), []);
  const lessonDownloads = useMemo(() => createAdminLessonDownloadController({
    request: async (path, options) => (await axios.get(buildApiUrl(path), { headers: getAuthHeaders(), responseType: "blob", ...options })).data,
    setError: setDetailFileError,
    setLoading: setDetailFileLoading,
  }), []);
  const userRequests = useMemo(() => createLatestRequestController({
    onStart() {
      setUsers([]);
      setUserMeta({ total: null, totalPages: null });
      setError("");
      setLoading(true);
    },
    onSuccess(applyResponse) { applyResponse(); },
    onError(failure) {
      setError(failure.message);
      if (failure.statusView) setHealth({ status: "error", database: "unavailable" });
    },
    onFinish() { setLoading(false); },
  }), []);
  const classroomRequests = useMemo(() => createLatestRequestController({
    onStart() {
      setClassroomLookup((current) => ({
        ...current,
        options: [],
        total: null,
        totalPages: null,
        status: "loading",
        error: "",
      }));
    },
    onSuccess(response) {
      setClassroomLookup((current) => ({
        ...current,
        options: response.classrooms || [],
        page: response.page || current.page,
        total: response.total,
        totalPages: response.totalPages,
        status: "success",
        error: "",
      }));
    },
    onError(message) {
      setClassroomLookup((current) => ({
        ...current,
        options: [],
        total: null,
        totalPages: null,
        status: "error",
        error: message,
      }));
    },
  }), []);
  const contentRequests = useMemo(() => createAdminContentRequestController({
    setContent,
    setMeta: setContentMeta,
    setError: setContentError,
    setLoading: setContentLoading,
  }), []);
  const contentTransitions = useMemo(() => createAdminContentTransitions({
    requests: contentRequests,
    setFilters: setContentFilters,
    setPage: setContentPage,
  }), [contentRequests]);
  const builtInCatalogueRequests = useMemo(() => createAdminBuiltInCatalogueController({
    request: async (path, options) => (await axios.get(buildApiUrl(path), { ...api(), ...options })).data,
    setState: setBuiltInCatalogue,
  }), []);
  const builtInLessonDetail = useMemo(() => createAdminBuiltInLessonDetailController({
    request: async (path, options) => (await axios.get(buildApiUrl(path), { ...api(), ...options })).data,
    setDetail: setBuiltInDetail,
  }), []);
  const filterTransitions = useMemo(() => createAdminFilterTransitions({
    userRequests,
    classroomRequests,
    setActiveView,
    setUserFilters,
    setUserPage,
    setSelectedClassroom,
    setClassroomLookup,
  }), [classroomRequests, userRequests]);

  const effectiveUserFilters = useMemo(() => buildAdminUserFilterSnapshot({
    activeView,
    userFilters,
    selectedClassroom,
  }), [activeView, selectedClassroom, userFilters]);
  const loadDashboard = useCallback(async () => {
    const [summaryResponse, logsResponse, healthResponse] = await Promise.all([axios.get(buildApiUrl("/api/admin/summary"), api()), axios.get(buildApiUrl("/api/admin/logs?page=1&limit=8"), api()), axios.get(buildApiUrl("/api/health"))]);
    return { summaryResponse, logsResponse, healthResponse };
  }, []);
  const loadTeacherContent = useCallback(() => contentRequests.run(async () => {
    const response = await axios.get(buildApiUrl(buildAdminContentListPath(contentFilters, contentPage)), api());
    return response.data;
  }, {
    mapError: (requestError) => requestError.response?.data?.message || "Unable to load content.",
  }), [contentFilters, contentPage, contentRequests]);
  const refresh = useCallback(async () => {
    if (activeView === "content") {
      return contentSourceRef.current === "built-in"
        ? builtInCatalogueRequests.loadIfNeeded()
        : loadTeacherContent();
    }
    return userRequests.run(async () => {
      if (activeView === "dashboard" || activeView === "status") {
        const { summaryResponse, logsResponse, healthResponse } = await loadDashboard();
        return () => {
          setSummary(summaryResponse.data);
          setLogs(logsResponse.data.logs || []);
          setHealth(healthResponse.data);
        };
      }
      if (["users", "teachers", "students"].includes(activeView)) {
        const r = await axios.get(buildApiUrl(buildUserListPath(effectiveUserFilters, userPage)), api());
        return () => {
          setUsers(r.data.users || []);
          setUserMeta({ total: r.data.total, totalPages: r.data.totalPages });
        };
      }
      if (activeView === "classrooms") {
        const r = await axios.get(buildApiUrl(`/api/admin/classrooms?${buildQueryString(classFilters, classPage)}`), api());
        return () => { setClassrooms(r.data.classrooms || []); setClassMeta(r.data); };
      }
      if (activeView === "audit") {
        const r = await axios.get(buildApiUrl(`/api/admin/logs?${buildQueryString(logFilters, logPage)}`), api());
        return () => { setLogs(r.data.logs || []); setLogMeta(r.data); };
      }
      return () => {};
    }, {
      mapError: (requestError) => ({
        message: requestError.response?.data?.message || "Unable to load this admin view.",
        statusView: activeView === "status",
      }),
    });
  }, [activeView, builtInCatalogueRequests, classFilters, classPage, effectiveUserFilters, loadDashboard, loadTeacherContent, logFilters, logPage, userPage, userRequests]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (activeView !== "students") {
      classroomRequests.invalidate();
      return undefined;
    }

    const requestGeneration = classroomRequests.begin();
    const abortController = new AbortController();
    axios.get(buildApiUrl(buildClassroomLookupPath({
      search: classroomLookup.search,
      page: classroomLookup.page,
    })), { ...api(), signal: abortController.signal })
      .then((response) => {
        classroomRequests.succeed(requestGeneration, response.data);
      })
      .catch((requestError) => {
        if (requestError.code === "ERR_CANCELED") return;
        classroomRequests.fail(requestGeneration, requestError.response?.data?.message || "Unable to load classrooms.");
      });

    return () => {
      classroomRequests.invalidate();
      abortController.abort();
    };
  }, [activeView, classroomLookup.page, classroomLookup.retry, classroomLookup.search, classroomRequests]);
  useEffect(() => () => {
    userRequests.invalidate();
    classroomRequests.invalidate();
    contentRequests.invalidate();
    builtInCatalogueRequests.dispose();
    builtInLessonDetail.dispose();
    lessonViewer.dispose();
    lessonDownloads.dispose();
  }, [builtInCatalogueRequests, builtInLessonDetail, classroomRequests, contentRequests, lessonDownloads, lessonViewer, userRequests]);

  const changeClassroomSearch = (search) => {
    filterTransitions.changeClassroomSearch(search);
  };
  const changeClassroomLookupPage = (page) => {
    filterTransitions.changeClassroomLookupPage(page);
  };
  const retryClassroomLookup = () => {
    filterTransitions.retryClassroomLookup();
  };
  const changeContentFilter = (name, value) => {
    contentTransitions.changeFilter(name, value);
  };
  const changeContentPage = (page) => {
    contentTransitions.changePage(page);
  };
  const contentSourceTransitions = useMemo(() => createAdminContentSourceTransitions({
    deactivateTeacher: () => contentRequests.deactivate(),
    activateTeacher: () => {
      if (contentRequests.needsLoad()) void loadTeacherContent();
    },
    deactivateBuiltIn: () => builtInCatalogueRequests.deactivate(),
    activateBuiltIn: () => { void builtInCatalogueRequests.loadIfNeeded(); },
    closeTeacherDetail: () => {
      lessonDownloads.invalidate();
      setDetailFileError("");
      if (detail?.type === "lesson") lessonViewer.close({ restoreFocus: false });
      else setDetail(null);
    },
    closeBuiltInDetail: () => builtInLessonDetail.cancel(),
    setSource: (source) => {
      contentSourceRef.current = source;
      setContentSource(source);
    },
  }), [builtInCatalogueRequests, builtInLessonDetail, contentRequests, detail?.type, lessonDownloads, lessonViewer, loadTeacherContent]);
  const changeContentSource = (source) => {
    contentSourceTransitions.changeSource(source, contentSourceRef.current);
  };
  const changeAppliedClassroom = (classroomId) => {
    const selectedId = String(classroomId || "");
    const nextClassroom = selectedId
      ? [selectedClassroom, ...classroomLookup.options]
        .find((classroom) => classroom && String(classroom.id) === selectedId)
      : null;
    if (selectedId && !nextClassroom) return;
    filterTransitions.changeAppliedClassroom(nextClassroom);
  };

  const runAction = async () => {
    if (!confirmAction || actionBusy) return; setActionBusy(true);
    try { const r = await axios.request({ url: buildApiUrl(confirmAction.path), method: confirmAction.method || "POST", data: confirmAction.body || {}, headers: getAuthHeaders() }); toast.success(r.data.message || "Admin action completed."); setConfirmAction(null); await refresh(); }
    catch (requestError) { setError(requestError.response?.data?.message || "Admin action failed."); } finally { setActionBusy(false); }
  };
  const permanentDelete = async () => {
    if (!deleteTarget || deleteText !== "DELETE" || actionBusy) return; setActionBusy(true);
    try { const r = await axios.delete(buildApiUrl(`/api/admin/users/${deleteTarget.id}`), { headers: getAuthHeaders(), data: { confirmation: deleteText } }); toast.success(r.data.message); setDeleteTarget(null); setDeleteText(""); await refresh(); }
    catch (requestError) { setError(requestError.response?.data?.message || "Permanent deletion failed."); } finally { setActionBusy(false); }
  };
  const openUser = async (user) => { lessonDownloads.invalidate(); setDetailFileError(""); if (detail?.type === "lesson") lessonViewer.close({ restoreFocus: false }); try { const r = await axios.get(buildApiUrl(`/api/admin/users/${user.id}`), api()); setDetail({ type: "user", ...r.data }); } catch (requestError) { setError(requestError.response?.data?.message || "Unable to load user details."); } };
  const openClassroom = async (room) => { lessonDownloads.invalidate(); setDetailFileError(""); if (detail?.type === "lesson") lessonViewer.close({ restoreFocus: false }); try { const r = await axios.get(buildApiUrl(`/api/admin/classrooms/${room.id}`), api()); setDetail({ type: "classroom", ...r.data }); } catch (requestError) { setError(requestError.response?.data?.message || "Unable to load classroom details."); } };
  const openContent = async (item, opener) => {
    lessonDownloads.invalidate();
    setDetailFileError("");
    if (item.contentType === "lesson") { await lessonViewer.open(item, opener); return; }
    if (detail?.type === "lesson") lessonViewer.close({ restoreFocus: false });
    try { const r = await axios.get(buildApiUrl(`/api/admin/content/${item.id}`), api()); setDetail({ type: "content", ...r.data }); } catch (requestError) { setError(requestError.response?.data?.message || "Unable to load content details."); }
  };
  const closeDetail = () => { lessonDownloads.invalidate(); setDetailFileError(""); if (detail?.type === "lesson") lessonViewer.close(); else setDetail(null); };
  const openLessonAttachment = (file) => lessonDownloads.download(file);
  const openBuiltInLesson = (item, opener) => builtInLessonDetail.open(item, opener);
  const closeBuiltInLesson = () => builtInLessonDetail.close();
  const exportCsv = async (path, filename) => { try { const r = await axios.get(buildApiUrl(path), { headers: getAuthHeaders(), responseType: "blob" }); const url = URL.createObjectURL(r.data); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url); } catch { setError("CSV export failed."); } };
  const createTeacher = async (form) => { setInviteBusy(true); setInviteError(""); try { const r = await axios.post(buildApiUrl("/api/admin/users/teacher"), form, api()); toast.success(r.data.message); setShowInvite(false); await refresh(); } catch (requestError) { setInviteError(requestError.response?.data?.message || "Unable to invite teacher."); } finally { setInviteBusy(false); } };
  const selectView = (view) => {
    lessonDownloads.invalidate();
    setDetailFileError("");
    if (contentSourceRef.current === "built-in") {
      contentSourceTransitions.changeView(view, activeView, contentSourceRef.current);
    } else {
      contentTransitions.changeView(view, activeView);
    }
    if (view === "legal") {
      userRequests.invalidate();
      classroomRequests.invalidate();
      navigate("/legal");
      return;
    }
    filterTransitions.changeView(view, activeView);
    setDrawerOpen(false); if (detail?.type === "lesson") lessonViewer.close({ restoreFocus: false }); else setDetail(null);
  };
  const signOut = () => { clearToken(); navigate("/login", { replace: true }); };

  const renderDashboard = () => <>
    <PageHeading eyebrow="Platform administration" title="Dashboard overview"><button className={styles.secondaryButton} type="button" onClick={refresh}><FiRefreshCw /> Refresh</button></PageHeading>
    <div className={styles.statGrid}>{[["Total users", summary.totalUsers, FiUsers], ["Active users", summary.activeUsers, FiUserCheck], ["Teachers", summary.activeTeachers, FiUserCheck], ["Students", summary.activeStudents, FiUsers], ["Active classrooms", summary.activeClassrooms, FiBookOpen], ["Archived accounts", summary.archivedAccounts, FiArchive]].map(([label, value, icon]) => <article className={styles.statCard} key={label}>{createElement(icon)}<div><span>{label}</span><strong>{value}</strong></div></article>)}</div>
    <div className={styles.gridTwo}><section className={styles.card}><div className={styles.cardHeader}><div><h3>System health</h3><p>Live operational checks</p></div></div><div className={styles.healthRows}><div><span>Backend</span><StatusBadge value={health.status === "ok" ? "online" : health.status} /></div><div><span>Database</span><StatusBadge value={health.database} /></div></div></section><section className={styles.card}><div className={styles.cardHeader}><div><h3>Recent admin activity</h3><p>Latest governance actions</p></div><button type="button" className={styles.textButton} onClick={() => selectView("audit")}>View all</button></div><div className={styles.activityList}>{logs.length ? logs.slice(0, 6).map((log) => <div key={log.id}><FiActivity /><p><strong>{log.actorUsername || "System"}</strong> {log.activity}<small>{log.targetUsername || log.details || "Platform"} · {formatDate(log.createdAt)}</small></p></div>) : <Empty text="No admin activity yet." />}</div></section></div>
  </>;

  const renderUsers = () => <>
    <PageHeading eyebrow="Account governance" title={activeView === "teachers" ? "Teachers" : activeView === "students" ? "Students" : "Users"}><button type="button" className={styles.secondaryButton} onClick={() => exportCsv(buildUserExportPath(effectiveUserFilters), "sharprunner-users.csv")}><FiDownload /> Export CSV</button><button type="button" className={styles.primaryButton} onClick={() => setShowInvite(true)}><FiPlus /> Add teacher</button></PageHeading>
    <section className={styles.card}><div className={styles.filters}><label className={styles.search}><FiSearch /><span className={styles.srOnly}>Search users</span><input value={userFilters.search} onChange={(e) => filterTransitions.changeUserFilter("search", e.target.value)} placeholder="Search name, username, or email" /></label><label>Status<select value={userFilters.status} onChange={(e) => filterTransitions.changeUserFilter("status", e.target.value)}><option value="">Active views</option><option value="active">Active</option><option value="pending">Pending verification</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select></label>{activeView === "users" && <label>Role<select value={userFilters.role} onChange={(e) => filterTransitions.changeUserFilter("role", e.target.value)}><option value="">All roles</option><option value="admin">Admin</option><option value="teacher">Teacher</option><option value="student">Student</option></select></label>}</div>
      {activeView === "students" && <AdminStudentClassroomFilterView selectedClassroom={selectedClassroom} options={classroomLookup.options} search={classroomLookup.search} page={classroomLookup.page} totalPages={classroomLookup.totalPages} total={classroomLookup.total} status={classroomLookup.status} error={classroomLookup.error} onSearchChange={changeClassroomSearch} onSelect={changeAppliedClassroom} onPageChange={changeClassroomLookupPage} onRetry={retryClassroomLookup} />}
      <TableState loading={loading} error={error} empty={!users.length} emptyText="No accounts match these filters." onRetry={refresh}><div className={styles.tableWrap}><table><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Policy</th><th>Created</th><th><span className={styles.srOnly}>Actions</span></th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><strong>{user.firstName} {user.lastName}</strong><small>{user.email} · @{user.username}</small></td><td>{user.role === "teacher" ? "Teacher" : user.role[0].toUpperCase() + user.role.slice(1)}</td><td><StatusBadge value={user.status} /></td><td><StatusBadge value={user.policyStatus?.requiresAcceptance ? "needs_acceptance" : "current"} /></td><td>{formatDate(user.createdAt)}</td><td><UserActions user={user} openUser={openUser} setConfirmAction={setConfirmAction} setDeleteTarget={setDeleteTarget} setDeleteText={setDeleteText} /></td></tr>)}</tbody></table></div></TableState><Pager page={userPage} totalPages={userMeta.totalPages} total={userMeta.total} label="matching users" paginationLabel={activeView === "students" ? "student results" : "user results"} onChange={filterTransitions.changeUserPage} /></section>
  </>;

  const renderClassrooms = () => <>
    <PageHeading eyebrow="Read-only governance" title="Classrooms"><button type="button" className={styles.secondaryButton} onClick={() => exportCsv(`/api/admin/classrooms/export.csv?${buildQueryString(classFilters, 1)}`, "sharprunner-classrooms.csv")}><FiDownload /> Export CSV</button></PageHeading>
    <section className={styles.card}>
      <div className={styles.filters}><label className={styles.search}><FiSearch /><span className={styles.srOnly}>Search classrooms</span><input value={classFilters.search} onChange={(e) => setClassFilters((v) => ({ ...v, search: e.target.value }))} placeholder="Classroom, teacher, or email" /></label><label>Status<select value={classFilters.status} onChange={(e) => setClassFilters((v) => ({ ...v, status: e.target.value }))}><option value="">All states</option><option value="active">Active</option><option value="archived">Archived</option></select></label><label>Created from<input type="date" value={classFilters.from} onChange={(e) => setClassFilters((v) => ({ ...v, from: e.target.value }))} /></label><label>Created to<input type="date" value={classFilters.to} onChange={(e) => setClassFilters((v) => ({ ...v, to: e.target.value }))} /></label></div>
      <TableState loading={loading} error={error} empty={!classrooms.length} emptyText="No classrooms match these filters."><div className={styles.tableWrap}><table><thead><tr><th>Classroom</th><th>Teacher</th><th>Students</th><th>Modules</th><th>Status</th><th>Latest activity</th><th /></tr></thead><tbody>{classrooms.map((room) => <tr key={room.id}><td><strong>{room.className}</strong><small>{room.section} · {room.schoolYear}</small></td><td>{room.teacher ? <>{room.teacher.firstName} {room.teacher.lastName}<small>{room.teacher.email}</small></> : "—"}</td><td>{room.studentCount ?? 0}</td><td>{room.moduleCount ?? 0}</td><td><StatusBadge value={room.isActive} /></td><td>{formatDate(room.latestActivityAt || room.updatedAt)}</td><td><ClassroomActions room={room} openClassroom={openClassroom} setConfirmAction={setConfirmAction} /></td></tr>)}</tbody></table></div></TableState>
      <Pager page={classPage} totalPages={classMeta.totalPages || 1} total={classMeta.total || 0} label="classrooms" onChange={setClassPage} />
    </section>
  </>;

  const renderContent = () => <>
    <AdminContentView
      source={contentSource}
      onSourceChange={changeContentSource}
      content={content}
      contentFilters={contentFilters}
      contentLoading={contentLoading}
      contentError={contentError}
      contentPage={contentPage}
      contentMeta={contentMeta}
      onContentFilterChange={changeContentFilter}
      onContentPageChange={changeContentPage}
      onOpenContent={openContent}
      builtInState={builtInCatalogue}
      onRetryBuiltIn={() => { void builtInCatalogueRequests.load(); }}
      onInspectBuiltIn={openBuiltInLesson}
    />
  </>;

  const renderAudit = () => <><PageHeading eyebrow="Accountable administration" title="Audit logs"><button type="button" className={styles.secondaryButton} onClick={() => exportCsv(`/api/admin/logs/export.csv?${buildQueryString(logFilters, 1)}`, "sharprunner-audit-logs.csv")}><FiDownload /> Export CSV</button></PageHeading><section className={styles.card}><div className={styles.filters}><label>Admin actor<input value={logFilters.actor} onChange={(e) => setLogFilters((v) => ({ ...v, actor: e.target.value }))} placeholder="Username" /></label><label>Action<input value={logFilters.action} onChange={(e) => setLogFilters((v) => ({ ...v, action: e.target.value }))} placeholder="e.g. ARCHIVED" /></label><label>Affected user<input value={logFilters.target} onChange={(e) => setLogFilters((v) => ({ ...v, target: e.target.value }))} placeholder="Username" /></label><label>From<input type="date" value={logFilters.from} onChange={(e) => setLogFilters((v) => ({ ...v, from: e.target.value }))} /></label><label>To<input type="date" value={logFilters.to} onChange={(e) => setLogFilters((v) => ({ ...v, to: e.target.value }))} /></label></div><TableState loading={loading} error={error} empty={!logs.length} emptyText="No audit records match these filters."><div className={styles.tableWrap}><table><thead><tr><th>Timestamp</th><th>Actor</th><th>Action</th><th>Target</th><th>Safe metadata</th><th>Status</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id}><td>{formatDate(log.createdAt)}</td><td>{log.actorUsername || "System"}</td><td><strong>{log.activity}</strong></td><td>{log.targetUsername || "—"}</td><td>{log.details || "—"}</td><td><StatusBadge value={log.status} /></td></tr>)}</tbody></table></div></TableState><Pager page={logPage} totalPages={logMeta.totalPages || 1} total={logMeta.total || 0} label="audit records" onChange={setLogPage} /></section></>;

  const renderStatus = () => <><PageHeading eyebrow="Operational visibility" title="System status"><button className={styles.secondaryButton} type="button" onClick={refresh}><FiRefreshCw /> Run checks</button></PageHeading><div className={styles.gridTwo}><section className={styles.card}><h3>Service checks</h3><div className={styles.healthRows}><div><span>Backend API</span><StatusBadge value={health.status === "ok" ? "online" : health.status} /></div><div><span>Database</span><StatusBadge value={health.database} /></div></div><p className={styles.privacyNote}>Only non-sensitive operational status is exposed. Credentials, environment variables, and server details are never returned.</p></section><section className={styles.card}><h3>Platform totals</h3><div className={styles.healthRows}><div><span>Total users</span><strong>{summary.totalUsers}</strong></div><div><span>Active users</span><strong>{summary.activeUsers}</strong></div><div><span>Active classrooms</span><strong>{summary.activeClassrooms}</strong></div><div><span>Archived accounts</span><strong>{summary.archivedAccounts}</strong></div></div></section></div></>;

  return <div className={styles.page}><button className={styles.mobileMenu} type="button" onClick={() => setDrawerOpen(true)} aria-label="Open admin navigation"><FiMenu /></button>{drawerOpen && <button className={styles.drawerBackdrop} type="button" aria-label="Close admin navigation" onClick={() => setDrawerOpen(false)} />}<Sidebar open={drawerOpen} activeView={activeView} selectView={selectView} adminUser={adminUser} close={() => setDrawerOpen(false)} signOut={signOut} /><main className={styles.main}>{error && !["users", "teachers", "students", "classrooms", "content", "audit"].includes(activeView) && <p className={styles.errorBanner}>{error}</p>}{activeView === "dashboard" && renderDashboard()}{["users", "teachers", "students"].includes(activeView) && renderUsers()}{activeView === "classrooms" && renderClassrooms()}{activeView === "content" && renderContent()}{activeView === "audit" && renderAudit()}{activeView === "status" && renderStatus()}</main><ConfirmModal open={Boolean(confirmAction)} title={confirmAction?.title} message={confirmAction?.message} confirmLabel={actionBusy ? "Working…" : confirmAction?.label} danger={confirmAction?.danger} confirmDisabled={actionBusy} onConfirm={runAction} onCancel={() => !actionBusy && setConfirmAction(null)} />{deleteTarget && <TypedDelete target={deleteTarget} text={deleteText} setText={setDeleteText} busy={actionBusy} onCancel={() => setDeleteTarget(null)} onDelete={permanentDelete} />}{detail && (detail.type === "lesson" ? <AdminLessonViewer detail={detail} onClose={closeDetail} onRetry={() => lessonViewer.retry()} onOpenAttachment={openLessonAttachment} fileError={detailFileError} fileLoading={detailFileLoading} /> : <DetailPanel detail={detail} onClose={closeDetail} />)}{builtInDetail && <AdminBuiltInLessonViewer detail={builtInDetail} onClose={closeBuiltInLesson} onRetry={() => builtInLessonDetail.retry()} />}{showInvite && <TeacherInviteModal isSubmitting={inviteBusy} errorMessage={inviteError} onInvite={createTeacher} onClose={() => !inviteBusy && setShowInvite(false)} />}</div>;
}

function PageHeading({ eyebrow, title, children }) { return <div className={styles.pageHeading}><div><p>{eyebrow}</p><h2>{title}</h2></div><div className={styles.headingActions}>{children}</div></div>; }
function Sidebar({ open, activeView, selectView, adminUser, close, signOut }) { return <aside className={`${styles.sidebar} ${open ? styles.sidebarOpen : ""}`}><div className={styles.brand}><div>SR</div><span><strong>SharpRunner</strong><small>Administration</small></span><button type="button" onClick={close} aria-label="Close navigation"><FiX /></button></div><nav>{NAV_ITEMS.map(([key, label, icon]) => <button type="button" className={activeView === key ? styles.navActive : ""} key={key} onClick={() => selectView(key)}>{createElement(icon)}<span>{label}</span></button>)}</nav><div className={styles.adminIdentity}><div>{(adminUser?.firstName?.[0] || adminUser?.username?.[0] || "A").toUpperCase()}</div><span><strong>{adminUser?.firstName || adminUser?.username || "Admin"}</strong><small>Administrator</small></span></div><button className={styles.logoutButton} type="button" onClick={signOut}><FiLogOut /> Sign out</button></aside>; }
function RowActionMenu({ label, children }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current) return;
    const margin = 8;
    const gap = 6;
    const menuWidth = menuRef.current.offsetWidth;
    const menuHeight = menuRef.current.offsetHeight;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - triggerRect.bottom - margin;
    const spaceAbove = triggerRect.top - margin;
    const shouldOpenUp = spaceBelow < menuHeight && spaceAbove > spaceBelow;
    const desiredTop = shouldOpenUp ? triggerRect.top - menuHeight - gap : triggerRect.bottom + gap;
    setPosition({
      top: Math.max(margin, Math.min(desiredTop, window.innerHeight - menuHeight - margin)),
      left: Math.max(margin, Math.min(triggerRect.right - menuWidth, window.innerWidth - menuWidth - margin)),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsidePress = (event) => {
      if (!triggerRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnKey = (event) => { if (event.key === "Escape") setOpen(false); };
    const closeOnViewportChange = (event) => {
      if (event?.type === "scroll" && menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnKey);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnKey);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [open]);

  return <div className={styles.actionMenu}>
    <button ref={triggerRef} className={styles.actionMenuTrigger} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}><FiMoreVertical /></button>
    {open && createPortal(<div ref={menuRef} className={styles.actionMenuPopover} role="menu" style={position} onClick={(event) => { if (event.target.closest("button")) setOpen(false); }} onChange={() => setOpen(false)}>{children}</div>, document.body)}
  </div>;
}
function ClassroomActions({ room, openClassroom, setConfirmAction }) {
  return <RowActionMenu label={`Actions for ${room.className}`}>
    <button type="button" role="menuitem" onClick={() => openClassroom(room)}><FiEye /> Inspect</button>
    <button type="button" role="menuitem" onClick={() => setConfirmAction({ title: room.isActive ? "Archive classroom?" : "Restore classroom?", message: room.isActive ? "Students will no longer be able to use this classroom. Instructional content will be preserved." : "The classroom will become active again.", label: room.isActive ? "Archive" : "Restore", path: `/api/admin/classrooms/${room.id}/${room.isActive ? "archive" : "restore"}`, danger: room.isActive })}>{room.isActive ? <FiArchive /> : <FiRefreshCw />} {room.isActive ? "Archive" : "Restore"}</button>
  </RowActionMenu>;
}
function UserActions({ user, openUser, setConfirmAction, setDeleteTarget, setDeleteText }) {
  const statusAction = user.status === "inactive"
    ? { title: "Reactivate account?", message: `${user.username} will be able to sign in again.`, label: "Reactivate", status: "active" }
    : user.status === "active"
      ? { title: user.role === "teacher" ? "Suspend teacher?" : "Deactivate account?", message: `${user.username} will no longer be able to sign in until reactivated.`, label: user.role === "teacher" ? "Suspend" : "Deactivate", status: "inactive", danger: true }
      : null;
  return <RowActionMenu label={`Actions for ${user.username}`}>
    <button type="button" role="menuitem" onClick={() => openUser(user)}><FiEye /> View details</button>
    {user.role !== "admin" && <>
      <button type="button" role="menuitem" onClick={() => setConfirmAction({ title: "Force logout?", message: `${user.username} will need to sign in again on every device.`, label: "Force logout", path: `/api/admin/users/${user.id}/force-logout` })}><FiLogOut /> Force logout</button>
      {user.status === "archived" ? <>
        <button type="button" onClick={() => setConfirmAction({ title: "Restore account?", message: "This user will regain access with all historical data preserved.", label: "Restore", path: `/api/admin/users/${user.id}/restore` })}><FiRefreshCw /> Restore</button>
        <button className={styles.dangerItem} type="button" onClick={() => { setDeleteTarget(user); setDeleteText(""); }}><FiTrash2 /> Delete permanently</button>
      </> : <>
        {statusAction && <button type="button" onClick={() => setConfirmAction({ ...statusAction, path: `/api/admin/users/${user.id}/status`, method: "PATCH", body: { status: statusAction.status } })}><FiShield /> {statusAction.label}</button>}
        <button type="button" onClick={() => setConfirmAction({ title: "Archive account?", message: "This user will no longer be able to sign in, but historical records will be preserved.", label: "Archive", path: `/api/admin/users/${user.id}/archive`, danger: true })}><FiArchive /> Archive</button>
      </>}
      {user.role === "teacher" && user.authProvider !== "google" && <button type="button" onClick={() => setConfirmAction({ title: "Reset password?", message: `A temporary password will be emailed to ${user.email}. Existing sessions will be revoked.`, label: "Reset password", path: `/api/admin/users/${user.id}/reset-password`, body: { revokeSessions: true } })}><FiKey /> Reset password</button>}
    </>}
  </RowActionMenu>;
}
function TableState({ loading, error, empty, emptyText, children, onRetry }) { if (loading) return <div className={styles.state}><FiRefreshCw className={styles.spin} /> Loading…</div>; if (error) return <div className={`${styles.state} ${styles.stateError}`} role="alert"><FiActivity />{error}{onRetry && <button type="button" className={styles.secondaryButton} onClick={onRetry}>Retry</button>}</div>; if (empty) return <Empty text={emptyText} />; return children; }
function Empty({ text }) { return <div className={styles.state}><FiSearch /><strong>{text}</strong><span>Try changing the current filters.</span></div>; }
export function AdminContentSourceControls({ source = "teacher", onChange }) {
  return <div className={styles.contentSourceControls} role="group" aria-label="Content source">
    <button type="button" aria-pressed={source === "teacher"} onClick={() => onChange("teacher")}>Teacher-created</button>
    <button type="button" aria-pressed={source === "built-in"} onClick={() => onChange("built-in")}>Built-in lessons</button>
  </div>;
}

export function AdminBuiltInLessonCatalogue({ state, onRetry, onInspect }) {
  if (state.status === "loading" || state.status === "idle") {
    return <div className={styles.state} role="status"><FiRefreshCw className={styles.spin} /> Loading built-in lessons…</div>;
  }
  if (state.status === "error") {
    return <div className={`${styles.state} ${styles.stateError}`} role="alert"><FiActivity />{state.error}<button type="button" className={styles.secondaryButton} onClick={onRetry}>Retry</button></div>;
  }
  if (!state.lessons.length) {
    return <div className={styles.state}><FiBookOpen /><strong>No built-in lessons are available.</strong><span>The canonical catalogue returned no lessons.</span></div>;
  }
  return <div className={styles.tableWrap}><table className={styles.builtInCatalogue}><thead><tr><th>Lesson</th><th>Description</th><th>Sections</th><th><span className={styles.srOnly}>Actions</span></th></tr></thead><tbody>{state.lessons.map((lesson) => <tr key={lesson.lessonKey}><td><strong>{lesson.title}</strong><small>{lesson.eyebrow}</small></td><td>{lesson.description}</td><td>{lesson.sectionCount} {lesson.sectionCount === 1 ? "section" : "sections"}</td><td><button type="button" className={styles.secondaryButton} aria-label={`Inspect ${lesson.title}`} onClick={(event) => onInspect(lesson, event.currentTarget)}>Inspect</button></td></tr>)}</tbody></table></div>;
}

export function AdminContentView({
  source = "teacher",
  onSourceChange,
  content,
  contentFilters,
  contentLoading,
  contentError,
  contentPage,
  contentMeta,
  onContentFilterChange,
  onContentPageChange,
  onOpenContent,
  builtInState,
  onRetryBuiltIn,
  onInspectBuiltIn,
}) {
  return <>
    <PageHeading eyebrow="Learning materials" title="Content oversight"><span className={styles.readOnly}><FiEye /> Read-only</span></PageHeading>
    <section className={styles.card}>
      <AdminContentSourceControls source={source} onChange={onSourceChange} />
      {source === "teacher" ? <>
        <div className={styles.filters}><label className={styles.search}><FiSearch /><span className={styles.srOnly}>Search content</span><input value={contentFilters.search} onChange={(event) => onContentFilterChange("search", event.target.value)} placeholder="Title, classroom, or teacher" /></label><label>Type<select value={contentFilters.type} onChange={(event) => onContentFilterChange("type", event.target.value)}><option value="">All content</option><option value="module">Modules</option><option value="lesson">Lessons</option><option value="assignment">Assignments</option></select></label><AdminContentStatusFilter value={contentFilters.status} onChange={(status) => onContentFilterChange("status", status)} /></div>
        <AdminContentTable content={content} loading={contentLoading} error={contentError} onOpenContent={onOpenContent} page={contentPage} total={contentMeta.total} totalPages={contentMeta.totalPages} onPageChange={onContentPageChange} />
      </> : <AdminBuiltInLessonCatalogue state={builtInState} onRetry={onRetryBuiltIn} onInspect={onInspectBuiltIn} />}
    </section>
  </>;
}
const contentOwnerLabel = (owner) => {
  if (!owner) return "—";
  return [owner.firstName, owner.lastName].filter(Boolean).join(" ") || (owner.username ? `@${owner.username}` : "—");
};
const contentPublicationLabel = (status) => ({
  archived: "Archived",
  scheduled: "Scheduled",
  published: "Published",
  draft: "Draft",
}[status] || "Unknown");
export function AdminContentStatusFilter({ value, onChange }) {
  return <label>Publish state<select value={value} onChange={(event) => onChange(event.target.value)}><option value="">All statuses</option><option value="draft">Draft</option><option value="scheduled">Scheduled</option><option value="published">Published</option><option value="archived">Archived</option></select></label>;
}
export function AdminContentTable({ content = [], loading, error, onOpenContent, page, total, totalPages, onPageChange }) {
  return <><TableState loading={loading} error={error} empty={!content.length} emptyText="No learning content matches these filters."><div className={styles.tableWrap}><table><thead><tr><th>Content</th><th>Type</th><th>Classroom</th><th>Teacher</th><th>Publish state</th><th>Created</th><th /></tr></thead><tbody>{content.map((item) => <tr key={item.id}><td><strong>{item.title}</strong>{item.externalUrl && <small className={styles.ellipsis}>{item.externalUrl}</small>}</td><td>{item.contentType}</td><td>{item.classroom?.className || "—"}</td><td>{contentOwnerLabel(item.owner)}</td><td><StatusBadge value={contentPublicationLabel(item.status)} /></td><td>{formatDate(item.createdAt)}</td><td><button type="button" className={styles.inspectButton} onClick={(event) => onOpenContent?.(item, event.currentTarget)}><FiEye /> Inspect</button></td></tr>)}</tbody></table></div></TableState><Pager page={page} totalPages={totalPages} total={total} label="items" onChange={onPageChange} /></>;
}
function TypedDelete({ target, text, setText, busy, onCancel, onDelete }) { return <div className={styles.modalBackdrop}><section className={styles.typedModal} role="dialog" aria-modal="true" aria-labelledby="delete-title"><h3 id="delete-title">Permanently delete user</h3><p>This cannot be undone. The archived account and related records may be removed by database cascades.</p><label>Type <strong>DELETE</strong> to continue<input autoFocus value={text} onChange={(e) => setText(e.target.value)} aria-label={`Type DELETE to permanently delete ${target.username}`} /></label><div><button type="button" className={styles.secondaryButton} onClick={onCancel} disabled={busy}>Cancel</button><button type="button" className={styles.dangerButton} onClick={onDelete} disabled={text !== "DELETE" || busy}>Delete permanently</button></div></section></div>; }
const membershipStatusLabel = (status) => ({
  active: "Enrolled",
  pending: "Pending approval",
  rejected: "Rejected",
  removed: "Removed",
}[status] || "Unknown membership status");

export function DetailPanel({ detail, onClose }) {
  if (detail.type === "content") return <ContentDetail detail={detail} onClose={onClose} />;
  const isUser = detail.type === "user"; const subject = isUser ? detail.user : detail.classroom;
  return <div className={styles.detailBackdrop} onClick={onClose}><aside className={styles.detailPanel} role="dialog" aria-modal="true" aria-label={`${isUser ? "User" : "Classroom"} details`} onClick={(e) => e.stopPropagation()}><header><div><span>{isUser ? "Account detail" : "Read-only classroom detail"}</span><h2>{isUser ? `${subject.firstName} ${subject.lastName}` : subject.className}</h2></div><button type="button" onClick={onClose} aria-label="Close details"><FiX /></button></header>{isUser ? <><dl><DetailTerm name="Username">@{subject.username}</DetailTerm><DetailTerm name="Email">{subject.email}</DetailTerm><DetailTerm name="Role">{subject.role}</DetailTerm><DetailTerm name="Status"><StatusBadge value={subject.status} /></DetailTerm><DetailTerm name="Last login">{formatDate(subject.lastLoginAt)}</DetailTerm></dl><DetailSection title="Owned classrooms" items={detail.ownedClassrooms} render={(item) => <><strong>{item.className}</strong><span>{item.section} · {item.isActive ? "Active" : "Archived"}</span></>} /><DetailSection title="Recent admin history" items={detail.recentActivity} render={(item) => <><strong>{item.activity}</strong><span>{formatDate(item.createdAt)} · {item.details || "No metadata"}</span></>} /></> : <><dl><DetailTerm name="Teacher">{subject.teacher ? `${subject.teacher.firstName} ${subject.teacher.lastName}` : "—"}</DetailTerm><DetailTerm name="Status"><StatusBadge value={subject.isActive} /></DetailTerm><DetailTerm name="Enrolled students">{subject.studentCount ?? "—"}</DetailTerm><DetailTerm name="Modules">{subject.moduleCount ?? 0}</DetailTerm><DetailTerm name="Created">{formatDate(subject.createdAt)}</DetailTerm></dl><DetailSection title="Classroom memberships" items={detail.memberships} render={(item) => <><strong>{item.student ? `${item.student.firstName} ${item.student.lastName}` : `Student #${item.studentId}`}</strong>{item.student?.email && <span>{item.student.email}</span>}<span>Membership status: {membershipStatusLabel(item.status)}</span>{item.student?.status && <span>Account status: {item.student.status}</span>}</>} /><DetailSection title="Modules, lessons & resources" items={detail.lessons} render={(item) => <><strong>{item.title}</strong><span>{item.contentType} · {item.isPublished ? "Published" : "Draft"} · {item.attachments?.length || 0} resources</span></>} /><DetailSection title="Announcements" items={detail.announcements} render={(item) => <><strong>{item.message}</strong><span>{formatDate(item.createdAt)} · {item.isActive ? "Active" : "Inactive"}</span></>} /></>}</aside></div>;
}
function ContentDetail({ detail, onClose }) {
  const item = detail.content;
  return <div className={styles.detailBackdrop} onClick={onClose}><aside className={styles.detailPanel} role="dialog" aria-modal="true" aria-label="Content details" onClick={(e) => e.stopPropagation()}><header><div><span>Read-only content detail</span><h2>{item.title}</h2></div><button type="button" onClick={onClose} aria-label="Close details"><FiX /></button></header><dl><DetailTerm name="Type">{item.contentType}</DetailTerm><DetailTerm name="Publish state"><StatusBadge value={item.isPublished ? "published" : "draft"} /></DetailTerm><DetailTerm name="Classroom">{item.classroom?.className || "—"}</DetailTerm><DetailTerm name="Teacher">{item.classroom?.teacher ? `${item.classroom.teacher.firstName} ${item.classroom.teacher.lastName}` : "—"}</DetailTerm><DetailTerm name="Module">{item.module?.title || "—"}</DetailTerm><DetailTerm name="Created">{formatDate(item.createdAt)}</DetailTerm></dl>{item.description && <section className={styles.detailSection}><h3>Description</h3><p>{item.description}</p></section>}{item.externalUrl && <section className={styles.detailSection}><h3>External link</h3><p className={styles.breakWord}>{item.externalUrl}</p></section>}<DetailSection title="Resource metadata" items={item.attachments} render={(resource) => <><strong>{resource.originalName}</strong><span>{resource.mimeType} · {resource.sizeBytes} bytes · scan: {resource.scanStatus}</span></>} /></aside></div>;
}
function DetailTerm({ name, children }) { return <div><dt>{name}</dt><dd>{children}</dd></div>; }
function DetailSection({ title, items = [], render }) { return <section className={styles.detailSection}><h3>{title}</h3>{items.length ? items.map((item) => <div key={item.id}>{render(item)}</div>) : <p>None recorded.</p>}</section>; }

export default AdminDashboardPage;
