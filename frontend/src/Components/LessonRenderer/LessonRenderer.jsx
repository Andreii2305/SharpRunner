import { Fragment, memo, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { FiBookOpen, FiCheck, FiClipboard, FiDownload, FiList, FiX } from "react-icons/fi";
import PracticeCompiler from "../PracticeCompiler/PracticeCompiler.jsx";
import { buildApiUrl, getAuthHeaders } from "../../utils/auth.js";
import { findTopicImage, getTopicBlocks } from "../../utils/lessonBlocks.js";
import styles from "./LessonRenderer.module.css";

const safeUrl = (value) => {
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : null;
  } catch { return null; }
};

function InlineContent({ text }) {
  const tokens = String(text || "").split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g).filter(Boolean);
  return tokens.map((token, index) => {
    if (token.startsWith("**") && token.endsWith("**")) return <strong key={index}>{token.slice(2, -2)}</strong>;
    if (token.startsWith("*") && token.endsWith("*")) return <em key={index}>{token.slice(1, -1)}</em>;
    if (token.startsWith("`") && token.endsWith("`")) return <code key={index}>{token.slice(1, -1)}</code>;
    const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const href = safeUrl(link[2]);
      return href ? <a key={index} href={href} target="_blank" rel="noopener noreferrer">{link[1]}<span className={styles.srOnly}> (opens in a new tab)</span></a> : <Fragment key={index}>{link[1]}</Fragment>;
    }
    return <Fragment key={index}>{token}</Fragment>;
  });
}

function MarkdownContent({ value }) {
  const blocks = useMemo(() => {
    const lines = String(value || "").replace(/\r\n/g, "\n").split("\n");
    const output = [];
    for (let index = 0; index < lines.length;) {
      const line = lines[index];
      if (!line.trim()) { index += 1; continue; }
      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      if (heading) { output.push({ type: "heading", level: heading[1].length, text: heading[2] }); index += 1; continue; }
      if (/^[-*]\s+/.test(line)) {
        const items = [];
        while (index < lines.length && /^[-*]\s+/.test(lines[index])) items.push(lines[index++].replace(/^[-*]\s+/, ""));
        output.push({ type: "bullets", items }); continue;
      }
      if (/^\d+\.\s+/.test(line)) {
        const items = [];
        while (index < lines.length && /^\d+\.\s+/.test(lines[index])) items.push(lines[index++].replace(/^\d+\.\s+/, ""));
        output.push({ type: "numbers", items }); continue;
      }
      const paragraph = [line]; index += 1;
      while (index < lines.length && lines[index].trim() && !/^(#{1,3})\s+|^[-*]\s+|^\d+\.\s+/.test(lines[index])) paragraph.push(lines[index++]);
      output.push({ type: "paragraph", text: paragraph.join("\n") });
    }
    return output;
  }, [value]);

  return <div className={styles.richText}>{blocks.map((block, index) => {
    if (block.type === "heading") {
      const Tag = block.level === 1 ? "h3" : block.level === 2 ? "h4" : "h5";
      return <Tag key={index}><InlineContent text={block.text} /></Tag>;
    }
    if (block.type === "bullets") return <ul key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}><InlineContent text={item} /></li>)}</ul>;
    if (block.type === "numbers") return <ol key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}><InlineContent text={item} /></li>)}</ol>;
    return <p key={index}><InlineContent text={block.text} /></p>;
  })}</div>;
}

export function SecureLessonImage({ image, eager = false }) {
  const [src, setSrc] = useState("");
  const [state, setState] = useState("loading");
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setState("loading");
    axios.get(buildApiUrl(`/api/lesson-content/classroom-files/${image.id}`), { headers: getAuthHeaders(), responseType: "blob" })
      .then(({ data }) => { if (active) { objectUrl = URL.createObjectURL(data); setSrc(objectUrl); setState("ready"); } })
      .catch(() => { if (active) { setSrc(""); setState("error"); } });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [image.id]);
  return <figure className={styles.topicImage}>{src ? <img src={src} alt={image.altText || ""} loading={eager ? "eager" : "lazy"} /> : <div className={styles.imageLoading}>{state === "error" ? "This image is unavailable." : "Loading image…"}</div>}{image.caption && <figcaption>{image.caption}</figcaption>}</figure>;
}

const CodeExample = memo(function CodeExample({ block }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(block.code || ""); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }
    catch { setCopied(false); }
  };
  return <figure className={styles.codeBlock}><figcaption><span>{block.title || "C# example"}</span><button type="button" onClick={copy}><FiClipboard /> {copied ? "Copied" : "Copy code"}</button></figcaption><pre><code>{block.code}</code></pre></figure>;
});

const PracticeBlock = memo(function PracticeBlock({ block, lessonId, topicKey, blockIndex }) {
  return <section className={styles.practice}><span>Try It Yourself</span><h3>{block.title || "Try It Yourself"}</h3>{block.prompt && <p>{block.prompt}</p>}<PracticeCompiler code={block.starterCode || ""} editable expectedOutput={block.expectedOutput} label="Run code" storageId={`lesson:${lessonId}:topic:${topicKey}:${block.id || blockIndex}`} /></section>;
});

