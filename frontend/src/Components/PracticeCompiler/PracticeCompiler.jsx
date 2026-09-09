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

const classifyRequestError = (error) => {
  const status = error.response?.status;
  const data = error.response?.data;
  if (data?.stdout != null || data?.stderr != null) return data;
  if (status === 401 || status === 403) return { success: false, errorType: "auth", stderr: "Your session is no longer authorized to run practice code. Sign in again, then retry." };
  if (status === 400) return { success: false, rejected: true, stderr: data?.message || "The practice request was invalid. Check the code and try again." };
  if (status === 408) return { success: false, timedOut: true, errorType: "timeout", stderr: data?.message || "Execution took too long and was stopped." };
  if (status === 429) return { success: false, errorType: "rate_limit", stderr: data?.message || "Too many runs. Please wait a moment and try again." };
  if (status === 500) return { success: false, errorType: "internal", stderr: data?.message || "The compiler encountered an internal error. Try again in a moment." };
  return { success: false, unavailable: true, errorType: "unavailable", stderr: data?.message || "We couldn't reach the practice compiler. You can continue reading this lesson and try again later." };
};

const resultTitle = (result) => {
  if (result.success) return "Actual output";
  if (result.unavailable) return "Compiler temporarily unavailable";
  if (result.rejected) return "Practice safety check";
  if (result.errorType === "auth") return "Sign-in required";
  if (result.errorType === "rate_limit") return "Too many runs";
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
  const [showSolution, setShowSolution] = useState(false);

  useEffect(() => {
    if (!editable || !storageKey) return;
    try { window.sessionStorage.setItem(storageKey, value); } catch { /* Optional draft storage. */ }
  }, [editable, storageKey, value]);

  const run = async () => {
    if (running) return;
    setRunning(true);
    if (!result?.unavailable) setResult(null);
    try {
      const response = await axios.post(buildApiUrl("/api/practice/run"), { code: value }, { headers: getAuthHeaders() });
      setResult(response.data);
    } catch (error) {
      setResult(classifyRequestError(error));
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
        {result?.unavailable && <button type="button" className={styles.retry} onClick={run} disabled={running}><FiRefreshCw /> {running ? "Checking..." : "Try again"}</button>}
      </div>
    </div>
    <p className={styles.disclaimer}>Practice runs are private and non-graded. They do not affect score, XP, attempts, hints, or level progress.</p>
  </div>;
}
