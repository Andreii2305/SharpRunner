import { Fragment, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { FiArrowLeft, FiArrowRight, FiCheck, FiCheckCircle, FiChevronDown, FiClipboard, FiExternalLink, FiPlay, FiXCircle } from "react-icons/fi";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import Sidebar from "../../Components/SideBar/Sidebar.jsx";
import PracticeCompiler from "../../Components/PracticeCompiler/PracticeCompiler.jsx";
import { calculateModulePercent, readModuleProgress, writeModuleProgress } from "../../builtInModules/progress.js";
import {
  fetchBuiltInLessonContent,
  fetchPrimaryClassroomId,
} from "../../services/builtInLessonContentService.js";
import {
  builtInModuleContentReducer,
  classifyBuiltInLessonContentError,
  initialBuiltInModuleContentState,
  parsePositiveClassroomId,
  visibleBuiltInModuleContentState,
} from "./builtInModuleContentState.js";
import styles from "./BuiltInModulePage.module.css";

const keywordPattern = /\b(static|void|int|string|double|bool|class|using|namespace|return|if|else|for|foreach|in|new|true|false)\b/g;
const keywords = new Set(["static", "void", "int", "string", "double", "bool", "class", "using", "namespace", "return", "if", "else", "for", "foreach", "in", "new", "true", "false"]);

function HighlightedCode({ value }) {
  const lines = String(value).split("\n");
  return lines.map((line, lineIndex) => {
    const commentAt = line.indexOf("//");
    const source = commentAt >= 0 ? line.slice(0, commentAt) : line;
    const comment = commentAt >= 0 ? line.slice(commentAt) : "";
    const parts = source.split(keywordPattern);
    return <Fragment key={`${lineIndex}-${line}`}>
      {parts.map((part, index) => keywords.has(part)
        ? <span className={styles.codeKeyword} key={`${part}-${index}`}>{part}</span>
        : <Fragment key={`${part}-${index}`}>{part}</Fragment>)}
      {comment && <span className={styles.codeComment}>{comment}</span>}
      {lineIndex < lines.length - 1 ? "\n" : ""}
    </Fragment>;
  });
}

function CodeBlock({ block }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(block.value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  return <figure className={styles.codeCard}>
    <figcaption><span>{block.title}</span><button type="button" onClick={copy} aria-label={`Copy ${block.title}`}><FiClipboard /> {copied ? "Copied" : "Copy"}</button></figcaption>
    <pre><code><HighlightedCode value={block.value} /></code></pre>
    {block.output != null && <div className={styles.expectedOutput}><strong>Expected output</strong><pre>{block.output}</pre></div>}
  </figure>;
}

function PracticeBlock({ block, storageId }) {
  return <div className={styles.practice} data-practice-id={block.id}><span className={styles.blockLabel}>Try it yourself</span><p>{block.prompt}</p>
    <PracticeCompiler code={block.starterCode} editable expectedOutput={block.expectedOutput} solution={block.solution} label="Run code" storageId={storageId} />
  </div>;
}

function CheckBlock({ block, completed, onComplete }) {
  const [choice, setChoice] = useState(null);
  const correct = choice === block.answer;
  return <fieldset className={styles.check} data-check-id={block.id}>
    <legend><span className={styles.blockLabel}>Quick check</span>{block.prompt}</legend>
    <div className={styles.options}>{block.options.map((option, index) => <label key={option} className={choice === index ? styles.optionSelected : ""}>
      <input type="radio" name={block.id} checked={choice === index} onChange={() => { setChoice(index); if (index === block.answer) onComplete(block.id); }} />
      <span>{option}</span>
    </label>)}</div>
    {choice != null && <div className={`${styles.feedback} ${correct ? styles.correct : styles.tryAgain}`} aria-live="polite">
      {correct ? <FiCheckCircle /> : <FiXCircle />}<span><strong>{correct ? "Correct." : "Try again."}</strong> {correct ? block.feedback : "Review the choices and choose another answer."}</span>
    </div>}
    {completed && choice == null && <div className={`${styles.feedback} ${styles.correct}`}><FiCheckCircle /> Completed earlier — you can retry it.</div>}
  </fieldset>;
}

function ContentBlock({ block, progress, onCheckComplete, storageId }) {
  if (block.type === "heading") return <h3>{block.text}</h3>;
  if (block.type === "paragraph") return <p>{block.text}</p>;
  if (block.type === "list") return <ul>{block.items.map((item) => <li key={item}>{item}</li>)}</ul>;
  if (block.type === "code") return <CodeBlock block={block} />;
  if (block.type === "note") return <aside className={`${styles.note} ${block.tone === "warning" ? styles.warning : ""}`}><strong>{block.label}</strong><p>{block.text}</p></aside>;
  if (block.type === "practice") return <PracticeBlock block={block} storageId={storageId} />;
  if (block.type === "check") return <CheckBlock block={block} completed={progress.completedCheckIds.includes(block.id)} onComplete={onCheckComplete} />;
  if (block.type === "connection") return <aside className={styles.connection}><strong>Why this matters in SharpRunner</strong><p>{block.text}</p></aside>;
  if (block.type === "diagram") return <figure className={styles.diagram}><div className={styles.tableScroll}><table><thead><tr>{block.headers.map((header, index) => <th key={`${header}-${index}`}>{header}</th>)}</tr></thead><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => index === 0 ? <th scope="row" key={cell}>{cell}</th> : <td key={`${cell}-${index}`}>{cell}</td>)}</tr>)}</tbody></table></div><figcaption>{block.caption}</figcaption></figure>;
  return null;
}

