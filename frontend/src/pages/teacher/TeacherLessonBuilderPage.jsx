import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { FiArrowDown, FiArrowLeft, FiArrowUp, FiCode, FiCopy, FiEye, FiImage, FiMenu, FiPaperclip, FiPlay, FiPlus, FiRefreshCw, FiSave, FiTrash2, FiUpload } from "react-icons/fi";
import Sidebar from "../../Components/SideBar/Sidebar.jsx";
import ConfirmModal from "../../Components/ConfirmModal/ConfirmModal.jsx";
import { SecureLessonImage } from "../../Components/LessonRenderer/LessonRenderer.jsx";
import { useToast } from "../../Components/Toast/ToastProvider.jsx";
import { buildApiUrl, getAuthHeaders } from "../../utils/auth.js";
import styles from "./TeacherLessonBuilderPage.module.css";

const api = (path) => buildApiUrl(`/api/teacher/lesson-library${path}`);
const makeClientId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
const emptyTopic = (number) => ({ clientId: makeClientId(), title: `Topic ${number}`, displayOrder: number - 1, content: { format: "markdown", body: "", codeBlocks: [], practiceBlocks: [] }, images: [] });
const toLocalDateTime = (value) => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";

function RichContentEditor({ value, onChange }) {
  const ref = useRef(null);
  const wrap = (before, after = before, placeholder = "text") => {
    const input = ref.current; if (!input) return;
    const start = input.selectionStart; const end = input.selectionEnd;
    const selected = value.slice(start, end) || placeholder;
    onChange(`${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`);
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(start + before.length, start + before.length + selected.length); });
  };
  const prefix = (marker) => {
    const input = ref.current; if (!input) return;
    const start = value.lastIndexOf("\n", input.selectionStart - 1) + 1;
    onChange(`${value.slice(0, start)}${marker}${value.slice(start)}`);
  };
  return <div className={styles.richEditor}>
    <div className={styles.richToolbar} aria-label="Rich text tools">
      <button type="button" onClick={() => wrap("**")}><strong>B</strong><span>Bold</span></button>
      <button type="button" onClick={() => wrap("*")}><em>I</em><span>Italic</span></button>
      <button type="button" onClick={() => prefix("## ")}><span>Heading</span></button>
      <button type="button" onClick={() => prefix("- ")}><span>Bullets</span></button>
      <button type="button" onClick={() => prefix("1. ")}><span>Numbered</span></button>
      <button type="button" onClick={() => wrap("`", "`", "inline code")}><span>Inline code</span></button>
      <button type="button" onClick={() => wrap("[", "](https://example.com)", "link text")}><span>Link</span></button>
    </div>
    <textarea ref={ref} value={value} onChange={(event) => onChange(event.target.value)} placeholder="Explain this topic. Use the toolbar for headings, emphasis, lists, links, and inline code." aria-label="Topic rich content" />
    <small>Formatting is stored as safe structured lesson text. Student pages never inject raw HTML.</small>
  </div>;
}

function TeacherTestRun({ code }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const run = async () => {
    setRunning(true); setResult(null);
    try { const { data } = await axios.post(buildApiUrl("/api/practice/run"), { code }, { headers: getAuthHeaders() }); setResult(data); }
    catch (requestError) { setResult({ success: false, stderr: requestError.response?.data?.stderr || requestError.response?.data?.message || "The compiler is unavailable. Try again shortly." }); }
    finally { setRunning(false); }
  };
  return <div className={styles.testRun}><button type="button" onClick={run} disabled={running || !code?.trim()}><FiPlay /> {running ? "Running…" : "Test Run"}</button>{result && <pre className={result.success ? styles.testSuccess : styles.testError} aria-live="polite">{result.stdout || result.stderr || (result.success ? "Program completed with no output." : "Run failed.")}</pre>}</div>;
}

