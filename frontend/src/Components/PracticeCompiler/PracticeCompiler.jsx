import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import axios from "axios";
import { FiCheckCircle, FiPlay, FiRefreshCw } from "react-icons/fi";
import { buildApiUrl, getAuthHeaders, getUser } from "../../utils/auth.js";
import styles from "./PracticeCompiler.module.css";

const normalizeOutput = (value) => String(value ?? "").replace(/\r\n/g, "\n").trim();
const friendlyRuntimeHint = (stderr) => {
  if (/IndexOutOfRangeException/.test(stderr || "")) return "An array index was outside its valid range. Remember: the last index is Length - 1.";
  if (/StackOverflowException/.test(stderr || "")) return "The calls did not stop safely. Check that recursion reaches its base case.";
  if (/DivideByZeroException/.test(stderr || "")) return "An integer cannot be divided by zero. Check the divisor before dividing.";
  return null;
};

export default function PracticeCompiler({ code, editable = false, expectedOutput, label = "Run example", showEditor = true, solution, storageId }) {
  const currentUser = getUser();
  const userScope = currentUser?.id ?? currentUser?.userId ?? currentUser?.username ?? "student";
  const storageKey = storageId ? `sharprunner:practice-draft:v1:${userScope}:${storageId}` : null;
  const [value, setValue] = useState(() => {
    if (!editable || !storageKey) return code;
    try { return window.sessionStorage.getItem(storageKey) ?? code; } catch { return code; }
  });
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [showSolution, setShowSolution] = useState(false);

  useEffect(() => {
    if (!editable || !storageKey) return;
    try { window.sessionStorage.setItem(storageKey, value); } catch { /* Optional draft storage. */ }
  }, [editable, storageKey, value]);

  const run = async () => {
    if (running) return;
    setRunning(true);
    setResult(null);
    try {
      const response = await axios.post(buildApiUrl("/api/practice/run"), { code: value }, { headers: getAuthHeaders() });
      setResult(response.data);
    } catch (error) {
      const data = error.response?.data;
      setResult(data?.stdout != null || data?.stderr != null
        ? data
        : { success: false, unavailable: true, stderr: data?.message || "Practice compiler is temporarily unavailable. You can still continue reading the lesson." });
    } finally {
      setRunning(false);
    }
  };

  const reset = () => {
    setValue(code);
    setResult(null);
    if (storageKey) {
      try { window.sessionStorage.removeItem(storageKey); } catch { /* Optional draft storage. */ }
    }
  };
  const matched = result?.success && expectedOutput != null && normalizeOutput(result.stdout) === normalizeOutput(expectedOutput);
  const noOutput = result?.success && !normalizeOutput(result.stdout);
  const runtimeHint = friendlyRuntimeHint(result?.stderr);

  return <div className={`${styles.runner} ${editable ? styles.editable : styles.example}`}>
    {showEditor && <div className={styles.editorFrame}>
      <Editor height={editable ? "270px" : `${Math.min(320, Math.max(150, value.split("\n").length * 22 + 42))}px`} language="csharp" theme="vs-dark" value={value}
        onChange={(next) => editable && setValue(next ?? "")}
        options={{ readOnly: !editable, minimap: { enabled: false }, fontSize: 14, lineHeight: 22, automaticLayout: true, scrollBeyondLastLine: false, wordWrap: "on", padding: { top: 12, bottom: 12 }, overviewRulerLanes: 0, renderLineHighlight: editable ? "line" : "none" }} />
    </div>}
    <div className={styles.actions}>
      <div>{editable && <button type="button" className={styles.reset} onClick={reset} disabled={running}><FiRefreshCw /> Reset code</button>}</div>
      <button type="button" className={styles.run} onClick={run} disabled={running || !value.trim()}><FiPlay /> {running ? "Running..." : label}</button>
    </div>
    {editable && solution && <div className={styles.solutionToggle}>
      <button type="button" onClick={() => setShowSolution((shown) => !shown)}>{showSolution ? "Hide solution" : "Show solution"}</button>
      {showSolution && <pre><code>{solution}</code></pre>}
    </div>}
    {result && <div className={`${styles.output} ${result.success ? styles.outputSuccess : styles.outputError}`} aria-live="polite">
      <strong>{result.success ? "Output" : result.unavailable ? "Compiler unavailable" : result.rejected ? "Practice safety check" : "Compiler or runtime error"}</strong>
      {result.stdout && <pre>{result.stdout}</pre>}
      {result.stderr && <pre>{result.stderr}</pre>}
      {runtimeHint && <p><strong>What this usually means:</strong> {runtimeHint}</p>}
      {noOutput && <p>Program completed successfully. No output was produced.</p>}
      {matched && <p className={styles.correct}><FiCheckCircle /> Correct! Your output matches the quick self-check.</p>}
    </div>}
    <p className={styles.disclaimer}>Practice runs are private and non-graded. They do not affect score, XP, attempts, hints, or level progress.</p>
  </div>;
}
