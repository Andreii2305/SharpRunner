import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FiArrowDown, FiArrowUp, FiCheck, FiEye, FiPlus, FiSave, FiTrash2 } from "react-icons/fi";
import Sidebar from "../../../Components/SideBar/Sidebar.jsx";
import ConfirmModal from "../../../Components/ConfirmModal/ConfirmModal.jsx";
import {
  createTeacherAssessment, deleteTeacherAssessment, listTeacherAssessments,
  listTeacherClassrooms, loadTeacherAssessment, normalizeTeacherAssessmentError,
  publishTeacherAssessment, saveTeacherAssessment, unpublishTeacherAssessment,
} from "../../../services/teacherAssessmentService.js";
import {
  ACADEMIC_LESSONS, addChoice, addQuestion, assessmentStatus, buildSaveGraph,
  hydrateAssessmentDraft, moveChoice, moveQuestion, publishIssues, removeChoice,
  removeQuestion, selectCorrectChoice, updateQuestionType,
} from "./teacherAssessmentBuilderState.js";
import styles from "./TeacherAssessmentBuilderPage.module.css";

const emptySlots = () => ({ PRE: { exists: false }, POST: { exists: false } });

function Status({ summary }) {
  const label = assessmentStatus(summary);
  return <span className={`${styles.status} ${styles[`status${label.replaceAll(" ", "")}`]}`}>{label}</span>;
}

function PreviewDialog({ draft, onClose }) {
  return <div className={styles.backdrop} onClick={onClose}>
    <section className={styles.previewDialog} role="dialog" aria-modal="true" aria-labelledby="assessment-preview-title" onClick={(event) => event.stopPropagation()}>
      <header><div><span>Teacher Preview</span><h2 id="assessment-preview-title">{draft.title || "Untitled assessment"}</h2></div><button type="button" onClick={onClose} aria-label="Close preview">×</button></header>
      {draft.instructions && <p>{draft.instructions}</p>}
      {draft.questions.length ? draft.questions.map((question, index) => <article key={question.clientId}>
        <h3>{index + 1}. {question.questionText || "Untitled question"} <small>{question.points} point{Number(question.points) === 1 ? "" : "s"}</small></h3>
        <ul>{question.choices.map((choice) => <li key={choice.clientId} className={choice.isCorrect ? styles.correctPreview : ""}>{choice.choiceText || "Empty choice"}{choice.isCorrect && <strong><FiCheck /> Correct answer</strong>}</li>)}</ul>
        {question.explanation && <p><b>Explanation:</b> {question.explanation}</p>}
      </article>) : <p>No questions in this draft.</p>}
      <footer><button type="button" onClick={onClose}>Close preview</button></footer>
    </section>
  </div>;
}