function TopicEditor({ topic, index, count, dirty, dragging, dropTarget, duplicateBusy, uploadBusy, onChange, onMove, onDragStart, onDragEnd, onDragOver, onDrop, onDuplicate, onDelete, onUploadImages, onUpdateImage, onDeleteImage, onMoveImage }) {
  const [open, setOpen] = useState(true);
  const setContent = (changes) => onChange({ ...topic, content: { ...topic.content, ...changes } });
  const addCode = () => setContent({ codeBlocks: [...(topic.content.codeBlocks || []), { id: makeClientId(), title: "C# example", code: "Console.WriteLine(\"Hello, SharpRunner!\");" }] });
  const addPractice = () => setContent({ practiceBlocks: [...(topic.content.practiceBlocks || []), { id: makeClientId(), title: "Try It Yourself", prompt: "Modify the code, then run it.", starterCode: "Console.WriteLine(\"Hello!\");", expectedOutput: "Hello!" }] });
  return <article className={`${styles.topicCard} ${dragging ? styles.topicDragging : ""} ${dropTarget ? styles.topicDropTarget : ""}`} onDragOver={(event) => onDragOver(event, index)} onDrop={(event) => onDrop(event, index)}>
    <header className={styles.topicHeader}><button type="button" draggable className={styles.dragHandle} aria-label={`Drag topic ${index + 1}`} title="Drag to reorder" onDragStart={(event) => onDragStart(event, index)} onDragEnd={onDragEnd}><FiMenu /></button><div><span>Topic {index + 1}</span><strong>{topic.title || "Untitled topic"}</strong></div><div className={styles.moveButtons}><button type="button" disabled={index === 0} onClick={() => onMove(index, index - 1)} aria-label="Move topic up"><FiArrowUp /></button><button type="button" disabled={index === count - 1} onClick={() => onMove(index, index + 1)} aria-label="Move topic down"><FiArrowDown /></button><button type="button" onClick={() => setOpen((value) => !value)}>{open ? "Collapse" : "Edit"}</button></div></header>
    {open && <div className={styles.topicBody}>
      <label>Topic title<input value={topic.title} maxLength={180} onChange={(event) => onChange({ ...topic, title: event.target.value })} /></label>
      <label>Content<RichContentEditor value={topic.content?.body || ""} onChange={(body) => setContent({ body })} /></label>
      <section className={styles.blockSection}><div className={styles.blockHeading}><div><FiImage /><span>Educational images</span></div><label className={`${styles.secondaryButton} ${!topic.id || uploadBusy ? styles.disabledButton : ""}`}><FiUpload /> {uploadBusy ? "Uploading…" : "Add images"}<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple disabled={!topic.id || uploadBusy} onChange={(event) => { onUploadImages(topic, event.target.files); event.target.value = ""; }} /></label></div>
        {!topic.id && <p className={styles.helper}>Save this new topic before uploading images.</p>}
        {topic.images?.length > 0 && <div className={styles.imageGrid}>{topic.images.map((image, imageIndex) => <div className={styles.imageEditor} key={image.id}><SecureLessonImage image={image} /><label>Placement<select value={image.placement || "after"} onChange={(event) => onUpdateImage(topic, image, { placement: event.target.value })}><option value="before">Before content</option><option value="after">After content</option></select></label><label>Alt text<input value={image.altText || ""} onChange={(event) => dirty(topic, image, { altText: event.target.value })} onBlur={() => onUpdateImage(topic, image, { altText: image.altText || "" })} placeholder="Describe what students should understand" /><small>Describe meaningful images for screen readers; leave blank only when decorative.</small></label><label>Caption<input value={image.caption || ""} onChange={(event) => dirty(topic, image, { caption: event.target.value })} onBlur={() => onUpdateImage(topic, image, { caption: image.caption || "" })} placeholder="Optional caption" /></label><div><button type="button" disabled={imageIndex === 0} onClick={() => onMoveImage(topic, imageIndex, -1)}><FiArrowUp /> Earlier</button><button type="button" disabled={imageIndex === topic.images.length - 1} onClick={() => onMoveImage(topic, imageIndex, 1)}><FiArrowDown /> Later</button><button type="button" className={styles.dangerText} onClick={() => onDeleteImage(topic, image)}><FiTrash2 /> Remove</button></div></div>)}</div>}
      </section>
      {(topic.content.codeBlocks || []).map((block, blockIndex) => <section className={styles.configBlock} key={block.id}><div className={styles.blockHeading}><div><FiCode /><span>Code example {blockIndex + 1}</span></div><button type="button" className={styles.dangerText} onClick={() => setContent({ codeBlocks: topic.content.codeBlocks.filter((_, itemIndex) => itemIndex !== blockIndex) })}><FiTrash2 /> Remove</button></div><label>Label<input value={block.title} onChange={(event) => setContent({ codeBlocks: topic.content.codeBlocks.map((item, itemIndex) => itemIndex === blockIndex ? { ...item, title: event.target.value } : item) })} /></label><label>C# code<textarea className={styles.codeInput} value={block.code} onChange={(event) => setContent({ codeBlocks: topic.content.codeBlocks.map((item, itemIndex) => itemIndex === blockIndex ? { ...item, code: event.target.value } : item) })} /></label><p className={styles.helper}>Display-only example for students. Add a Try It Yourself block when the code should be runnable.</p></section>)}
      {(topic.content.practiceBlocks || []).map((block, blockIndex) => <section className={`${styles.configBlock} ${styles.practiceConfig}`} key={block.id}><div className={styles.blockHeading}><div><FiPlay /><span>Try It Yourself {blockIndex + 1}</span></div><button type="button" className={styles.dangerText} onClick={() => setContent({ practiceBlocks: topic.content.practiceBlocks.filter((_, itemIndex) => itemIndex !== blockIndex) })}><FiTrash2 /> Remove</button></div><label>Title<input value={block.title} onChange={(event) => setContent({ practiceBlocks: topic.content.practiceBlocks.map((item, itemIndex) => itemIndex === blockIndex ? { ...item, title: event.target.value } : item) })} /></label><label>Student prompt<textarea value={block.prompt} onChange={(event) => setContent({ practiceBlocks: topic.content.practiceBlocks.map((item, itemIndex) => itemIndex === blockIndex ? { ...item, prompt: event.target.value } : item) })} /></label><label>Starter C# code<textarea className={styles.codeInput} value={block.starterCode} onChange={(event) => setContent({ practiceBlocks: topic.content.practiceBlocks.map((item, itemIndex) => itemIndex === blockIndex ? { ...item, starterCode: event.target.value } : item) })} /></label><TeacherTestRun code={block.starterCode} /><label>Expected output<input value={block.expectedOutput} onChange={(event) => setContent({ practiceBlocks: topic.content.practiceBlocks.map((item, itemIndex) => itemIndex === blockIndex ? { ...item, expectedOutput: event.target.value } : item) })} /></label></section>)}
      <div className={styles.addBlocks}><button type="button" onClick={addCode}><FiCode /> Add code block</button><button type="button" onClick={addPractice}><FiPlay /> Add Try It Yourself</button></div>
      <footer className={styles.topicFooter}><button type="button" disabled={duplicateBusy} onClick={() => onDuplicate(topic)}><FiCopy /> {duplicateBusy ? "Duplicating…" : "Duplicate topic"}</button><button type="button" className={styles.dangerText} onClick={() => onDelete(topic)}><FiTrash2 /> Delete topic</button></footer>
    </div>}
  </article>;
}

export default function TeacherLessonBuilderPage() {
  const { lessonId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [lesson, setLesson] = useState(null);
  const [topics, setTopics] = useState([]);
  const [status, setStatus] = useState("draft");
  const [publishAt, setPublishAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [duplicateBusy, setDuplicateBusy] = useState(null);
  const [uploadBusy, setUploadBusy] = useState(null);
  const [resourceUploadBusy, setResourceUploadBusy] = useState(false);
  const [dragState, setDragState] = useState({ source: null, target: null });
  const revisionRef = useRef(0);
  const savePromiseRef = useRef(null);
  const dirtyRef = useRef(false);
  const draftRef = useRef({ lesson: null, topics: [], status: "draft", publishAt: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(api(`/${lessonId}`), { headers: getAuthHeaders() });
      setLesson(data.lesson); setTopics(data.lesson.topics || []); setStatus(data.lesson.status || "draft"); setPublishAt(toLocalDateTime(data.lesson.publishAt)); setError(""); setConflict(false); setDirty(false); dirtyRef.current = false;
    } catch (requestError) { setError(requestError.response?.data?.message || "Unable to load this lesson."); }
    finally { setLoading(false); }
  }, [lessonId]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    draftRef.current = { lesson, topics, status, publishAt };
  }, [lesson, topics, status, publishAt]);

  const markChanged = () => { revisionRef.current += 1; dirtyRef.current = true; setDirty(true); if (!conflict) setError(""); };
  const changeLesson = (changes) => { setLesson((current) => ({ ...current, ...changes })); markChanged(); };
  const changeTopics = (next) => { setTopics(next.map((topic, index) => ({ ...topic, displayOrder: index }))); markChanged(); };

  const saveNow = useCallback(async () => {
    if (savePromiseRef.current) {
      await savePromiseRef.current;
      return dirtyRef.current ? saveNow() : draftRef.current.lesson;
    }
    const snapshot = draftRef.current;
    if (!snapshot.lesson || !dirtyRef.current) return snapshot.lesson;
    if (!snapshot.lesson.title?.trim()) {
      const message = "Add a lesson title before saving or previewing.";
      setError(message);
      toast.error(message);
      throw new Error(message);
    }
    const revision = revisionRef.current;
    const payload = {
      title: snapshot.lesson.title,
      lessonNumber: snapshot.lesson.lessonNumber,
      description: snapshot.lesson.description || "",
      externalUrl: snapshot.lesson.externalUrl || "",
      status: snapshot.status,
      publishAt: snapshot.status === "scheduled" && snapshot.publishAt ? new Date(snapshot.publishAt).toISOString() : null,
      version: snapshot.lesson.version,
      topics: snapshot.topics,
    };
    setSaving(true); setError("");
    const task = (async () => {
      try {
        const { data } = await axios.put(api(`/${snapshot.lesson.id}`), payload, { headers: getAuthHeaders() });
        const unchanged = revision === revisionRef.current;
        draftRef.current = {
          ...draftRef.current,
          lesson: unchanged ? data.lesson : { ...draftRef.current.lesson, version: data.lesson.version },
          topics: unchanged ? (data.lesson.topics || []) : draftRef.current.topics,
        };
        setLesson((current) => unchanged ? data.lesson : { ...current, version: data.lesson.version });
        if (unchanged) {
          setTopics(data.lesson.topics || []);
          dirtyRef.current = false;
          setDirty(false);
        }
        setSavedAt(new Date());
        setConflict(false);
        return data.lesson;
      } catch (requestError) {
        const isConflict = requestError.response?.status === 409;
        const message = isConflict ? "This lesson changed in another tab or session. Reload the latest version before continuing." : requestError.response?.data?.message || "Your lesson could not be saved. Your changes are still in this editor—retry when ready.";
        setConflict(isConflict); setError(message); toast.error(message); throw requestError;
      }
    })();
    savePromiseRef.current = task;
    try { return await task; }
    finally {
      if (savePromiseRef.current === task) savePromiseRef.current = null;
      setSaving(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!dirty || saving || error || !lesson?.title?.trim()) return undefined;
    const timer = window.setTimeout(() => { void saveNow().catch(() => undefined); }, 1200);
    return () => window.clearTimeout(timer);
  }, [dirty, error, saving, lesson?.title, topics, status, publishAt, saveNow]);
  useEffect(() => {
    const protect = (event) => { if (dirty || saving) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", protect); return () => window.removeEventListener("beforeunload", protect);
  }, [dirty, saving]);
  useEffect(() => {
    if (!dirty && !saving) return undefined;
    const protectInternalNavigation = (event) => {
      const link = event.target.closest?.("a[href]");
      if (!link || link.target === "_blank" || event.defaultPrevented) return;
      if (!window.confirm("This lesson still has unsaved changes. Leave the Lesson Builder?")) event.preventDefault();
    };
    document.addEventListener("click", protectInternalNavigation, true);
    return () => document.removeEventListener("click", protectInternalNavigation, true);
  }, [dirty, saving]);

  const flush = async () => {
    while (savePromiseRef.current || dirtyRef.current) await saveNow();
    return draftRef.current.lesson;
  };
  const moveTopic = (source, target) => { if (source === target || target < 0 || target >= topics.length) return; const next = [...topics]; const [item] = next.splice(source, 1); next.splice(target, 0, item); changeTopics(next); };
  const updateTopic = (index, next) => changeTopics(topics.map((topic, itemIndex) => itemIndex === index ? next : topic));
  const duplicateTopic = async (topic) => {
    if (!topic.id) { const index = topics.indexOf(topic); changeTopics([...topics.slice(0, index + 1), { ...topic, id: null, clientId: makeClientId(), title: `${topic.title} — Copy`, images: [] }, ...topics.slice(index + 1)]); return; }
    setDuplicateBusy(topic.id);
    try { await flush(); const { data } = await axios.post(api(`/${lesson.id}/topics/${topic.id}/duplicate`), {}, { headers: getAuthHeaders() }); setLesson(data.lesson); setTopics(data.lesson.topics); setDirty(false); dirtyRef.current = false; toast.success("Topic duplicated."); } catch { /* toast handled */ }
    finally { setDuplicateBusy(null); }
  };
  const deleteTopic = (topic) => setConfirmAction({ kind: "topic", topic });
  const uploadImages = async (topic, files) => {
    if (!files?.length) return;
    const payload = new FormData(); [...files].forEach((file) => payload.append("files", file)); payload.append("placement", "after");
    setUploadBusy(topic.id);
    try { const { data } = await axios.post(api(`/${lesson.id}/topics/${topic.id}/images`), payload, { headers: getAuthHeaders() }); setLesson((current) => ({ ...current, version: data.version })); setTopics((current) => current.map((item) => item.id === topic.id ? { ...item, images: [...(item.images || []), ...data.images] } : item)); toast.success("Images added."); } catch (requestError) { toast.error(requestError.response?.data?.message || "Image upload failed."); }
    finally { setUploadBusy(null); }
  };
  const dirtyImage = (topic, image, changes) => setTopics((current) => current.map((item) => item.id === topic.id ? { ...item, images: item.images.map((entry) => entry.id === image.id ? { ...entry, ...changes } : entry) } : item));
  const updateImage = async (topic, image, changes) => { dirtyImage(topic, image, changes); try { await axios.patch(api(`/${lesson.id}/topics/${topic.id}/images/${image.id}`), { ...image, ...changes }, { headers: getAuthHeaders() }); } catch { toast.error("Unable to update the image."); } };
  const deleteImage = (topic, image) => setConfirmAction({ kind: "image", topic, image });
  const moveImage = async (topic, index, direction) => { const target = index + direction; if (target < 0 || target >= topic.images.length) return; const images = [...topic.images]; [images[index], images[target]] = [images[target], images[index]]; images.forEach((image, displayOrder) => { image.displayOrder = displayOrder; }); setTopics((current) => current.map((item) => item.id === topic.id ? { ...item, images } : item)); try { await Promise.all(images.map((image) => axios.patch(api(`/${lesson.id}/topics/${topic.id}/images/${image.id}`), { ...image, displayOrder: image.displayOrder }, { headers: getAuthHeaders() }))); } catch { toast.error("Unable to reorder images."); } };
  const uploadResources = async (files) => { if (!files?.length) return; const payload = new FormData(); [...files].forEach((file) => payload.append("files", file)); setResourceUploadBusy(true); try { const { data } = await axios.post(api(`/${lesson.id}/attachments`), payload, { headers: getAuthHeaders() }); setLesson(data.lesson); toast.success("Resources added."); } catch (requestError) { toast.error(requestError.response?.data?.message || "Upload failed."); } finally { setResourceUploadBusy(false); } };
  const deleteResource = (file) => setConfirmAction({ kind: "resource", file });

  const runConfirmedAction = async () => {
    if (!confirmAction) return;
    setActionBusy(true);
    try {
      if (confirmAction.kind === "topic") changeTopics(topics.filter((item) => item !== confirmAction.topic));
      if (confirmAction.kind === "image") { const { data } = await axios.delete(api(`/${lesson.id}/topics/${confirmAction.topic.id}/images/${confirmAction.image.id}`), { headers: getAuthHeaders() }); setLesson((current) => ({ ...current, version: data.version })); setTopics((current) => current.map((item) => item.id === confirmAction.topic.id ? { ...item, images: item.images.filter((entry) => entry.id !== confirmAction.image.id) } : item)); }
      if (confirmAction.kind === "resource") { const { data } = await axios.delete(api(`/${lesson.id}/attachments/${confirmAction.file.id}`), { headers: getAuthHeaders() }); setLesson((current) => ({ ...current, version: data.version, attachments: current.attachments.filter((item) => item.id !== confirmAction.file.id) })); toast.success("Resource removed."); }
      setConfirmAction(null);
    } catch (requestError) { toast.error(requestError.response?.data?.message || "Unable to remove this item."); }
    finally { setActionBusy(false); }
  };

  const preview = async () => {
    const previewWindow = window.open("about:blank", "_blank");
    if (previewWindow) previewWindow.opener = null;
    try {
      await flush();
      if (previewWindow) previewWindow.location.replace(`/lesson/classroom/${lesson.id}?teacherPreview=1`);
      else toast.error("Allow pop-ups to open the student preview.");
    } catch {
      previewWindow?.close();
    }
  };
  const saveAndNotify = async () => { try { await saveNow(); toast.success("Draft saved."); } catch { /* handled */ } };
  const leaveBuilder = async () => { try { await flush(); navigate("/teacher/lessons"); } catch { if (window.confirm("Your latest changes could not be saved. Leave anyway?")) navigate("/teacher/lessons"); } };

  if (loading) return <div className={styles.shell}><Sidebar /><main className={styles.status}>Loading Lesson Builder…</main></div>;
  if (error && !lesson) return <div className={styles.shell}><Sidebar /><main className={styles.status}><h1>Lesson unavailable</h1><p>{error}</p><button type="button" onClick={() => navigate("/teacher/lessons")}>Back to lessons</button></main></div>;
  return <div className={styles.shell}><Sidebar /><main className={styles.page}>
    <header className={styles.builderHeader}><button type="button" onClick={leaveBuilder}><FiArrowLeft /> Lessons</button><div><span>Lesson Builder</span><strong>{saving ? "Saving…" : error && dirty ? "Save failed — changes retained" : dirty ? "Unsaved changes" : savedAt ? "Saved just now" : status === "scheduled" && publishAt ? `Scheduled · ${new Date(publishAt).toLocaleString()}` : status}</strong></div><div className={styles.headerActions}><button type="button" onClick={preview}><FiEye /> Preview as Student</button><button type="button" className={styles.primaryButton} onClick={saveAndNotify} disabled={saving || !dirty}><FiSave /> {saving ? "Saving…" : error && dirty ? "Retry Save" : "Save"}</button></div></header>
    <div className={styles.builderWidth}>
      {error && <div className={styles.error}><span>{error}</span>{conflict && <button type="button" onClick={load}><FiRefreshCw /> Reload latest version</button>}</div>}
      {lesson.usageCount > 0 && <div className={styles.sharedNotice}>This lesson is currently used in {lesson.usageCount} classroom{lesson.usageCount === 1 ? "" : "s"}. Saved content changes will appear in every classroom using it.</div>}
      <section className={styles.metadata}><div className={styles.lessonNumber}><label>Lesson number<input type="number" min="1" max="9999" value={lesson.lessonNumber || ""} onChange={(event) => changeLesson({ lessonNumber: event.target.value })} placeholder="4" /></label></div><label className={styles.titleField}>Lesson title<input value={lesson.title} maxLength={160} onChange={(event) => changeLesson({ title: event.target.value })} placeholder="Loops in C#" /></label><label className={styles.fullField}>Short description<textarea value={lesson.description || ""} maxLength={4000} onChange={(event) => changeLesson({ description: event.target.value })} placeholder="What will students learn in this lesson?" /></label></section>
      <section className={styles.topicsSection}><div className={styles.sectionHeading}><div><span>Lesson content</span><h1>Topics</h1><p>Topics are the movable sections students see in their lesson navigation.</p></div><button type="button" className={styles.primaryButton} onClick={() => changeTopics([...topics, emptyTopic(topics.length + 1)])}><FiPlus /> Add Topic</button></div>
        {topics.length ? <div className={styles.topicList}>{topics.map((topic, index) => <TopicEditor key={topic.id || topic.clientId} topic={topic} index={index} count={topics.length} dirty={dirtyImage} dragging={dragState.source === index} dropTarget={dragState.target === index && dragState.source !== index} duplicateBusy={duplicateBusy === topic.id} uploadBusy={uploadBusy === topic.id} onChange={(next) => updateTopic(index, next)} onMove={moveTopic} onDragStart={(event, source) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/topic-index", String(source)); setDragState({ source, target: source }); }} onDragEnd={() => setDragState({ source: null, target: null })} onDragOver={(event, target) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; if (dragState.target !== target) setDragState((current) => ({ ...current, target })); }} onDrop={(event, target) => { event.preventDefault(); const source = Number(event.dataTransfer.getData("text/topic-index")); if (Number.isInteger(source)) moveTopic(source, target); setDragState({ source: null, target: null }); }} onDuplicate={duplicateTopic} onDelete={deleteTopic} onUploadImages={uploadImages} onUpdateImage={updateImage} onDeleteImage={deleteImage} onMoveImage={moveImage} />)}</div> : <div className={styles.emptyTopics}><FiPaperclip /><h2>Start with your first topic</h2><p>Organize the lesson into clear sections such as Introduction, For Loop, and While Loop.</p><button type="button" className={styles.primaryButton} onClick={() => changeTopics([emptyTopic(1)])}><FiPlus /> Add Topic</button></div>}
      </section>
      <section className={styles.resourcesPanel}><div><h2>Additional resources</h2><p>Optional PDFs, documents, slides, media, or handouts.</p></div><label className={`${styles.secondaryButton} ${resourceUploadBusy ? styles.disabledButton : ""}`}><FiUpload /> {resourceUploadBusy ? "Uploading…" : "Add files"}<input type="file" multiple disabled={resourceUploadBusy} onChange={(event) => { uploadResources(event.target.files); event.target.value = ""; }} /></label>{lesson.attachments?.length > 0 && <div className={styles.resourceList}>{lesson.attachments.map((file) => <span key={file.id}><FiPaperclip /> {file.originalName}<button type="button" aria-label={`Remove ${file.originalName}`} onClick={() => deleteResource(file)}><FiTrash2 /></button></span>)}</div>}</section>
      <section className={styles.publication}><div><span>Publication</span><h2>Choose when students can access this lesson</h2></div><div className={styles.publicationChoices}>{[["draft", "Save as Draft", "Only you and administrators can open it."], ["published", "Publish Now", "Students in assigned classrooms can access it immediately."], ["scheduled", "Schedule", "Students receive access at the selected date and time."]].map(([value, title, copy]) => <label key={value} className={status === value ? styles.choiceActive : ""}><input type="radio" name="status" checked={status === value} onChange={() => { setStatus(value); markChanged(); }} /><span><strong>{title}</strong><small>{copy}</small></span></label>)}</div>{status === "scheduled" && <label className={styles.scheduleField}>Release date and time<input type="datetime-local" value={publishAt} onChange={(event) => { setPublishAt(event.target.value); markChanged(); }} /></label>}
        <div className={styles.publishActions}><button type="button" onClick={preview}><FiEye /> Preview as Student</button><button type="button" className={styles.primaryButton} onClick={saveAndNotify} disabled={saving}><FiSave /> {status === "published" ? "Publish Lesson" : status === "scheduled" ? "Schedule Lesson" : "Save Draft"}</button></div>
      </section>
    </div>
    <ConfirmModal open={Boolean(confirmAction)} title={confirmAction?.kind === "topic" ? "Delete this topic?" : confirmAction?.kind === "image" ? "Remove this image?" : "Remove this resource?"} message={confirmAction?.kind === "topic" ? `“${confirmAction?.topic?.title || "Untitled topic"}” and its content will be removed when the lesson saves.` : confirmAction?.kind === "image" ? "The image will be permanently removed from this lesson." : `${confirmAction?.file?.originalName || "This file"} will be permanently removed.`} confirmLabel={actionBusy ? "Removing…" : "Remove"} danger confirmDisabled={actionBusy} onConfirm={runConfirmedAction} onCancel={() => !actionBusy && setConfirmAction(null)} />
  </main></div>;
}
