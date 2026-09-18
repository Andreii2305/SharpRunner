import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { FiArrowLeft, FiEye, FiPaperclip, FiPlus, FiRefreshCw, FiSave, FiTrash2, FiUpload } from "react-icons/fi";
import Sidebar from "../../Components/SideBar/Sidebar.jsx";
import ConfirmModal from "../../Components/ConfirmModal/ConfirmModal.jsx";
import { useToast } from "../../Components/Toast/ToastProvider.jsx";
import { buildApiUrl, getAuthHeaders } from "../../utils/auth.js";
import { createBlock, prepareTopicsForEditing, removeBlock } from "../../utils/lessonBlocks.js";
import OrderedTopicEditor from "./OrderedTopicEditor.jsx";
import styles from "./TeacherLessonBuilderPage.module.css";

const api = (path) => buildApiUrl(`/api/teacher/lesson-library${path}`);
const makeClientId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
const emptyTopic = (number) => ({ clientId: makeClientId(), title: `Topic ${number}`, displayOrder: number - 1, content: { format: "markdown", blocks: [createBlock("content", makeClientId())] }, images: [] });
const toLocalDateTime = (value) => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";

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
      const editableTopics = prepareTopicsForEditing(data.lesson.topics || []);
      setLesson(data.lesson); setTopics(editableTopics); setStatus(data.lesson.status || "draft"); setPublishAt(toLocalDateTime(data.lesson.publishAt)); setError(""); setConflict(false); setDirty(false); dirtyRef.current = false;
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
          topics: unchanged ? prepareTopicsForEditing(data.lesson.topics || []) : draftRef.current.topics,
        };
        setLesson((current) => unchanged ? data.lesson : { ...current, version: data.lesson.version });
        if (unchanged) {
          setTopics(prepareTopicsForEditing(data.lesson.topics || []));
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
    try { await flush(); const { data } = await axios.post(api(`/${lesson.id}/topics/${topic.id}/duplicate`), {}, { headers: getAuthHeaders() }); setLesson(data.lesson); setTopics(prepareTopicsForEditing(data.lesson.topics)); setDirty(false); dirtyRef.current = false; toast.success("Topic duplicated."); } catch { /* toast handled */ }
    finally { setDuplicateBusy(null); }
  };
  const deleteTopic = (topic) => setConfirmAction({ kind: "topic", topic });
  const uploadImage = async (topic, block, file) => {
    if (!file) return;
    setUploadBusy(block.id);
    try {
      await flush();
      const currentTopic = draftRef.current.topics.find((item) => item.id === topic.id || item.content?.blocks?.some((itemBlock) => itemBlock.id === block.id));
      if (!currentTopic?.id) throw new Error("Save the topic before uploading its image.");
      const payload = new FormData(); payload.append("files", file); payload.append("placement", "after");
      const { data } = await axios.post(api(`/${draftRef.current.lesson.id}/topics/${currentTopic.id}/images`), payload, { headers: getAuthHeaders() });
      const image = data.images[0];
      const nextTopics = draftRef.current.topics.map((item) => item.id === currentTopic.id ? {
        ...item,
        images: [...(item.images || []), image],
        content: { ...item.content, blocks: item.content.blocks.map((itemBlock) => itemBlock.id === block.id ? { ...itemBlock, imageId: image.id } : itemBlock) },
      } : item);
      const nextLesson = { ...draftRef.current.lesson, version: data.version };
      draftRef.current = { ...draftRef.current, lesson: nextLesson, topics: nextTopics };
      setLesson((current) => ({ ...current, version: data.version })); setTopics(nextTopics); markChanged(); toast.success("Image added.");
    } catch (requestError) { toast.error(requestError.response?.data?.message || requestError.message || "Image upload failed."); }
    finally { setUploadBusy(null); }
  };
  const dirtyImage = (topic, image, changes) => setTopics((current) => current.map((item) => item.id === topic.id ? { ...item, images: item.images.map((entry) => entry.id === image.id ? { ...entry, ...changes } : entry) } : item));
  const updateImage = async (topic, image, changes) => { dirtyImage(topic, image, changes); try { await axios.patch(api(`/${lesson.id}/topics/${topic.id}/images/${image.id}`), { ...image, ...changes }, { headers: getAuthHeaders() }); } catch { toast.error("Unable to update the image."); } };
  const deleteBlock = (topic, block) => setConfirmAction({ kind: "block", topic, block });
  const uploadResources = async (files) => { if (!files?.length) return; const payload = new FormData(); [...files].forEach((file) => payload.append("files", file)); setResourceUploadBusy(true); try { const { data } = await axios.post(api(`/${lesson.id}/attachments`), payload, { headers: getAuthHeaders() }); setLesson(data.lesson); toast.success("Resources added."); } catch (requestError) { toast.error(requestError.response?.data?.message || "Upload failed."); } finally { setResourceUploadBusy(false); } };
  const deleteResource = (file) => setConfirmAction({ kind: "resource", file });

  const runConfirmedAction = async () => {
    if (!confirmAction) return;
    setActionBusy(true);
    try {
      if (confirmAction.kind === "topic") changeTopics(topics.filter((item) => item !== confirmAction.topic));
      if (confirmAction.kind === "block") {
        const { topic, block } = confirmAction;
        const image = block.type === "image" ? (topic.images || []).find((item) => Number(item.id) === Number(block.imageId)) : null;
        if (image) {
          await flush();
          const currentTopic = draftRef.current.topics.find((item) => item.id === topic.id);
          const { data } = await axios.delete(api(`/${draftRef.current.lesson.id}/topics/${currentTopic.id}/images/${image.id}`), { headers: getAuthHeaders() });
          const nextTopics = draftRef.current.topics.map((item) => item.id === currentTopic.id ? { ...item, images: item.images.filter((entry) => entry.id !== image.id), content: { ...item.content, blocks: removeBlock(item.content.blocks, block.id) } } : item);
          const nextLesson = { ...draftRef.current.lesson, version: data.version };
          draftRef.current = { ...draftRef.current, lesson: nextLesson, topics: nextTopics };
          setLesson((current) => ({ ...current, version: data.version })); setTopics(nextTopics); markChanged();
        } else {
          changeTopics(topics.map((item) => (item.id || item.clientId) === (topic.id || topic.clientId) ? { ...item, content: { ...item.content, blocks: removeBlock(item.content.blocks, block.id) } } : item));
        }
      }
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
        {topics.length ? <div className={styles.topicList}>{topics.map((topic, index) => <OrderedTopicEditor key={topic.id || topic.clientId} topic={topic} index={index} count={topics.length} dirty={dirtyImage} dragging={dragState.source === index} dropTarget={dragState.target === index && dragState.source !== index} duplicateBusy={duplicateBusy === topic.id} uploadBusy={uploadBusy} onChange={(next) => updateTopic(index, next)} onMove={moveTopic} onDragStart={(event, source) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-sharprunner-topic", String(source)); setDragState({ source, target: source }); }} onDragEnd={() => setDragState({ source: null, target: null })} onDragOver={(event, target) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; if (dragState.target !== target) setDragState((current) => ({ ...current, target })); }} onDrop={(event, target) => { event.preventDefault(); const source = Number(event.dataTransfer.getData("application/x-sharprunner-topic")); if (Number.isInteger(source)) moveTopic(source, target); setDragState({ source: null, target: null }); }} onDuplicate={duplicateTopic} onDelete={deleteTopic} onUploadImage={uploadImage} onUpdateImage={updateImage} onDeleteBlock={deleteBlock} />)}</div> : <div className={styles.emptyTopics}><FiPaperclip /><h2>Start with your first topic</h2><p>Organize the lesson into clear sections such as Introduction, For Loop, and While Loop.</p><button type="button" className={styles.primaryButton} onClick={() => changeTopics([emptyTopic(1)])}><FiPlus /> Add Topic</button></div>}
      </section>
      <section className={styles.resourcesPanel}><div><h2>Additional resources</h2><p>Optional PDFs, documents, slides, media, or handouts.</p></div><label className={`${styles.secondaryButton} ${resourceUploadBusy ? styles.disabledButton : ""}`}><FiUpload /> {resourceUploadBusy ? "Uploading…" : "Add files"}<input type="file" multiple disabled={resourceUploadBusy} onChange={(event) => { uploadResources(event.target.files); event.target.value = ""; }} /></label>{lesson.attachments?.length > 0 && <div className={styles.resourceList}>{lesson.attachments.map((file) => <span key={file.id}><FiPaperclip /> {file.originalName}<button type="button" aria-label={`Remove ${file.originalName}`} onClick={() => deleteResource(file)}><FiTrash2 /></button></span>)}</div>}</section>
      <section className={styles.publication}><div><span>Publication</span><h2>Choose when students can access this lesson</h2></div><div className={styles.publicationChoices}>{[["draft", "Save as Draft", "Only you and administrators can open it."], ["published", "Publish Now", "Students in assigned classrooms can access it immediately."], ["scheduled", "Schedule", "Students receive access at the selected date and time."]].map(([value, title, copy]) => <label key={value} className={status === value ? styles.choiceActive : ""}><input type="radio" name="status" checked={status === value} onChange={() => { setStatus(value); markChanged(); }} /><span><strong>{title}</strong><small>{copy}</small></span></label>)}</div>{status === "scheduled" && <label className={styles.scheduleField}>Release date and time<input type="datetime-local" value={publishAt} onChange={(event) => { setPublishAt(event.target.value); markChanged(); }} /></label>}
        <div className={styles.publishActions}><button type="button" onClick={preview}><FiEye /> Preview as Student</button><button type="button" className={styles.primaryButton} onClick={saveAndNotify} disabled={saving}><FiSave /> {status === "published" ? "Publish Lesson" : status === "scheduled" ? "Schedule Lesson" : "Save Draft"}</button></div>
      </section>
    </div>
    <ConfirmModal open={Boolean(confirmAction)} title={confirmAction?.kind === "topic" ? "Delete this topic?" : confirmAction?.kind === "block" ? "Delete this block?" : "Remove this resource?"} message={confirmAction?.kind === "topic" ? `“${confirmAction?.topic?.title || "Untitled topic"}” and its content will be removed when the lesson saves.` : confirmAction?.kind === "block" ? `This ${confirmAction?.block?.type === "practice" ? "Try It Yourself" : confirmAction?.block?.type || "lesson"} block will be removed from the topic${confirmAction?.block?.type === "image" && confirmAction?.block?.imageId ? " and its uploaded image will be permanently deleted" : ""}.` : `${confirmAction?.file?.originalName || "This file"} will be permanently removed.`} confirmLabel={actionBusy ? "Removing…" : "Remove"} danger confirmDisabled={actionBusy} onConfirm={runConfirmedAction} onCancel={() => !actionBusy && setConfirmAction(null)} />
  </main></div>;
}