const safeReferenceUrl = (value) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
};

function AuthorizedModuleContent({ lesson, onNavigateGame }) {
  const [progress, setProgress] = useState(() => readModuleProgress(lesson.lessonKey));
  const initialSection = lesson.sections.findIndex(({ id }) => id === progress.lastSectionId);
  const [sectionIndex, setSectionIndex] = useState(initialSection >= 0 ? initialSection : 0);
  const [contentsOpen, setContentsOpen] = useState(false);

  useEffect(() => {
    const sectionId = lesson.sections[sectionIndex]?.id;
    if (!sectionId) return;
    setProgress((current) => {
      const next = { ...current, lastSectionId: sectionId };
      writeModuleProgress(lesson.lessonKey, next);
      return next;
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [lesson, sectionIndex]);

  const checkIds = useMemo(() => lesson.sections.flatMap((section) => section.blocks.filter(({ type }) => type === "check").map(({ id }) => id)), [lesson]);
  const section = lesson.sections[sectionIndex];
  const percent = calculateModulePercent(lesson, progress);
  const allChecksDone = checkIds.every((id) => progress.completedCheckIds.includes(id));
  const game = lesson.game;
  const hasGameDestination = Boolean(game?.title && game?.route);

  const saveProgress = (next) => { setProgress(next); writeModuleProgress(lesson.lessonKey, next); };
  const openSection = (index) => { setSectionIndex(index); setContentsOpen(false); };
  const finishSection = () => {
    const completedSectionIds = [...new Set([...progress.completedSectionIds, section.id])];
    const isLast = sectionIndex === lesson.sections.length - 1;
    const completedAt = isLast && completedSectionIds.length === lesson.sections.length && allChecksDone ? new Date().toISOString() : progress.completedAt;
    saveProgress({ ...progress, completedSectionIds, completedAt, lastSectionId: section.id });
    if (!isLast) setSectionIndex(sectionIndex + 1);
  };
  const completeCheck = (id) => saveProgress({ ...progress, completedCheckIds: [...new Set([...progress.completedCheckIds, id])] });

  return <main className={styles.page}>
    <header className={styles.header}>
      <a href="/lesson" className={styles.back}><FiArrowLeft /> All Lessons</a>
      <div className={styles.heading}><span>{lesson.eyebrow}</span><h1>{lesson.title}</h1></div>
      <div className={styles.progressSummary}><strong>{percent}% complete</strong><div role="progressbar" aria-label="Module progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></div></div>
    </header>
    <button type="button" className={styles.mobileContents} onClick={() => setContentsOpen((value) => !value)} aria-expanded={contentsOpen}><span>Module contents · {sectionIndex + 1} of {lesson.sections.length}</span><FiChevronDown /></button>
    <div className={styles.learningLayout}>
      <nav className={`${styles.contents} ${contentsOpen ? styles.contentsOpen : ""}`} aria-label="Module contents"><h2>Module contents</h2><ol>{lesson.sections.map((item, index) => {
        const done = progress.completedSectionIds.includes(item.id);
        return <li key={item.id}><button type="button" className={sectionIndex === index ? styles.current : ""} onClick={() => openSection(index)} aria-current={sectionIndex === index ? "step" : undefined}><span>{done ? <FiCheck aria-label="Completed" /> : index + 1}</span>{item.title}</button></li>;
      })}</ol></nav>
      <article className={styles.lesson} id={`module-section-${section.id}`}>
        {sectionIndex === 0 && <div className={styles.intro}><p>{lesson.description}</p><h2>Learning objectives</h2><ul>{lesson.objectives.map((objective) => <li key={objective}>{objective}</li>)}</ul></div>}
        <div className={styles.sectionKicker}>Section {sectionIndex + 1} of {lesson.sections.length}</div><h2>{section.title}</h2>
        <div className={styles.blocks}>{section.blocks.map((block, index) => <ContentBlock key={`${block.type}-${block.id ?? index}`} block={block} progress={progress} onCheckComplete={completeCheck} storageId={`${lesson.lessonKey}:${section.id}:${block.id ?? index}`} />)}</div>
        <div className={styles.sectionNav}>
          <button type="button" disabled={sectionIndex === 0} onClick={() => setSectionIndex(sectionIndex - 1)}><FiArrowLeft /> Previous</button>
          <button type="button" className={styles.continue} onClick={finishSection}>{sectionIndex === lesson.sections.length - 1 ? "Finish module" : "Continue"}<FiArrowRight /></button>
        </div>
        {sectionIndex === lesson.sections.length - 1 && <>
          {!allChecksDone && <p className={styles.completionNote}>Complete each quick check to mark the module complete. You may retry any check.</p>}
          {hasGameDestination && <section className={styles.cta}><div><span>Ready to apply what you learned?</span><h2>Next: SharpRunner {game.title}</h2><p>Your learning progress is separate from game score and does not add a new gameplay lock.</p></div><button type="button" data-game-route={game.route} onClick={() => onNavigateGame(game.route)}><FiPlay /> Start Adventure</button></section>}
          <footer className={styles.references}><h2>References</h2><ol>{lesson.references.map((reference) => {
            const url = safeReferenceUrl(reference.url);
            return <li key={reference.title}>{url ? <a href={url} target="_blank" rel="noopener noreferrer">{reference.title} <FiExternalLink aria-hidden="true" /></a> : reference.title}</li>;
          })}</ol></footer>
        </>}
      </article>
    </div>
  </main>;
}

function ContentStatus({
  title,
  message,
  role = "alert",
  onRetry = null,
  actionHref = "/lesson",
  actionLabel = "Back to lessons",
}) {
  return <main className={styles.page}>
    <div className={styles.learningLayout}>
      <article className={styles.lesson} role={role} aria-live="polite">
        <h1>{title}</h1>
        <p>{message}</p>
        {onRetry && <button type="button" onClick={onRetry}>Try again</button>}
        {!onRetry && <a href={actionHref}>{actionLabel}</a>}
      </article>
    </div>
  </main>;
}

export function BuiltInModuleContentView({ state, onRetry, onNavigateGame }) {
  if (state.status === "ready" && state.content?.lesson) {
    const lesson = state.content.lesson;
    return <AuthorizedModuleContent key={lesson.lessonKey} lesson={lesson} onNavigateGame={onNavigateGame} />;
  }

  if (state.status === "error") {
    const error = state.error ?? {};
    if (error.kind === "auth") return <ContentStatus title="Sign in required" message={error.message} actionHref="/login" actionLabel="Sign in" />;
    if (error.kind === "locked") return <ContentStatus title="Module locked" message={error.message} />;
    if (error.kind === "forbidden") return <ContentStatus title="Module unavailable" message={error.message} />;
    if (error.kind === "not-found") return <ContentStatus title="Module not found" message={error.message} />;
    if (error.kind === "invalid-classroom") return <ContentStatus title="Invalid classroom link" message={error.message} />;
    return <ContentStatus title="Unable to load module" message={error.message} onRetry={onRetry} />;
  }

  return <ContentStatus title="Loading module" message="Loading module content…" role="status" />;
}

function BuiltInModulePage() {
  const { moduleId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(builtInModuleContentReducer, initialBuiltInModuleContentState);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const requestGeneration = useRef(0);
  const hasExplicitClassroomId = searchParams.has("classroomId");
  const explicitClassroomId = searchParams.get("classroomId");
  const requestContext = `${hasExplicitClassroomId ? `explicit:${explicitClassroomId}` : "primary"}:${moduleId}`;

  useEffect(() => {
    const controller = new AbortController();
    const requestKey = `${requestContext}:${++requestGeneration.current}`;
    dispatch({ type: "BEGIN_REQUEST", requestKey });

    const loadContent = async () => {
      try {
        let classroomId;
        if (hasExplicitClassroomId) {
          classroomId = parsePositiveClassroomId(explicitClassroomId);
          if (classroomId == null) {
            throw { status: 400, code: "INVALID_CLASSROOM_ID" };
          }
        } else {
          classroomId = await fetchPrimaryClassroomId({ signal: controller.signal });
        }

        const content = await fetchBuiltInLessonContent({
          classroomId,
          lessonKey: moduleId,
          signal: controller.signal,
        });
        dispatch({ type: "REQUEST_SUCCEEDED", requestKey, content });
      } catch (error) {
        dispatch({
          type: "REQUEST_FAILED",
          requestKey,
          error: classifyBuiltInLessonContentError(error),
        });
      }
    };

    loadContent();
    return () => controller.abort();
  }, [explicitClassroomId, hasExplicitClassroomId, moduleId, requestContext, retryGeneration]);

  const retry = useCallback(() => setRetryGeneration((generation) => generation + 1), []);
  const visibleState = visibleBuiltInModuleContentState(state, requestContext);
  return <div className={styles.shell}>
    <Sidebar />
    <BuiltInModuleContentView
      state={visibleState}
      onRetry={retry}
      onNavigateGame={(route) => navigate(route)}
    />
  </div>;
}

export default BuiltInModulePage;
