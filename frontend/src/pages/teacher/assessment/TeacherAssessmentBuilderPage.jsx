import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FiArrowDown, FiArrowUp, FiPlus, FiTrash2 } from "react-icons/fi";
import Sidebar from "../../../Components/SideBar/Sidebar.jsx";
import ConfirmModal from "../../../Components/ConfirmModal/ConfirmModal.jsx";
import CodingQuestionEditor from "./CodingQuestionEditor.jsx";
import { StudentCodingPreview, TeacherCodingConfigurationPreview } from "./CodingQuestionPreview.jsx";
import { EditorActionBar, QuestionNavigator } from "./TeacherAssessmentBuilderChrome.jsx";
import {
  createTeacherAssessment, deleteTeacherAssessment, listTeacherAssessments,
  listTeacherClassrooms, loadTeacherAssessment, normalizeTeacherAssessmentError,
  publishTeacherAssessment, saveTeacherAssessment, unpublishTeacherAssessment,
} from "../../../services/teacherAssessmentService.js";
import {
  ACADEMIC_LESSONS, addChoice, addQuestion, assessmentStatus, availableQuestionTypes, buildSaveGraph,
  hydrateAssessmentDraft, moveChoice, moveQuestion, publishIssues, removeChoice,
  removeQuestion, selectCorrectChoice, updateQuestionType,
} from "./teacherAssessmentBuilderState.js";
import styles from "./TeacherAssessmentBuilderPage.module.css";

const emptySlots = () => ({ PRE: { exists: false }, POST: { exists: false } });
const QUESTION_TYPE_LABELS = { MULTIPLE_CHOICE: "Multiple choice", TRUE_FALSE: "True / False", CODING: "Coding" };

function Status({ summary }) {
  const label = assessmentStatus(summary);
  return <span className={`${styles.status} ${styles[`status${label.replaceAll(" ", "")}`]}`}>{label}</span>;
}

function PreviewDialog({ draft, onClose }) {
  return <div className={styles.backdrop} onClick={onClose}>
    <section className={styles.previewDialog} role="dialog" aria-modal="true" aria-labelledby="assessment-preview-title" onClick={(event) => event.stopPropagation()}>
      <header><div><span>Teacher Preview</span><h2 id="assessment-preview-title">{draft.title || "Untitled assessment"}</h2></div><button type="button" onClick={onClose} aria-label="Close preview">×</button></header>
      {draft.instructions && <p>{draft.instructions}</p>}
      <h3 className={styles.previewSectionLabel}>STUDENT PREVIEW</h3>
      {draft.questions.length ? draft.questions.map((question, index) => <article key={question.clientId}>
        <h3>{index + 1}. {question.questionText || "Untitled question"} <small>{question.points} point{Number(question.points) === 1 ? "" : "s"}</small></h3>
        {question.questionType === "CODING" ? <StudentCodingPreview question={question} /> : <ul>{question.choices.map((choice) => <li key={choice.clientId}>{choice.choiceText || "Empty choice"}</li>)}</ul>}
      </article>) : <p>No questions in this draft.</p>}
      {draft.questions.some((question) => question.questionType === "CODING") && <section className={styles.teacherOnlyPreview}><h3>TEACHER-ONLY GRADING CONFIGURATION</h3>{draft.questions.filter((question) => question.questionType === "CODING").map((question, index) => <TeacherCodingConfigurationPreview key={question.clientId} question={question} index={index} />)}</section>}
      <footer><button type="button" onClick={onClose}>Close preview</button></footer>
    </section>
  </div>;
}

