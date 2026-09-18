import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { FiArrowDown, FiArrowUp, FiCopy, FiImage, FiMenu, FiPlay, FiPlus, FiTrash2, FiUpload } from "react-icons/fi";
import { SecureLessonImage } from "../../Components/LessonRenderer/LessonRenderer.jsx";
import { buildApiUrl, getAuthHeaders } from "../../utils/auth.js";
import { createBlock, findTopicImage, insertBlock, moveBlock, reindexBlocks } from "../../utils/lessonBlocks.js";
import styles from "./TeacherLessonBuilderPage.module.css";

const makeClientId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
const blockLabel = { content: "Content", code: "Code Example", image: "Image", practice: "Try It Yourself" };

function RichContentEditor({ value, onChange, ariaLabel }) {
  const ref = useRef(null);
  const wrap = (before, after = before, placeholder = "text") => {
    const input = ref.current;
    if (!input) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const selected = value.slice(start, end) || placeholder;
    onChange(`${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`);
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(start + before.length, start + before.length + selected.length); });
  };
  const prefix = (marker) => {
    const input = ref.current;
    if (!input) return;
    const start = value.lastIndexOf("\n", input.selectionStart - 1) + 1;
    onChange(`${value.slice(0, start)}${marker}${value.slice(start)}`);
  };
  return <div className={styles.richEditor}>
    <div className={styles.richToolbar} aria-label="Rich text tools">
      <button type="button" onClick={() => wrap("**")}><strong>B</strong><span>Bold</span></button>
      <button type="button" onClick={() => wrap("*")}><em>I</em><span>Italic</span></button>
      <button type="button" onClick={() => prefix("## ")}>Heading</button>
      <button type="button" onClick={() => prefix("- ")}>Bullets</button>
      <button type="button" onClick={() => prefix("1. ")}>Numbered</button>
      <button type="button" onClick={() => wrap("`", "`", "inline code")}>Inline code</button>
      <button type="button" onClick={() => wrap("[", "](https://example.com)", "link text")}>Link</button>
    </div>
    <textarea ref={ref} value={value} onChange={(event) => onChange(event.target.value)} placeholder="Explain this part of the topic." aria-label={ariaLabel} />
    <small>Formatting is stored as safe structured lesson text. Student pages never inject raw HTML.</small>
  </div>;
}

function TeacherTestRun({ code }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const { data } = await axios.post(buildApiUrl("/api/practice/run"), { code }, { headers: getAuthHeaders() });
      setResult(data);
    } catch (requestError) {
      setResult({ success: false, stderr: requestError.response?.data?.stderr || requestError.response?.data?.message || "The compiler is unavailable. Try again shortly." });
    } finally { setRunning(false); }
  };
  return <div className={styles.testRun}><button type="button" onClick={run} disabled={running || !code?.trim()}><FiPlay /> {running ? "Running…" : "Test Run"}</button>{result && <pre className={result.success ? styles.testSuccess : styles.testError} aria-live="polite">{result.stdout || result.stderr || (result.success ? "Program completed with no output." : "Run failed.")}</pre>}</div>;
}

