import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  FiArchive, FiBookOpen, FiCopy, FiEdit2, FiEye, FiLayers,
  FiPlus, FiRotateCcw, FiSearch, FiTrash2, FiX,
} from "react-icons/fi";
import Sidebar from "../../Components/SideBar/Sidebar.jsx";
import ConfirmModal from "../../Components/ConfirmModal/ConfirmModal.jsx";
import { useToast } from "../../Components/Toast/ToastProvider.jsx";
import { buildApiUrl, getAuthHeaders } from "../../utils/auth.js";
import styles from "./TeacherLessonLibraryPage.module.css";

const api = (path = "") => buildApiUrl(`/api/teacher/lesson-library${path}`);
const requestConfig = () => ({ headers: getAuthHeaders() });
const statusLabel = (lesson) => lesson.archivedAt
  ? "Archived"
  : lesson.status === "scheduled"
    ? `Scheduled · ${new Date(lesson.publishAt).toLocaleString()}`
    : lesson.status === "published" ? "Published" : "Draft";

function DialogShell({ eyebrow, title, onClose, children }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    const focusable = () => [...(dialog?.querySelectorAll("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]") || [])];
    focusable()[0]?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape" && onClose) { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); previousFocus?.focus?.(); };
  }, [onClose]);
  return (
    <div className={styles.backdrop} onMouseDown={onClose}>
      <div ref={dialogRef} className={styles.dialog} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="lesson-dialog-title">
        <header>
          <div><span>{eyebrow}</span><h2 id="lesson-dialog-title">{title}</h2></div>
          <button type="button" onClick={onClose} aria-label="Close dialog"><FiX /></button>
        </header>
        {children}
      </div>
    </div>
  );
}

function CreateLessonDialog({ onClose, onCreate, saving }) {
  const [lessonNumber, setLessonNumber] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const submit = (event) => {
    event.preventDefault();
    onCreate({ lessonNumber: Number(lessonNumber), title: title.trim(), description: description.trim() });
  };
  return (
    <DialogShell eyebrow="New lesson" title="Start with the essentials" onClose={saving ? undefined : onClose}>
      <form className={styles.createForm} onSubmit={submit}>
        <div className={styles.createRow}>
          <label>Lesson number<input autoFocus required type="number" min="1" max="9999" value={lessonNumber} onChange={(event) => setLessonNumber(event.target.value)} placeholder="4" /></label>
          <label>Lesson title<input required maxLength="160" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Loops in C#" /></label>
        </div>
        <label>Description <small>(optional)</small><textarea maxLength="4000" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What will students learn?" /></label>
        <footer><button type="button" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" className={styles.primary} disabled={saving || !lessonNumber || !title.trim()}>{saving ? "Creating…" : "Open Lesson Builder"}</button></footer>
      </form>
    </DialogShell>
  );
}