function QuestionEditor({ question, index, count, anchorId, disabled, published, validationAttempted, onChange, onMove, onRemove }) {
  const replace = (changes) => onChange({ ...question, ...changes });
  const updateChoice = (choiceId, changes) => replace({ choices: question.choices.map((item) => item.clientId === choiceId ? { ...item, ...changes } : item) });
  return <article className={styles.questionCard} id={anchorId}>
    <header><div><span>Question {index + 1}</span><strong>{QUESTION_TYPE_LABELS[question.questionType]}</strong></div><div className={styles.iconActions}>
      <button type="button" disabled={disabled || index === 0} onClick={() => onMove(-1)} aria-label={`Move question ${index + 1} up`} title="Move question up"><FiArrowUp /></button>
      <button type="button" disabled={disabled || index === count - 1} onClick={() => onMove(1)} aria-label={`Move question ${index + 1} down`} title="Move question down"><FiArrowDown /></button>
      <button type="button" disabled={disabled} onClick={onRemove} aria-label={`Remove question ${index + 1}`} className={styles.dangerIcon}><FiTrash2 /></button>
    </div></header>
    <div className={styles.fieldGrid}>
      <label className={styles.wide}>Question text<textarea disabled={disabled} value={question.questionText} onChange={(event) => replace({ questionText: event.target.value })} /></label>
      <label>Question type<select disabled={disabled || published} value={question.questionType} onChange={(event) => onChange(null, event.target.value)}>{availableQuestionTypes(question.questionType).map((questionType) => <option key={questionType} value={questionType}>{QUESTION_TYPE_LABELS[questionType]}</option>)}</select>{published && <small>Unpublish before changing question type.</small>}</label>
      <label>Points<input disabled={disabled} type="number" min="0.01" step="0.01" value={question.points} onChange={(event) => replace({ points: event.target.value })} /></label>
    </div>
    {question.questionType === "CODING" ? <CodingQuestionEditor question={question} disabled={disabled} validationAttempted={validationAttempted} onChange={onChange} /> : <fieldset disabled={disabled} className={styles.choiceFieldset}><legend>Answer choices</legend>
      {question.choices.map((choice, choiceIndex) => <div className={styles.choiceRow} key={choice.clientId}>
        <input type="radio" name={`correct-${question.clientId}`} checked={choice.isCorrect} onChange={() => replace({ choices: selectCorrectChoice([question], question.clientId, choice.clientId)[0].choices })} aria-label={`Mark choice ${choiceIndex + 1} correct`} />
        <label><span>Choice {choiceIndex + 1}</span><input value={choice.choiceText} readOnly={question.questionType === "TRUE_FALSE"} onChange={(event) => updateChoice(choice.clientId, { choiceText: event.target.value })} /></label>
        <button type="button" disabled={choiceIndex === 0} onClick={() => replace({ choices: moveChoice([question], question.clientId, choiceIndex, -1)[0].choices })} aria-label={`Move choice ${choiceIndex + 1} up`} title="Move choice up"><FiArrowUp /></button>
        <button type="button" disabled={choiceIndex === question.choices.length - 1} onClick={() => replace({ choices: moveChoice([question], question.clientId, choiceIndex, 1)[0].choices })} aria-label={`Move choice ${choiceIndex + 1} down`} title="Move choice down"><FiArrowDown /></button>
        {question.questionType === "MULTIPLE_CHOICE" && <button type="button" disabled={question.choices.length <= 2} onClick={() => replace({ choices: removeChoice([question], question.clientId, choice.clientId)[0].choices })} aria-label={`Remove choice ${choiceIndex + 1}`}><FiTrash2 /></button>}
      </div>)}
      {question.questionType === "MULTIPLE_CHOICE" && <button type="button" className={styles.secondaryButton} disabled={question.choices.length >= 10} onClick={() => replace({ choices: addChoice([question], question.clientId)[0].choices })}><FiPlus /> Add choice</button>}
    </fieldset>}
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
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [activeQuestionId, setActiveQuestionId] = useState("");
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
    setDirty(false); setDraft(null); setValidationAttempted(false);
    setSearchParams({ ...(next.classroomId ? { classroomId: next.classroomId } : {}), ...(next.lessonKey ? { lessonKey: next.lessonKey } : {}) });
  });

  const openType = async (type) => guard(async () => {
    setActiveType(type); setError(""); setDraft(null); setDirty(false); setValidationAttempted(false);
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
      setActiveType(type); setDraft(hydrateAssessmentDraft(payload.assessment)); setDirty(false); setValidationAttempted(false);
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
    setValidationAttempted(true);
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
  const questionIds = useMemo(() => draft?.questions.map((question) => question.clientId).join("|") ?? "", [draft?.questions]);

  useEffect(() => {
    const ids = questionIds ? questionIds.split("|") : [];
    setActiveQuestionId((current) => ids.includes(current) ? current : (ids[0] ?? ""));
  }, [questionIds]);

  useEffect(() => {
    if (!questionIds || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((left, right) => right.intersectionRatio - left.intersectionRatio);
      if (visible[0]?.target?.dataset.questionId) setActiveQuestionId(visible[0].target.dataset.questionId);
    }, { rootMargin: "-132px 0px -55% 0px", threshold: [0, 0.15, 0.5] });
    questionIds.split("|").forEach((id) => {
      const element = document.getElementById(`assessment-${id}`);
      if (element) {
        element.dataset.questionId = id;
        observer.observe(element);
      }
    });
    return () => observer.disconnect();
  }, [questionIds]);

  const navigateToQuestion = (questionId) => {
    setActiveQuestionId(questionId);
    document.getElementById(`assessment-${questionId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const addQuestionFromEditor = () => {
    let addedId = "";
    changeDraft((current) => {
      const questions = addQuestion(current.questions);
      addedId = questions.at(-1)?.clientId ?? "";
      return { ...current, questions };
    });
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      if (addedId) navigateToQuestion(addedId);
    }));
  };

  const requestPublish = () => {
    setValidationAttempted(true);
    if (!issues.length) setConfirmAction("publish");
  };
  const locked = Boolean(draft?.structureLocked || draft?.attemptsExist);
  const selectedClassroom = classrooms.find((item) => String(item.id) === String(classroomId));
  const selectedLesson = ACADEMIC_LESSONS.find((lesson) => lesson.key === lessonKey);
  const confirmCopy = confirmAction === "publish" ? { title: "Publish assessment?", message: "Publishing makes this assessment available according to lesson progression. Save and verify the draft first; later changes may be restricted after a student begins.", label: "Publish", danger: false }
    : confirmAction === "unpublish" ? { title: "Unpublish assessment?", message: "Students will no longer be able to start this assessment. This is permitted only before any attempt exists.", label: "Unpublish", danger: false }
      : { title: "Delete assessment?", message: "This permanently removes the draft. Deletion is permitted only before any student attempt exists.", label: "Delete", danger: true };

  return <div className={styles.root}><Sidebar /><main className={styles.main}>
    <header className={styles.pageHeader}><div><span>Classroom authoring</span><h1>Assessment builder</h1><p>Create and manage lesson Pre-Tests and Post-Tests.</p></div></header>
    <section className={styles.selectorCard} aria-labelledby="assessment-scope-heading"><h2 id="assessment-scope-heading">Choose assessment scope</h2><div>
      <label>Classroom<select value={classroomId} onChange={(event) => updateRoute({ classroomId: event.target.value, lessonKey: "" })}><option value="">Select classroom</option>{classrooms.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.className}{classroom.section ? ` — ${classroom.section}` : ""}</option>)}</select></label>
      <label>Academic lesson<select value={lessonKey} disabled={!classroomId} onChange={(event) => updateRoute({ classroomId, lessonKey: event.target.value })}><option value="">Select lesson</option>{ACADEMIC_LESSONS.map((lesson) => <option key={lesson.key} value={lesson.key}>{lesson.title}</option>)}</select></label>
    </div>{selectedClassroom && lessonKey && <p>Managing <strong>{selectedClassroom.className}</strong> · {ACADEMIC_LESSONS.find((lesson) => lesson.key === lessonKey)?.title}</p>}</section>
    {error && <div className={styles.errorBanner} role="alert">{error}</div>}
    {classroomId && lessonKey && <section className={styles.slotGrid} aria-label="Assessment types">{["PRE", "POST"].map((type) => <article key={type} className={activeType === type ? styles.activeSlot : ""}><div><span>{type === "PRE" ? "Pre-Test" : "Post-Test"}</span><Status summary={slots[type]} /></div><p>{slots[type].exists ? `${slots[type].questionCount ?? 0} questions${slots[type].attemptsExist ? " · Student attempts exist" : ""}` : type === "PRE" ? "One-attempt diagnostic" : "Mastery check with highest grade"}</p>{slots[type].exists ? <button type="button" onClick={() => openType(type)}>Open {type === "PRE" ? "Pre-Test" : "Post-Test"}</button> : <button type="button" disabled={loading} onClick={() => create(type)}><FiPlus /> Create {type === "PRE" ? "Pre-Test" : "Post-Test"}</button>}</article>)}</section>}
    {loading && <p role="status" className={styles.loading}>Loading assessment…</p>}
    {!draft && classroomId && lessonKey && !loading && <section className={styles.emptyState}><h2>Select an assessment</h2><p>Open an existing assessment or explicitly create one type above.</p></section>}
    {draft && <>
      <EditorActionBar lessonTitle={selectedLesson?.title ?? "Lesson"} assessmentType={draft.type} status={assessmentStatus({ exists: true, published: draft.isPublished, attemptsExist: draft.attemptsExist })} saveState={saveState} dirty={dirty} locked={locked} saving={saveState === "saving"} published={draft.isPublished} publishDisabled={locked || dirty} onPreview={() => setPreview(true)} onSave={save} onPublish={requestPublish} onUnpublish={() => setConfirmAction("unpublish")} />
      {locked && <div className={styles.lockBanner} role="status"><strong>Locked after first attempt</strong><span>Settings, questions, unpublishing, and deletion are unavailable because student attempt data now exists.</span></div>}
      <div className={styles.editorWorkspace}>
      <QuestionNavigator questions={draft.questions} activeQuestionId={activeQuestionId} disabled={locked || draft.questions.length >= 100} onNavigate={navigateToQuestion} onAdd={addQuestionFromEditor} />
      <div className={styles.editorColumn}>
      <section className={styles.editorCard}><div className={styles.sectionHeading}><div><span>{draft.type === "PRE" ? "Pre-Test" : "Post-Test"}</span><h2>Assessment settings</h2></div><Status summary={{ exists: true, published: draft.isPublished, attemptsExist: draft.attemptsExist }} /></div>
        <div className={styles.settingsGrid}>
          <label className={styles.wide}>Title<input disabled={locked} value={draft.title} onChange={(event) => changeDraft({ title: event.target.value })} /></label>
          <label className={styles.wide}>Instructions<textarea disabled={locked} value={draft.instructions} onChange={(event) => changeDraft({ instructions: event.target.value })} /></label>
          {draft.type === "POST" && <><label>Passing percentage<input disabled={locked} type="number" min="0" max="100" value={draft.passingPercentage} onChange={(event) => changeDraft({ passingPercentage: event.target.value })} /></label><label>Maximum attempts<input disabled={locked} type="number" min="1" max="20" value={draft.maxAttempts} onChange={(event) => changeDraft({ maxAttempts: event.target.value })} /></label></>}
          <label>Answer review policy<select disabled={locked} value={draft.answerReviewPolicy} onChange={(event) => changeDraft({ answerReviewPolicy: event.target.value })}><option value="NEVER">Never</option><option value="AFTER_SUBMISSION">After submission</option><option value="AFTER_FINAL_ATTEMPT">After all allowed attempts are exhausted</option></select></label>
          <fieldset className={styles.toggleGroup} disabled={locked}><legend>Behavior</legend><label><input type="checkbox" checked={draft.isRequired} onChange={(event) => changeDraft({ isRequired: event.target.checked })} /> Required assessment</label>{draft.type === "POST" && <label><input type="checkbox" checked={draft.requirePassingForCompletion} onChange={(event) => changeDraft({ requirePassingForCompletion: event.target.checked })} /> Require passing for completion</label>}<label><input type="checkbox" checked={draft.showScoreAfterSubmission} onChange={(event) => changeDraft({ showScoreAfterSubmission: event.target.checked })} /> Show score after submission</label><label><input type="checkbox" checked={draft.shuffleQuestions} onChange={(event) => changeDraft({ shuffleQuestions: event.target.checked })} /> Shuffle questions</label><label><input type="checkbox" checked={draft.shuffleChoices} onChange={(event) => changeDraft({ shuffleChoices: event.target.checked })} /> Shuffle choices</label></fieldset>
        </div>
      </section>
      <section className={styles.questionsSection}><div className={styles.sectionHeading}><div><span>Assessment questions</span><h2>Questions</h2></div><button type="button" className={styles.secondaryButton} disabled={locked || draft.questions.length >= 100} onClick={addQuestionFromEditor}><FiPlus /> Add question</button></div>
        {draft.questions.map((question, index) => <QuestionEditor key={question.clientId} anchorId={`assessment-${question.clientId}`} question={question} index={index} count={draft.questions.length} disabled={locked} published={draft.isPublished} validationAttempted={validationAttempted} onChange={(next, type) => changeDraft((current) => ({ ...current, questions: type ? updateQuestionType(current.questions, question.clientId, type) : current.questions.map((item) => item.clientId === question.clientId ? next : item) }))} onMove={(delta) => changeDraft((current) => ({ ...current, questions: moveQuestion(current.questions, index, delta) }))} onRemove={() => changeDraft((current) => ({ ...current, questions: removeQuestion(current.questions, question.clientId) }))} />)}
        {!draft.questions.length && <div className={styles.emptyState}><h3>No questions yet</h3><p>Add multiple-choice or true/false questions. Drafts may remain incomplete until publication.</p></div>}
        {!!draft.questions.length && <div className={styles.questionFooter}><button type="button" className={styles.secondaryButton} disabled={locked || draft.questions.length >= 100} onClick={addQuestionFromEditor}><FiPlus /> Add question</button></div>}
      </section>
      <section className={styles.publishCard}><div><h2>Publication readiness</h2>{issues.length ? <><p>Resolve these issues before publishing:</p><ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></> : <p>Frontend checks are clear. The server will perform final authoritative validation.</p>}{draft.isPublished && !locked && <p>Unpublish this assessment before deleting it.</p>}</div>{!draft.isPublished && <button type="button" className={styles.dangerButton} disabled={locked} onClick={() => setConfirmAction("delete")}><FiTrash2 /> Delete assessment</button>}</section>
      </div>
      </div>
    </>}
    {preview && draft && <PreviewDialog draft={draft} onClose={() => setPreview(false)} />}
    <ConfirmModal open={Boolean(confirmAction)} title={confirmCopy.title} message={confirmCopy.message} confirmLabel={confirmCopy.label} danger={confirmCopy.danger} confirmDisabled={loading} onConfirm={runAction} onCancel={() => setConfirmAction(null)} />
  </main></div>;
}