function AutoHeightCodeEditor({ value, onChange, ariaLabel }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const input = ref.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight + 2}px`;
  }, [value]);
  return <textarea ref={ref} className={styles.codeInput} value={value} rows={3} wrap="off" aria-label={ariaLabel} onChange={(event) => onChange(event.target.value)} />;
}

function AddBlockControl({ position, onAdd }) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0, width: 310 });
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();
  const add = (type) => {
    onAdd(type, position);
    setOpen(false);
    requestAnimationFrame(() => buttonRef.current?.focus());
  };
  useLayoutEffect(() => {
    if (!open) return undefined;
    const placeMenu = () => {
      const button = buttonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const width = Math.min(310, window.innerWidth - 24);
      const menuHeight = menuRef.current?.offsetHeight || 260;
      const left = Math.min(Math.max(12, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 12);
      const below = rect.bottom + 6;
      const top = below + menuHeight <= window.innerHeight - 12 ? below : Math.max(12, rect.top - menuHeight - 6);
      setMenuPosition({ left, top, width });
    };
    placeMenu();
    window.addEventListener("resize", placeMenu);
    window.addEventListener("scroll", placeMenu, true);
    return () => { window.removeEventListener("resize", placeMenu); window.removeEventListener("scroll", placeMenu, true); };
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!buttonRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") { setOpen(false); buttonRef.current?.focus(); }
    };
    document.addEventListener("pointerdown", closeOutside, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside, true); document.removeEventListener("keydown", closeOnEscape); };
  }, [open]);
  return <div className={styles.blockInsertion}>
    <button ref={buttonRef} type="button" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen((value) => !value)}><FiPlus /> Add Block</button>
    {open && createPortal(<div ref={menuRef} id={menuId} className={styles.blockMenu} role="menu" aria-label="Choose block type" style={menuPosition}>
      <button type="button" role="menuitem" onClick={() => add("content")}><span>Text / Content</span><small>Explanation, headings, lists, and links</small></button>
      <button type="button" role="menuitem" onClick={() => add("code")}><span>Code Example</span><small>Display-only C# example</small></button>
      <button type="button" role="menuitem" onClick={() => add("image")}><span>Image</span><small>Educational image with alt text</small></button>
      <button type="button" role="menuitem" onClick={() => add("practice")}><span>Try It Yourself</span><small>Runnable student practice</small></button>
    </div>, document.body)}
  </div>;
}

function BlockEditor({ topic, block, index, count, dirtyImage, uploadBusy, onChange, onMove, onDelete, onDuplicate, onUploadImage, onUpdateImage, onDragStart, onDragEnd, onDragOver, onDrop, dragging, dropTarget }) {
  const [open, setOpen] = useState(true);
  const image = block.type === "image" ? findTopicImage(topic, block) : null;
  const update = (changes) => onChange({ ...block, ...changes });
  return <section className={`${styles.lessonBlock} ${styles[`block_${block.type}`] || ""} ${dragging ? styles.blockDragging : ""} ${dropTarget ? styles.blockDropTarget : ""}`} onDragOver={(event) => onDragOver(event, index)} onDrop={(event) => onDrop(event, index)}>
    <header className={styles.lessonBlockHeader}>
      <button type="button" draggable className={styles.blockDragHandle} aria-label={`Drag ${blockLabel[block.type]} block`} title="Drag to reorder block" onDragStart={(event) => onDragStart(event, index)} onDragEnd={onDragEnd}><FiMenu /></button>
      <strong>{blockLabel[block.type]}</strong>
      <div className={styles.blockActions}>
        <button type="button" disabled={index === 0} onClick={() => onMove(index, index - 1)} title="Move up" aria-label={`Move ${blockLabel[block.type]} block up`}><FiArrowUp /></button>
        <button type="button" disabled={index === count - 1} onClick={() => onMove(index, index + 1)} title="Move down" aria-label={`Move ${blockLabel[block.type]} block down`}><FiArrowDown /></button>
        {block.type !== "image" && <button type="button" onClick={() => onDuplicate(index)} title="Duplicate block" aria-label={`Duplicate ${blockLabel[block.type]} block`}><FiCopy /></button>}
        <button type="button" onClick={() => setOpen((value) => !value)}>{open ? "Collapse" : "Expand"}</button>
        <button type="button" className={styles.dangerText} onClick={() => onDelete(block)} title="Delete block" aria-label={`Delete ${blockLabel[block.type]} block`}><FiTrash2 /></button>
      </div>
    </header>
    {open && <div className={styles.lessonBlockBody}>
      {block.type === "content" && <RichContentEditor value={block.body || ""} onChange={(body) => update({ body })} ariaLabel={`Content block ${index + 1}`} />}
      {block.type === "code" && <><label>Label<input value={block.title || ""} maxLength={120} onChange={(event) => update({ title: event.target.value })} /></label><label>C# code<AutoHeightCodeEditor value={block.code || ""} onChange={(code) => update({ code })} ariaLabel={`C# code for ${block.title || "code example"}`} /></label><p className={styles.helper}>Display-only example for students. Add a Try It Yourself block when the code should be runnable.</p></>}
      {block.type === "practice" && <><label>Title<input value={block.title || ""} maxLength={120} onChange={(event) => update({ title: event.target.value })} /></label><label>Instructions<textarea value={block.prompt || ""} onChange={(event) => update({ prompt: event.target.value })} /></label><label>Starter C# code<AutoHeightCodeEditor value={block.starterCode || ""} onChange={(starterCode) => update({ starterCode })} ariaLabel={`Starter C# code for ${block.title || "practice"}`} /></label><TeacherTestRun code={block.starterCode} /><label>Expected output<textarea className={styles.expectedOutputInput} rows={3} value={block.expectedOutput || ""} onChange={(event) => update({ expectedOutput: event.target.value })} placeholder={"First line\nSecond line"} /></label></>}
      {block.type === "image" && (image ? <div className={styles.imageEditor}><SecureLessonImage image={image} /><label>Alt text<input value={image.altText || ""} onChange={(event) => dirtyImage(topic, image, { altText: event.target.value })} onBlur={() => onUpdateImage(topic, image, { altText: image.altText || "" })} placeholder="Describe what students should understand" /><small>Describe meaningful images for screen readers; leave blank only when decorative.</small></label><label>Caption<input value={image.caption || ""} onChange={(event) => dirtyImage(topic, image, { caption: event.target.value })} onBlur={() => onUpdateImage(topic, image, { caption: image.caption || "" })} placeholder="Optional caption" /></label></div> : <div className={styles.imageUpload}><FiImage /><p>{topic.id ? "Choose an educational image for this position." : "Save this new topic before uploading its image."}</p><label className={`${styles.secondaryButton} ${!topic.id || uploadBusy ? styles.disabledButton : ""}`}><FiUpload /> {uploadBusy ? "Uploading…" : "Upload image"}<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" disabled={!topic.id || uploadBusy} onChange={(event) => { onUploadImage(topic, block, event.target.files?.[0]); event.target.value = ""; }} /></label></div>)}
    </div>}
  </section>;
}

export default function OrderedTopicEditor({ topic, index, count, dirty, dragging, dropTarget, duplicateBusy, uploadBusy, onChange, onMove, onDragStart, onDragEnd, onDragOver, onDrop, onDuplicate, onDelete, onUploadImage, onUpdateImage, onDeleteBlock }) {
  const [open, setOpen] = useState(true);
  const [blockDrag, setBlockDrag] = useState({ source: null, target: null });
  const blocks = topic.content?.blocks || [];
  const setBlocks = (next) => onChange({ ...topic, content: { format: "markdown", blocks: reindexBlocks(next) } });
  const add = (type, position) => setBlocks(insertBlock(blocks, createBlock(type, makeClientId()), position));
  const move = (source, target) => setBlocks(moveBlock(blocks, source, target));
  const update = (blockIndex, next) => setBlocks(blocks.map((item, itemIndex) => itemIndex === blockIndex ? next : item));
  const duplicate = (blockIndex) => setBlocks(insertBlock(blocks, { ...blocks[blockIndex], id: makeClientId() }, blockIndex + 1));
  const isBlockDrag = (event) => event.dataTransfer.types.includes("application/x-sharprunner-block");
  return <article className={`${styles.topicCard} ${dragging ? styles.topicDragging : ""} ${dropTarget ? styles.topicDropTarget : ""}`} onDragOver={(event) => { if (!isBlockDrag(event)) onDragOver(event, index); }} onDrop={(event) => { if (!isBlockDrag(event)) onDrop(event, index); }}>
    <header className={styles.topicHeader}><button type="button" draggable className={styles.dragHandle} aria-label={`Drag topic ${index + 1}`} title="Drag to reorder topic" onDragStart={(event) => onDragStart(event, index)} onDragEnd={onDragEnd}><FiMenu /></button><div><span>Topic {index + 1}</span><strong>{topic.title || "Untitled topic"}</strong></div><div className={styles.moveButtons}><button type="button" disabled={index === 0} onClick={() => onMove(index, index - 1)} aria-label="Move topic up"><FiArrowUp /></button><button type="button" disabled={index === count - 1} onClick={() => onMove(index, index + 1)} aria-label="Move topic down"><FiArrowDown /></button><button type="button" onClick={() => setOpen((value) => !value)}>{open ? "Collapse" : "Edit"}</button></div></header>
    {open && <div className={styles.topicBody}>
      <label>Topic title<input value={topic.title} maxLength={180} onChange={(event) => onChange({ ...topic, title: event.target.value })} /></label>
      <div className={styles.orderedBlocks} aria-label={`Ordered blocks for ${topic.title || `Topic ${index + 1}`}`}>
        <AddBlockControl position={0} onAdd={add} />
        {blocks.map((block, blockIndex) => <Fragment key={block.id}><BlockEditor topic={topic} block={block} index={blockIndex} count={blocks.length} dirtyImage={dirty} uploadBusy={uploadBusy === block.id} onChange={(next) => update(blockIndex, next)} onMove={move} onDelete={(item) => onDeleteBlock(topic, item)} onDuplicate={duplicate} onUploadImage={onUploadImage} onUpdateImage={onUpdateImage} dragging={blockDrag.source === blockIndex} dropTarget={blockDrag.target === blockIndex && blockDrag.source !== blockIndex} onDragStart={(event, source) => { event.stopPropagation(); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-sharprunner-block", String(source)); setBlockDrag({ source, target: source }); }} onDragEnd={() => setBlockDrag({ source: null, target: null })} onDragOver={(event, target) => { event.preventDefault(); event.stopPropagation(); if (blockDrag.target !== target) setBlockDrag((current) => ({ ...current, target })); }} onDrop={(event, target) => { event.preventDefault(); event.stopPropagation(); const source = Number(event.dataTransfer.getData("application/x-sharprunner-block")); if (Number.isInteger(source)) move(source, target); setBlockDrag({ source: null, target: null }); }} /><AddBlockControl position={blockIndex + 1} onAdd={add} /></Fragment>)}
      </div>
      <footer className={styles.topicFooter}><button type="button" disabled={duplicateBusy} onClick={() => onDuplicate(topic)}><FiCopy /> {duplicateBusy ? "Duplicating…" : "Duplicate topic"}</button><button type="button" className={styles.dangerText} onClick={() => onDelete(topic)}><FiTrash2 /> Delete topic</button></footer>
    </div>}
  </article>;
}