function QuestionEditor({ question, index, count, disabled, onChange, onMove, onRemove }) {
  const replace = (changes) => onChange({ ...question, ...changes });
  const updateChoice = (choiceId, changes) => replace({ choices: question.choices.map((item) => item.clientId === choiceId ? { ...item, ...changes } : item) });
  return <article className={styles.questionCard}>
    <header><div><span>Question {index + 1}</span><Status summary={{ exists: true, published: false }} /></div><div className={styles.iconActions}>
      <button type="button" disabled={disabled || index === 0} onClick={() => onMove(-1)} aria-label={`Move question ${index + 1} up`} title="Move question up"><FiArrowUp /></button>
      <button type="button" disabled={disabled || index === count - 1} onClick={() => onMove(1)} aria-label={`Move question ${index + 1} down`} title="Move question down"><FiArrowDown /></button>
      <button type="button" disabled={disabled} onClick={onRemove} aria-label={`Remove question ${index + 1}`} className={styles.dangerIcon}><FiTrash2 /></button>
    </div></header>
    <div className={styles.fieldGrid}>
      <label className={styles.wide}>Question text<textarea disabled={disabled} value={question.questionText} onChange={(event) => replace({ questionText: event.target.value })} /></label>
      <label>Question type<select disabled={disabled} value={question.questionType} onChange={(event) => onChange(null, event.target.value)}><option value="MULTIPLE_CHOICE">Multiple choice</option><option value="TRUE_FALSE">True / False</option></select></label>
      <label>Points<input disabled={disabled} type="number" min="0.01" step="0.01" value={question.points} onChange={(event) => replace({ points: event.target.value })} /></label>
      <label>Objective key <small>optional, lowercase kebab-case</small><input disabled={disabled} value={question.objectiveKey} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" onChange={(event) => replace({ objectiveKey: event.target.value })} /></label>
      <label className={styles.wide}>Explanation <small>shown only under the configured review policy</small><textarea disabled={disabled} value={question.explanation} onChange={(event) => replace({ explanation: event.target.value })} /></label>
    </div>
    <fieldset disabled={disabled} className={styles.choiceFieldset}><legend>Answer choices</legend>
      {question.choices.map((choice, choiceIndex) => <div className={styles.choiceRow} key={choice.clientId}>
        <input type="radio" name={`correct-${question.clientId}`} checked={choice.isCorrect} onChange={() => replace({ choices: selectCorrectChoice([question], question.clientId, choice.clientId)[0].choices })} aria-label={`Mark choice ${choiceIndex + 1} correct`} />
        <label><span>Choice {choiceIndex + 1}</span><input value={choice.choiceText} readOnly={question.questionType === "TRUE_FALSE"} onChange={(event) => updateChoice(choice.clientId, { choiceText: event.target.value })} /></label>
        <button type="button" disabled={choiceIndex === 0} onClick={() => replace({ choices: moveChoice([question], question.clientId, choiceIndex, -1)[0].choices })} aria-label={`Move choice ${choiceIndex + 1} up`} title="Move choice up"><FiArrowUp /></button>
        <button type="button" disabled={choiceIndex === question.choices.length - 1} onClick={() => replace({ choices: moveChoice([question], question.clientId, choiceIndex, 1)[0].choices })} aria-label={`Move choice ${choiceIndex + 1} down`} title="Move choice down"><FiArrowDown /></button>
        {question.questionType === "MULTIPLE_CHOICE" && <button type="button" disabled={question.choices.length <= 2} onClick={() => replace({ choices: removeChoice([question], question.clientId, choice.clientId)[0].choices })} aria-label={`Remove choice ${choiceIndex + 1}`}><FiTrash2 /></button>}
      </div>)}
      {question.questionType === "MULTIPLE_CHOICE" && <button type="button" className={styles.secondaryButton} disabled={question.choices.length >= 10} onClick={() => replace({ choices: addChoice([question], question.clientId)[0].choices })}><FiPlus /> Add choice</button>}
    </fieldset>
  </article>;
}

export default function TeacherAssessmentBuilderPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const classroomId = searchParams.get("classroomId") || "";
  const lessonKey = searchParams.get("lessonKey") || "";
  const [classrooms, setClassrooms] = useState([]);
  const [slots, setSlots] = useState(emptySlots);
  const [activeType, setActiveType] = useState("PRE");
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState("saved");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const requestId = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    listTeacherClassrooms({ signal: controller.signal }).then((payload) => setClassrooms(payload.classrooms ?? [])).catch((source) => {
      if (source?.code !== "ERR_CANCELED") setError(normalizeTeacherAssessmentError(source).message);
    });
    return () => controller.abort();
  }, []);

  const loadSlots = useCallback(async ({ preserveDraft = false } = {}) => {
    const id = ++requestId.current;
    if (!preserveDraft) setDraft(null);
    setSlots(emptySlots());
    if (!classroomId || !lessonKey) return;
    setLoading(true); setError("");
    try {
      const payload = await listTeacherAssessments({ classroomId, lessonKey });
      if (id !== requestId.current) return;
      setSlots(payload.assessments ?? emptySlots());
    } catch (source) {
      if (id === requestId.current) setError(normalizeTeacherAssessmentError(source).message);
    } finally { if (id === requestId.current) setLoading(false); }
  }, [classroomId, lessonKey]);
  useEffect(() => { loadSlots(); }, [loadSlots]);

  useEffect(() => {
    const beforeUnload = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    const guardLink = (event) => {
      const link = event.target.closest?.("a[href]");
      if (dirty && link && !window.confirm("Discard unsaved assessment changes?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", guardLink, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", guardLink, true); };
  }, [dirty]);

  const guard = (action) => {
    if (!dirty || window.confirm("Discard unsaved assessment changes?")) action();
  };
  const updateRoute = (next) => guard(() => {
    setDirty(false); setDraft(null);
    setSearchParams({ ...(next.classroomId ? { classroomId: next.classroomId } : {}), ...(next.lessonKey ? { lessonKey: next.lessonKey } : {}) });
  });

  const openType = async (type) => guard(async () => {
    setActiveType(type); setError(""); setDraft(null); setDirty(false);
    const summary = slots[type];
    if (!summary?.exists) return;
    const id = ++requestId.current;
    setLoading(true);
    try {
      const payload = await loadTeacherAssessment({ classroomId, assessmentId: summary.id });
      if (id === requestId.current) setDraft(hydrateAssessmentDraft(payload.assessment));
    } catch (source) { if (id === requestId.current) setError(normalizeTeacherAssessmentError(source).message); }
    finally { if (id === requestId.current) setLoading(false); }
  });

  const create = async (type) => {
    setError(""); setLoading(true);
    const lessonTitle = ACADEMIC_LESSONS.find((lesson) => lesson.key === lessonKey)?.title ?? "Lesson";
    try {
      const payload = await createTeacherAssessment({ classroomId, lessonKey, type, title: `${lessonTitle} ${type === "PRE" ? "Pre-Test" : "Post-Test"}` });
      setActiveType(type); setDraft(hydrateAssessmentDraft(payload.assessment)); setDirty(false);
      await loadSlots({ preserveDraft: true });
    } catch (source) { setError(normalizeTeacherAssessmentError(source).message); }
    finally { setLoading(false); }
  };

  const changeDraft = (transform) => {
    setDraft((current) => typeof transform === "function" ? transform(current) : { ...current, ...transform });
    setDirty(true); setSaveState("unsaved"); setError("");
  };
  const save = async () => {
    if (!draft || draft.structureLocked) return;
    setSaveState("saving"); setError("");
    try {
      const payload = await saveTeacherAssessment({ classroomId, assessmentId: draft.id, graph: buildSaveGraph(draft) });
      setDraft(hydrateAssessmentDraft(payload.assessment)); setDirty(false); setSaveState("saved");
      await loadSlots({ preserveDraft: true });
    } catch (source) { setSaveState("error"); setError(normalizeTeacherAssessmentError(source).message); }
  };

  const runAction = async () => {
    const actionName = confirmAction;
    setConfirmAction(null); setError(""); setLoading(true);
    try {
      if (actionName === "publish") {
        const payload = await publishTeacherAssessment({ classroomId, assessmentId: draft.id, version: draft.version });
        setDraft((current) => ({ ...current, ...payload.assessment, isPublished: true }));
      } else if (actionName === "unpublish") {
        const payload = await unpublishTeacherAssessment({ classroomId, assessmentId: draft.id, version: draft.version });
        setDraft((current) => ({ ...current, ...payload.assessment, isPublished: false }));
      } else if (actionName === "delete") {
        await deleteTeacherAssessment({ classroomId, assessmentId: draft.id });
        setDraft(null);
      }
      setDirty(false); await loadSlots({ preserveDraft: actionName !== "delete" });
    } catch (source) { setError(normalizeTeacherAssessmentError(source).message); }
    finally { setLoading(false); }
  };

  const issues = useMemo(() => draft ? publishIssues(draft) : [], [draft]);
  const locked = Boolean(draft?.structureLocked || draft?.attemptsExist);
  const selectedClassroom = classrooms.find((item) => String(item.id) === String(classroomId));
  const confirmCopy = confirmAction === "publish" ? { title: "Publish assessment?", message: "Publishing makes this assessment available according to lesson progression. Save and verify the draft first; later changes may be restricted after a student begins.", label: "Publish", danger: false }
    : confirmAction === "unpublish" ? { title: "Unpublish assessment?", message: "Students will no longer be able to start this assessment. This is permitted only before any attempt exists.", label: "Unpublish", danger: false }
      : { title: "Delete assessment?", message: "This permanently removes the draft. Deletion is permitted only before any student attempt exists.", label: "Delete", danger: true };

  return <div className={styles.root}><Sidebar /><main className={styles.main}>
    <header className={styles.pageHeader}><div><span>Classroom authoring</span><h1>Assessment builder</h1><p>Create and manage lesson Pre-Tests and Post-Tests.</p></div>{draft && <div className={styles.headerActions}><span className={styles.saveState} role="status">{saveState === "unsaved" ? "Unsaved changes" : saveState === "saving" ? "Saving…" : saveState === "error" ? "Save failed" : "Saved"}</span><button type="button" onClick={() => setPreview(true)}><FiEye /> Preview</button><button type="button" className={styles.primaryButton} disabled={locked || !dirty || saveState === "saving"} onClick={save}><FiSave /> Save</button></div>}</header>
    <section className={styles.selectorCard} aria-labelledby="assessment-scope-heading"><h2 id="assessment-scope-heading">Choose assessment scope</h2><div>
      <label>Classroom<select value={classroomId} onChange={(event) => updateRoute({ classroomId: event.target.value, lessonKey: "" })}><option value="">Select classroom</option>{classrooms.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.className}{classroom.section ? ` — ${classroom.section}` : ""}</option>)}</select></label>
      <label>Academic lesson<select value={lessonKey} disabled={!classroomId} onChange={(event) => updateRoute({ classroomId, lessonKey: event.target.value })}><option value="">Select lesson</option>{ACADEMIC_LESSONS.map((lesson) => <option key={lesson.key} value={lesson.key}>{lesson.title}</option>)}</select></label>
    </div>{selectedClassroom && lessonKey && <p>Managing <strong>{selectedClassroom.className}</strong> · {ACADEMIC_LESSONS.find((lesson) => lesson.key === lessonKey)?.title}</p>}</section>
    {error && <div className={styles.errorBanner} role="alert">{error}</div>}
    {classroomId && lessonKey && <section className={styles.slotGrid} aria-label="Assessment types">{["PRE", "POST"].map((type) => <article key={type} className={activeType === type ? styles.activeSlot : ""}><div><span>{type === "PRE" ? "Pre-Test" : "Post-Test"}</span><Status summary={slots[type]} /></div><p>{slots[type].exists ? `${slots[type].questionCount ?? 0} questions${slots[type].attemptsExist ? " · Student attempts exist" : ""}` : type === "PRE" ? "One-attempt diagnostic" : "Mastery check with highest grade"}</p>{slots[type].exists ? <button type="button" onClick={() => openType(type)}>Open {type === "PRE" ? "Pre-Test" : "Post-Test"}</button> : <button type="button" disabled={loading} onClick={() => create(type)}><FiPlus /> Create {type === "PRE" ? "Pre-Test" : "Post-Test"}</button>}</article>)}</section>}
    {loading && <p role="status" className={styles.loading}>Loading assessment…</p>}
    {!draft && classroomId && lessonKey && !loading && <section className={styles.emptyState}><h2>Select an assessment</h2><p>Open an existing assessment or explicitly create one type above.</p></section>}
    {draft && <>
      {locked && <div className={styles.lockBanner} role="status"><strong>Locked after first attempt</strong><span>Settings, questions, unpublishing, and deletion are unavailable because student attempt data now exists.</span></div>}
      <section className={styles.editorCard}><div className={styles.sectionHeading}><div><span>{draft.type} settings</span><h2>Assessment settings</h2></div><Status summary={{ exists: true, published: draft.isPublished, attemptsExist: draft.attemptsExist }} /></div>
        <div className={styles.settingsGrid}>
          <label className={styles.wide}>Title<input disabled={locked} value={draft.title} onChange={(event) => changeDraft({ title: event.target.value })} /></label>
          <label className={styles.wide}>Instructions<textarea disabled={locked} value={draft.instructions} onChange={(event) => changeDraft({ instructions: event.target.value })} /></label>
          {draft.type === "POST" && <><label>Passing percentage<input disabled={locked} type="number" min="0" max="100" value={draft.passingPercentage} onChange={(event) => changeDraft({ passingPercentage: event.target.value })} /></label><label>Maximum attempts<input disabled={locked} type="number" min="1" max="20" value={draft.maxAttempts} onChange={(event) => changeDraft({ maxAttempts: event.target.value })} /></label></>}
          <label>Answer review policy<select disabled={locked} value={draft.answerReviewPolicy} onChange={(event) => changeDraft({ answerReviewPolicy: event.target.value })}><option value="NEVER">Never</option><option value="AFTER_SUBMISSION">After submission</option><option value="AFTER_FINAL_ATTEMPT">After all allowed attempts are exhausted</option></select></label>
          <fieldset className={styles.toggleGroup} disabled={locked}><legend>Behavior</legend><label><input type="checkbox" checked={draft.isRequired} onChange={(event) => changeDraft({ isRequired: event.target.checked })} /> Required assessment</label>{draft.type === "POST" && <label><input type="checkbox" checked={draft.requirePassingForCompletion} onChange={(event) => changeDraft({ requirePassingForCompletion: event.target.checked })} /> Require passing for completion</label>}<label><input type="checkbox" checked={draft.showScoreAfterSubmission} onChange={(event) => changeDraft({ showScoreAfterSubmission: event.target.checked })} /> Show score after submission</label><label><input type="checkbox" checked={draft.shuffleQuestions} onChange={(event) => changeDraft({ shuffleQuestions: event.target.checked })} /> Shuffle questions</label><label><input type="checkbox" checked={draft.shuffleChoices} onChange={(event) => changeDraft({ shuffleChoices: event.target.checked })} /> Shuffle choices</label></fieldset>
        </div>
      </section>
      <section className={styles.questionsSection}><div className={styles.sectionHeading}><div><span>Assessment graph</span><h2>Questions</h2></div><button type="button" className={styles.secondaryButton} disabled={locked || draft.questions.length >= 100} onClick={() => changeDraft((current) => ({ ...current, questions: addQuestion(current.questions) }))}><FiPlus /> Add question</button></div>
        {draft.questions.map((question, index) => <QuestionEditor key={question.clientId} question={question} index={index} count={draft.questions.length} disabled={locked} onChange={(next, type) => changeDraft((current) => ({ ...current, questions: type ? updateQuestionType(current.questions, question.clientId, type) : current.questions.map((item) => item.clientId === question.clientId ? next : item) }))} onMove={(delta) => changeDraft((current) => ({ ...current, questions: moveQuestion(current.questions, index, delta) }))} onRemove={() => changeDraft((current) => ({ ...current, questions: removeQuestion(current.questions, question.clientId) }))} />)}
        {!draft.questions.length && <div className={styles.emptyState}><h3>No questions yet</h3><p>Add multiple-choice or true/false questions. Drafts may remain incomplete until publication.</p></div>}
      </section>
      <section className={styles.publishCard}><div><h2>Publication</h2>{issues.length ? <><p>Resolve these obvious issues before publishing:</p><ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></> : <p>Frontend checks are clear. The server will perform final authoritative validation.</p>}{draft.isPublished && !locked && <p>Unpublish this assessment before deleting it.</p>}</div><div className={styles.publishActions}><button type="button" onClick={() => setPreview(true)}><FiEye /> Preview</button>{draft.isPublished ? <button type="button" disabled={locked || dirty} onClick={() => setConfirmAction("unpublish")}>Unpublish</button> : <button type="button" className={styles.primaryButton} disabled={locked || dirty || issues.length > 0} onClick={() => setConfirmAction("publish")}>Publish</button>}{!draft.isPublished && <button type="button" className={styles.dangerButton} disabled={locked} onClick={() => setConfirmAction("delete")}><FiTrash2 /> Delete</button>}</div></section>
    </>}
    {preview && draft && <PreviewDialog draft={draft} onClose={() => setPreview(false)} />}
    <ConfirmModal open={Boolean(confirmAction)} title={confirmCopy.title} message={confirmCopy.message} confirmLabel={confirmCopy.label} danger={confirmCopy.danger} confirmDisabled={loading} onConfirm={runAction} onCancel={() => setConfirmAction(null)} />
  </main></div>;
}