const TopicBlock = memo(function TopicBlock({ block, topic, lessonId, topicKey, blockIndex, eagerImage }) {
  if (block.type === "content") return <MarkdownContent value={block.body} />;
  if (block.type === "code") return <CodeExample block={block} />;
  if (block.type === "practice") return <PracticeBlock block={block} lessonId={lessonId} topicKey={topicKey} blockIndex={blockIndex} />;
  if (block.type === "image") {
    const image = findTopicImage(topic, block);
    return image ? <SecureLessonImage image={image} eager={eagerImage} /> : null;
  }
  return null;
});

export default function LessonRenderer({ lesson, onOpenAttachment, preview = false }) {
  const topics = useMemo(() => [...(lesson?.topics || [])]
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || (a.id ?? 0) - (b.id ?? 0))
    .map((topic, index) => ({
      ...topic,
      navigationKey: String(topic.id ?? topic.clientId ?? index),
      anchorId: `lesson-topic-${String(topic.id ?? topic.clientId ?? index).replace(/[^a-zA-Z0-9_-]/g, "-")}`,
      images: [...(topic.images || [])].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || (a.id ?? 0) - (b.id ?? 0)),
      blocks: getTopicBlocks(topic),
    })), [lesson?.topics]);
  const [activeTopic, setActiveTopic] = useState(topics[0]?.navigationKey ?? null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const topicRefs = useRef(new Map());
  const drawerRef = useRef(null);
  const closeRef = useRef(null);
  const returnFocusRef = useRef(null);

  useEffect(() => { setActiveTopic(topics[0]?.navigationKey ?? null); }, [topics]);

  useEffect(() => {
    if (!topics.length) return undefined;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) setActiveTopic(visible.target.dataset.topicKey);
    }, { rootMargin: "-18% 0px -65% 0px", threshold: [0, 0.1] });
    topicRefs.current.forEach((element) => element && observer.observe(element));
    return () => observer.disconnect();
  }, [topics]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    returnFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") { setDrawerOpen(false); return; }
      if (event.key !== "Tab") return;
      const focusable = [...(drawerRef.current?.querySelectorAll("button:not([disabled]), a[href]") || [])];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); document.body.style.overflow = previousOverflow; returnFocusRef.current?.focus?.(); };
  }, [drawerOpen]);

  const openTopic = (topicKey) => {
    setDrawerOpen(false);
    setActiveTopic(topicKey);
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    topicRefs.current.get(topicKey)?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  };

  if (!topics.length) return null;
  const navigation = <><h2>Lesson topics</h2><ol>{topics.map((topic, index) => <li key={topic.navigationKey}><button type="button" title={topic.title} className={activeTopic === topic.navigationKey ? styles.activeTopic : ""} aria-current={activeTopic === topic.navigationKey ? "location" : undefined} onClick={() => openTopic(topic.navigationKey)}><span>{activeTopic === topic.navigationKey ? <FiCheck /> : index + 1}</span>{topic.title || `Topic ${index + 1}`}</button></li>)}</ol></>;

  return <div className={styles.renderer}>
    <button type="button" className={styles.mobileTopics} onClick={() => setDrawerOpen(true)} aria-expanded={drawerOpen} aria-controls="mobile-lesson-topics"><FiList /> Topics <span>{topics.length}</span></button>
    {drawerOpen && <div className={styles.drawerBackdrop} onMouseDown={() => setDrawerOpen(false)}><nav ref={drawerRef} id="mobile-lesson-topics" className={styles.drawer} aria-label="Lesson topics" onMouseDown={(event) => event.stopPropagation()}><button ref={closeRef} type="button" className={styles.drawerClose} onClick={() => setDrawerOpen(false)} aria-label="Close lesson topics"><FiX /></button>{navigation}</nav></div>}
    <div className={styles.layout}>
      <nav className={styles.topicNav} aria-label="Lesson topics">{navigation}</nav>
      <article className={styles.lessonArticle}>
        <header className={styles.lessonHeading}><span>{lesson.lessonNumber ? `Lesson ${lesson.lessonNumber}` : preview ? "Student preview" : "Classroom lesson"}</span><h1>{lesson.title}</h1>{lesson.description && <p>{lesson.description}</p>}</header>
        {topics.map((topic, index) => {
          const firstImageIndex = topic.blocks.findIndex((block) => block.type === "image");
          return <section id={topic.anchorId} data-topic-key={topic.navigationKey} ref={(element) => { if (element) topicRefs.current.set(topic.navigationKey, element); else topicRefs.current.delete(topic.navigationKey); }} className={styles.topic} key={topic.navigationKey}>
            <div className={styles.topicKicker}>Topic {index + 1}</div><h2>{topic.title || `Topic ${index + 1}`}</h2>
            {topic.blocks.map((block, blockIndex) => <TopicBlock block={block} topic={topic} lessonId={lesson.id} topicKey={topic.navigationKey} blockIndex={blockIndex} eagerImage={index === 0 && blockIndex === firstImageIndex} key={block.id} />)}
          </section>;
        })}
        {lesson.attachments?.length > 0 && <section className={styles.resources}><div><FiBookOpen /><span>Additional resources</span></div><h2>Files for this lesson</h2><div>{lesson.attachments.map((file) => <button type="button" key={file.id} onClick={() => onOpenAttachment?.(file)}><span><strong>{file.originalName}</strong><small>{Math.max(1, Math.round(Number(file.sizeBytes || 0) / 1024))} KB · Open or download</small></span><FiDownload /></button>)}</div></section>}
      </article>
    </div>
  </div>;
}
