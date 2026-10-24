import styles from "./BuiltInLessonRenderer.module.css";

const safeIdPart = (value, fallback) => {
  const normalized = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
};

const safeReferenceUrl = (value) => {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
};

function StaticCode({ label, value, output }) {
  return <figure className={styles.codeCard}>
    <figcaption>{label}</figcaption>
    <pre><code>{value}</code></pre>
    {output != null && <div className={styles.output}>
      <strong>Expected output</strong>
      <pre>{output}</pre>
    </div>}
  </figure>;
}

function DiagramBlock({ block }) {
  return <figure className={styles.diagram}>
    <div className={styles.tableScroll}>
      <table>
        <thead><tr>{block.headers.map((header, index) => <th scope="col" key={`${header}-${index}`}>{header}</th>)}</tr></thead>
        <tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>
          {row.map((cell, cellIndex) => cellIndex === 0
            ? <th scope="row" key={`${cell}-${cellIndex}`}>{cell}</th>
            : <td key={`${cell}-${cellIndex}`}>{cell}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
    <figcaption>{block.caption}</figcaption>
  </figure>;
}

function PracticeBlock({ block }) {
  return <section className={styles.practice} aria-labelledby={`practice-${safeIdPart(block.id, "item")}`}>
    <h3 id={`practice-${safeIdPart(block.id, "item")}`}>Practice</h3>
    <p>{block.prompt}</p>
    <StaticCode label="Starter code" value={block.starterCode} output={block.expectedOutput} />
    <StaticCode label="Solution" value={block.solution} />
  </section>;
}

function CheckBlock({ block }) {
  const correctAnswer = Number.isInteger(block.answer) ? block.options[block.answer] : null;
  return <section className={styles.check} aria-labelledby={`check-${safeIdPart(block.id, "item")}`}>
    <h3 id={`check-${safeIdPart(block.id, "item")}`}>Quick check</h3>
    <p className={styles.checkPrompt}>{block.prompt}</p>
    <ol className={styles.options}>{block.options.map((option, index) => <li key={`${option}-${index}`}>{option}</li>)}</ol>
    <dl className={styles.answer}>
      <dt>Correct answer</dt>
      <dd>{correctAnswer ?? "Answer unavailable"}</dd>
      <dt>Feedback</dt>
      <dd>{block.feedback}</dd>
    </dl>
  </section>;
}

function ContentBlock({ block }) {
  if (block.type === "heading") return <h3>{block.text}</h3>;
  if (block.type === "paragraph") return <p>{block.text}</p>;
  if (block.type === "list") return <ul>{block.items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>;
  if (block.type === "code") return <StaticCode label={block.title} value={block.value} output={block.output} />;
  if (block.type === "note") return <aside className={`${styles.note} ${block.tone === "warning" ? styles.warning : ""}`}><strong>{block.label}</strong><p>{block.text}</p></aside>;
  if (block.type === "diagram") return <DiagramBlock block={block} />;
  if (block.type === "practice") return <PracticeBlock block={block} />;
  if (block.type === "check") return <CheckBlock block={block} />;
  if (block.type === "connection") return <aside className={styles.connection}><strong>Why this matters in SharpRunner</strong><p>{block.text}</p></aside>;
  return null;
}

export default function BuiltInLessonRenderer({ lesson }) {
  if (!lesson) return <p role="status">Lesson content is unavailable.</p>;

  const lessonId = safeIdPart(lesson.lessonKey, "lesson");
  const titleId = `built-in-${lessonId}-title`;
  const objectivesId = `built-in-${lessonId}-objectives`;
  const referencesId = `built-in-${lessonId}-references`;

  return <article className={styles.lesson} aria-labelledby={titleId}>
    <header className={styles.header}>
      {lesson.eyebrow && <p className={styles.eyebrow}>{lesson.eyebrow}</p>}
      <h1 id={titleId}>{lesson.title}</h1>
      <p className={styles.description}>{lesson.description}</p>
    </header>

    <section className={styles.objectives} aria-labelledby={objectivesId}>
      <h2 id={objectivesId}>Learning objectives</h2>
      <ul>{lesson.objectives.map((objective, index) => <li key={`${objective}-${index}`}>{objective}</li>)}</ul>
    </section>

    <nav className={styles.contents} aria-label="Built-in lesson sections">
      <h2>Lesson sections</h2>
      <ol>{lesson.sections.map((section, index) => {
        const sectionId = `built-in-${lessonId}-${safeIdPart(section.id, `section-${index + 1}`)}`;
        return <li key={sectionId}><a href={`#${sectionId}`}>{section.title}</a></li>;
      })}</ol>
    </nav>

    <div className={styles.sections}>{lesson.sections.map((section, sectionIndex) => {
      const sectionId = `built-in-${lessonId}-${safeIdPart(section.id, `section-${sectionIndex + 1}`)}`;
      const sectionHeadingId = `${sectionId}-title`;
      return <section className={styles.section} id={sectionId} aria-labelledby={sectionHeadingId} key={sectionId}>
        <p className={styles.sectionNumber}>Section {sectionIndex + 1} of {lesson.sections.length}</p>
        <h2 id={sectionHeadingId}>{section.title}</h2>
        <div className={styles.blocks}>{section.blocks.map((block, blockIndex) => <ContentBlock
          block={block}
          key={`${block.type}-${block.id ?? blockIndex}`}
        />)}</div>
      </section>;
    })}</div>

    <section className={styles.references} aria-labelledby={referencesId}>
      <h2 id={referencesId}>References</h2>
      <nav aria-label="Lesson references">
        <ol>{lesson.references.map((reference, index) => {
          const url = safeReferenceUrl(reference.url);
          return <li key={`${reference.title}-${index}`}>
            {url
              ? <a href={url} target="_blank" rel="noopener noreferrer">{reference.title}</a>
              : reference.title}
          </li>;
        })}</ol>
      </nav>
    </section>
  </article>;
}
