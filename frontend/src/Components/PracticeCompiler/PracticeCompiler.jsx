import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import axios from "axios";
import { FiCheckCircle, FiPlay, FiRefreshCw } from "react-icons/fi";
import { buildApiUrl, getAuthHeaders, getUser } from "../../utils/auth.js";
import styles from "./PracticeCompiler.module.css";
import { classifyPracticeRequestError } from "./practiceCompilerState.js";

let compilerWarmupPromise;
const WARMUP_INTERVAL_MS = 5 * 60 * 1000;
const WARMUP_STORAGE_KEY = "sharprunner:practice-warmup-at:v1";
const warmPracticeCompiler = () => {
  let lastWarmup = 0;
  try { lastWarmup = Number(window.sessionStorage.getItem(WARMUP_STORAGE_KEY)) || 0; } catch { /* Optional throttle storage. */ }
  if (Date.now() - lastWarmup < WARMUP_INTERVAL_MS) return compilerWarmupPromise ?? Promise.resolve();
  try { window.sessionStorage.setItem(WARMUP_STORAGE_KEY, String(Date.now())); } catch { /* Optional throttle storage. */ }
  compilerWarmupPromise = axios
    .get(buildApiUrl("/api/practice/health"), { headers: getAuthHeaders(), timeout: 4_000 })
    .catch(() => null)
    .finally(() => { compilerWarmupPromise = undefined; });
  return compilerWarmupPromise;
};

const normalizeOutput = (value) => String(value ?? "").replace(/\r\n/g, "\n").trim();
const friendlyRuntimeHint = (stderr) => {
  if (/IndexOutOfRangeException/.test(stderr || "")) return "An array index was outside its valid range. Remember: the last index is Length - 1.";
  if (/StackOverflowException/.test(stderr || "")) return "The calls did not stop safely. Check that recursion reaches its base case.";
  if (/DivideByZeroException/.test(stderr || "")) return "An integer cannot be divided by zero. Check the divisor before dividing.";
  return null;
};

const resultTitle = (result) => {
  if (result.success) return "Actual output";
  if (result.errorType === "authentication") return "Compiler authentication error";
  if (result.errorType === "service_starting") return "Compiler is starting...";
  if (result.errorType === "service_unavailable" || result.unavailable) return "Compiler temporarily unavailable";
  if (result.rejected) return "Practice safety check";
  if (result.errorType === "auth") return "Sign-in required";
  if (["rate_limit", "runner_busy"].includes(result.errorType)) return "Compiler busy";
  if (result.outputLimited || result.errorType === "output_limit") return "Output limit reached";
  if (result.timedOut || result.errorType === "timeout") return "Execution timed out";
  if (result.errorType === "compiler") return "Compiler error";
  if (result.errorType === "runtime") return "Runtime error";
  if (result.errorType === "internal") return "Compiler service error";
  return "Compiler or runtime error";
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
  const [runStatus, setRunStatus] = useState("");
  const [showSolution, setShowSolution] = useState(false);
  const [retryUntil, setRetryUntil] = useState(0);
  const retryBlocked = retryUntil > Date.now();

  useEffect(() => { void warmPracticeCompiler(); }, []);

  useEffect(() => {
    if (!retryUntil) return undefined;
    const timer = window.setTimeout(() => setRetryUntil(0), Math.max(0, retryUntil - Date.now()));
    return () => window.clearTimeout(timer);
  }, [retryUntil]);

  useEffect(() => {
    if (!editable || !storageKey) return;
    try { window.sessionStorage.setItem(storageKey, value); } catch { /* Optional draft storage. */ }
  }, [editable, storageKey, value]);

  const run = async () => {
    if (running || retryBlocked) return;
    setRunning(true);
    setRunStatus("Running...");
    if (!result?.unavailable) setResult(null);
    try {
      const response = await axios.post(buildApiUrl("/api/practice/run"), { code: value }, { headers: getAuthHeaders() });
      setResult(response.data);
    } catch (error) {
      const nextResult = classifyPracticeRequestError(error);
      setResult(nextResult);
      if (nextResult.retryAfterMs) setRetryUntil(Date.now() + nextResult.retryAfterMs);
    } finally {
      setRunStatus("");
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
      <button type="button" className={styles.run} onClick={run} disabled={running || !value.trim()}><FiPlay /> {running ? runStatus : label}</button>
    </div>
    {editable && solution && <div className={styles.solutionToggle}>
      <button type="button" onClick={() => setShowSolution((shown) => !shown)}>{showSolution ? "Hide solution" : "Show solution"}</button>
      {showSolution && <pre><code>{solution}</code></pre>}
    </div>}
    <div className={styles.outputGrid}>
      <div className={styles.expected}>
        <strong>Expected output</strong>
        <pre>{expectedOutput == null ? "Not provided" : expectedOutput === "" ? "No output expected" : expectedOutput}</pre>
      </div>
      <div className={`${styles.output} ${!result ? styles.outputIdle : result.success ? styles.outputSuccess : styles.outputError}`} aria-live="polite">
        <strong>{result ? resultTitle(result) : "Actual output"}</strong>
        {!result && <p>Not run yet</p>}
        {result?.stdout && <pre>{result.stdout}</pre>}
        {result?.stderr && <pre>{result.stderr}</pre>}
        {runtimeHint && <p><strong>What this usually means:</strong> {runtimeHint}</p>}
        {noOutput && <p>Program completed successfully. No output was produced.</p>}
        {matched && <p className={styles.correct}><FiCheckCircle /> Correct! Your output matches the quick self-check.</p>}
        {(result?.unavailable || result?.errorType === "runner_busy") && <button type="button" className={styles.retry} onClick={run} disabled={running || retryBlocked}><FiRefreshCw /> {running ? "Checking..." : retryBlocked ? "Try again shortly" : "Try again"}</button>}
      </div>
    </div>
    <p className={styles.disclaimer}>Practice runs are private and non-graded. They do not affect score, XP, attempts, hints, or level progress.</p>
  </div>;
}