function AssignmentDialog({ lesson, classrooms, initialClassroomId, initialModuleId, onClose, onAssigned }) {
  const toast = useToast();
  const [classroomId, setClassroomId] = useState(initialClassroomId || "");
  const [moduleId, setModuleId] = useState(initialModuleId || "");
  const [modules, setModules] = useState([]);
  const [mode, setMode] = useState("copy");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setModuleId(String(classroomId) === String(initialClassroomId) ? initialModuleId || "" : "");
    setModules([]);
    if (!classroomId) return;
    axios.get(buildApiUrl(`/api/teacher/classrooms/${classroomId}/lessons`), requestConfig())
      .then(({ data }) => setModules((data.lessons || []).filter((item) => item.contentType === "module")))
      .catch(() => setModules([]));
  }, [classroomId, initialClassroomId, initialModuleId]);

  const submit = async (event) => {
    event.preventDefault();
    if (!classroomId) return;
    setSaving(true);
    try {
      const { data } = await axios.post(api(`/${lesson.id}/placements`), {
        classroomId: Number(classroomId),
        moduleId: moduleId ? Number(moduleId) : null,
        mode,
      }, requestConfig());
      toast.success(data.message);
      onAssigned();
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to add this lesson.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogShell eyebrow="Add existing lesson" title={lesson.title} onClose={saving ? undefined : onClose}>
      <form onSubmit={submit}>
        <label>Classroom<select required value={classroomId} onChange={(event) => setClassroomId(event.target.value)}><option value="">Choose a classroom</option>{classrooms.filter((room) => room.isActive !== false).map((room) => <option key={room.id} value={room.id}>{room.className} · {room.section}</option>)}</select></label>
        <label>Module (optional)<select value={moduleId} onChange={(event) => setModuleId(event.target.value)}><option value="">Standalone lesson</option>{modules.map((module) => <option key={module.id} value={module.id}>{module.title}</option>)}</select></label>
        <fieldset>
          <legend>How should this lesson be added?</legend>
          <label className={mode === "copy" ? styles.optionActive : ""}><input type="radio" name="mode" checked={mode === "copy"} onChange={() => setMode("copy")} /><span><strong>Make a Copy</strong><small>Create an independent lesson. Future edits will not affect the original.</small></span></label>
          <label className={mode === "reuse" ? styles.optionActive : ""}><input type="radio" name="mode" checked={mode === "reuse"} onChange={() => setMode("reuse")} /><span><strong>Reuse Lesson</strong><small>Use the same lesson. Future edits appear in every classroom using it.</small></span></label>
        </fieldset>
        {mode === "reuse" && <p className={styles.sharedNotice}>This stays one shared lesson. Editing it later updates every classroom placement.</p>}
        <footer><button type="button" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" className={styles.primary} disabled={saving || !classroomId}>{saving ? "Adding…" : "Add Lesson"}</button></footer>
      </form>
    </DialogShell>
  );
}

export default function TeacherLessonLibraryPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const contextClassroomId = params.get("classroomId") || "";
  const contextModuleId = params.get("moduleId") || "";
  const [lessons, setLessons] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [assigning, setAssigning] = useState(null);
  const [creating, setCreating] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState("");
  const [confirmAction, setConfirmAction] = useState(null);
  const [sharedEditTarget, setSharedEditTarget] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [active, archived] = await Promise.all([
        axios.get(api(), requestConfig()),
        axios.get(api("?archived=true"), requestConfig()),
      ]);
      setLessons([...(active.data.lessons || []), ...(archived.data.lessons || [])]);
      setClassrooms(active.data.classrooms || archived.data.classrooms || []);
      setError("");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to load your lessons.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return lessons.filter((lesson) => {
      const matchesSearch = `${lesson.title} ${lesson.description || ""} ${lesson.lessonNumber || ""}`.toLowerCase().includes(query);
      const matchesFilter = filter === "all"
        ? !lesson.archivedAt
        : filter === "archived" ? Boolean(lesson.archivedAt) : !lesson.archivedAt && lesson.status === filter;
      return matchesSearch && matchesFilter;
    });
  }, [filter, lessons, search]);

  const create = async (values) => {
    setCreateBusy(true);
    try {
      const { data } = await axios.post(api(), {
        ...values,
        status: "draft",
        topics: [{ clientId: "first-topic", title: "Introduction", content: { format: "markdown", body: "", codeBlocks: [], practiceBlocks: [] } }],
      }, requestConfig());
      if (contextClassroomId) {
        await axios.post(api(`/${data.lesson.id}/placements`), {
          classroomId: Number(contextClassroomId),
          moduleId: contextModuleId ? Number(contextModuleId) : null,
          mode: "reuse",
        }, requestConfig());
      }
      navigate(`/teacher/lessons/${data.lesson.id}/edit`);
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || "Unable to create a lesson.");
      setCreateBusy(false);
    }
  };

  const duplicate = async (lesson) => {
    setActionBusy(`copy-${lesson.id}`);
    try {
      const { data } = await axios.post(api(`/${lesson.id}/duplicate`), {}, requestConfig());
      toast.success("Independent copy created.");
      navigate(`/teacher/lessons/${data.lesson.id}/edit`);
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || "Unable to copy the lesson.");
    } finally {
      setActionBusy("");
    }
  };

  const setArchived = async (lesson, archived) => {
    setActionBusy(`archive-${lesson.id}`);
    try {
      await axios.patch(api(`/${lesson.id}/archive`), { archived }, requestConfig());
      toast.success(archived ? "Lesson archived." : "Lesson restored.");
      await load();
    } catch {
      toast.error(`Unable to ${archived ? "archive" : "restore"} the lesson.`);
    } finally {
      setActionBusy("");
    }
  };

  const runConfirmedAction = async () => {
    if (!confirmAction) return;
    const { kind, lesson, placement } = confirmAction;
    if (kind === "delete" && lesson.usageCount > 0) return;
    setActionBusy(`${kind}-${lesson.id}`);
    try {
      if (kind === "delete") {
        await axios.delete(api(`/${lesson.id}`), requestConfig());
        toast.success("Lesson permanently deleted.");
      } else {
        await axios.delete(api(`/${lesson.id}/placements/${placement.classroomId}`), requestConfig());
        toast.success("Lesson removed from the classroom.");
      }
      setConfirmAction(null);
      await load();
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || "The action could not be completed.");
    } finally {
      setActionBusy("");
    }
  };

  const editLesson = (lesson) => {
    if (lesson.usageCount > 0) setSharedEditTarget(lesson);
    else navigate(`/teacher/lessons/${lesson.id}/edit`);
  };

  return (
    <div className={styles.shell}>
      <Sidebar />
      <main className={styles.page}>
        <header className={styles.header}>
          <div><span>Teacher content</span><h1>My Lessons</h1><p>Create structured lessons once, then reuse or copy them into your classrooms.</p></div>
          <button type="button" className={styles.primary} onClick={() => setCreating(true)}><FiPlus /> Create Lesson</button>
        </header>
        <div className={styles.content}>
          {contextClassroomId && <div className={styles.contextBanner}><FiLayers /><div><strong>Add a lesson to this {contextModuleId ? "module" : "classroom"}</strong><span>Choose a lesson below, then decide whether to reuse it or make an independent copy.</span></div></div>}
          <div className={styles.toolbar}><label><FiSearch /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search lessons…" aria-label="Search lessons" /></label><span>{filtered.length} lesson{filtered.length === 1 ? "" : "s"}</span></div>
          <div className={styles.filters} role="group" aria-label="Filter lessons">{[["all", "All"], ["draft", "Draft"], ["published", "Published"], ["scheduled", "Scheduled"], ["archived", "Archived"]].map(([value, label]) => <button key={value} type="button" className={filter === value ? styles.filterActive : ""} onClick={() => setFilter(value)}>{label}</button>)}</div>

          {loading ? (
            <div className={styles.skeletonList} aria-label="Loading lessons">{[1, 2, 3].map((item) => <div key={item} className={styles.skeletonCard}><span /><div><i /><i /><i /></div></div>)}</div>
          ) : error ? (
            <div className={styles.state}><h2>Lesson Library unavailable</h2><p>{error}</p><button type="button" onClick={load}>Try again</button></div>
          ) : filtered.length ? (
            <div className={styles.lessonList}>{filtered.map((lesson) => (
              <article className={styles.lessonCard} key={lesson.id}>
                <div className={styles.lessonIcon}><FiBookOpen /></div>
                <div className={styles.lessonCopy}>
                  <div className={styles.eyebrow}>{lesson.lessonNumber ? `Lesson ${lesson.lessonNumber}` : "Lesson"}<span className={`${styles.badge} ${styles[lesson.archivedAt ? "archived" : lesson.status]}`}>{statusLabel(lesson)}</span></div>
                  <h2>{lesson.title}</h2>
                  <p>{lesson.description || "No description yet. Open the builder to add lesson details and topics."}</p>
                  <div className={styles.meta}><span>Updated {new Date(lesson.updatedAt).toLocaleDateString()}</span><span>Used in {lesson.usageCount || 0} classroom{lesson.usageCount === 1 ? "" : "s"}</span></div>
                  {lesson.placements?.length > 0 && <details className={styles.placements}><summary>View classroom placements</summary><div>{lesson.placements.map((placement) => <span key={`${placement.classroomId}-${placement.moduleId || "root"}`}><span><strong>{placement.classroom?.className || "Classroom"}</strong>{placement.module?.title ? ` · ${placement.module.title}` : " · Standalone"}</span><button type="button" onClick={() => setConfirmAction({ kind: "placement", lesson, placement })}>Remove</button></span>)}</div></details>}
                </div>
                <div className={styles.actions}>
                  {contextClassroomId && !lesson.archivedAt && <button type="button" className={styles.primary} onClick={() => setAssigning(lesson)}><FiPlus /> Add to Class</button>}
                  {!lesson.archivedAt && <button type="button" onClick={() => editLesson(lesson)}><FiEdit2 /> Edit</button>}
                  {!lesson.archivedAt && <button type="button" onClick={() => window.open(`/lesson/classroom/${lesson.id}?teacherPreview=1`, "_blank", "noopener,noreferrer")}><FiEye /> Preview</button>}
                  {!lesson.archivedAt && <button type="button" onClick={() => setAssigning(lesson)}><FiLayers /> Assign</button>}
                  {!lesson.archivedAt && <button type="button" onClick={() => duplicate(lesson)} disabled={Boolean(actionBusy)}><FiCopy /> {actionBusy === `copy-${lesson.id}` ? "Copying…" : "Copy"}</button>}
                  <details><summary>More</summary><div>{lesson.archivedAt ? <button type="button" onClick={() => setArchived(lesson, false)} disabled={Boolean(actionBusy)}><FiRotateCcw /> Restore</button> : <button type="button" onClick={() => setArchived(lesson, true)} disabled={Boolean(actionBusy)}><FiArchive /> Archive</button>}<button type="button" className={styles.danger} disabled={lesson.usageCount > 0} title={lesson.usageCount > 0 ? "Remove all classroom placements before deleting" : undefined} onClick={() => setConfirmAction({ kind: "delete", lesson })}><FiTrash2 /> {lesson.usageCount > 0 ? "In use · cannot delete" : "Delete permanently"}</button></div></details>
                </div>
              </article>
            ))}</div>
          ) : (
            <div className={styles.empty}><FiBookOpen /><h2>{filter === "archived" ? "No archived lessons." : search ? "No lessons match your search." : "You haven’t created any lessons yet."}</h2><p>{filter === "archived" ? "Lessons you archive will remain recoverable here." : "Build a structured C# lesson, preview it, and add it to one or more classrooms."}</p>{filter !== "archived" && !search && <button type="button" className={styles.primary} onClick={() => setCreating(true)}><FiPlus /> Create Your First Lesson</button>}</div>
          )}
        </div>

        {creating && <CreateLessonDialog saving={createBusy} onClose={() => setCreating(false)} onCreate={create} />}
        {assigning && <AssignmentDialog lesson={assigning} classrooms={classrooms} initialClassroomId={contextClassroomId} initialModuleId={contextModuleId} onClose={() => setAssigning(null)} onAssigned={() => { setAssigning(null); void load(); }} />}
        <ConfirmModal open={Boolean(sharedEditTarget)} title="Edit this shared lesson?" message={sharedEditTarget ? `Changes to “${sharedEditTarget.title}” will appear in ${sharedEditTarget.usageCount === 1 ? "the classroom" : `all ${sharedEditTarget.usageCount} classrooms`} using it. Make a copy first if a class needs different content.` : ""} confirmLabel="Edit Shared Lesson" onConfirm={() => { const target = sharedEditTarget; setSharedEditTarget(null); if (target) navigate(`/teacher/lessons/${target.id}/edit`); }} onCancel={() => setSharedEditTarget(null)} />
        <ConfirmModal open={Boolean(confirmAction)} title={confirmAction?.kind === "delete" ? "Permanently delete this lesson?" : "Remove lesson from this classroom?"} message={confirmAction?.kind === "delete" ? `“${confirmAction?.lesson?.title || ""}” and its uploaded files will be deleted. This cannot be undone.` : `Students in ${confirmAction?.placement?.classroom?.className || "this classroom"} will no longer see this lesson. The lesson remains in your library.`} confirmLabel={actionBusy ? "Working…" : confirmAction?.kind === "delete" ? "Delete permanently" : "Remove from class"} danger confirmDisabled={Boolean(actionBusy)} onConfirm={runConfirmedAction} onCancel={() => !actionBusy && setConfirmAction(null)} />
      </main>
    </div>
  );
}
