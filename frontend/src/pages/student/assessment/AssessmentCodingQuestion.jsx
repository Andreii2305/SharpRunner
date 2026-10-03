import AssessmentCodeEditor from "../../../Components/AssessmentCodeEditor/AssessmentCodeEditor.jsx";
import { resolveParameterNames } from "../../../utils/codingMethodContract.js";
import styles from "./AssessmentPlayer.module.css";

const displayValue = (value) => {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return "Unavailable";
  }
};

const contractText = (contract = {}) => {
  const parameterNames = resolveParameterNames(contract.parameterTypes, contract.parameterNames);
  const parameters = Array.isArray(contract.parameterTypes)
    ? contract.parameterTypes.map((type, index) => `${type} ${parameterNames[index]}`).join(", ")
    : "";
  return `public static ${contract.returnType ?? "void"} ${contract.typeName ?? "Solution"}.${contract.methodName ?? "Solve"}(${parameters})`;
};

const statusLabel = (status) => ({
  SUCCESS: "Completed",
  COMPILE_ERROR: "Compile error",
  SIGNATURE_ERROR: "Signature error",
  RUNTIME_ERROR: "Runtime error",
  TIMEOUT: "Time limit exceeded",
  OUTPUT_LIMIT: "Output limit exceeded",
  RESOURCE_LIMIT: "Resource limit exceeded",
  POLICY_REJECTION: "Code policy rejected",
  NO_PUBLIC_TESTS: "No public tests are available",
}[status] ?? "Run completed");

const testStatusLabel = (test) => {
  if (test.passed) return "Passed";
  return test.status === "SUCCESS" ? "Failed" : statusLabel(test.status);
};

export default function AssessmentCodingQuestion({
  question,
  sourceCode,
  onSourceChange,
  disabled = false,
  containerRef,
  runState,
  onRun,
}) {
  const groupName = `assessment-question-${question.id}`;
  const examples = Array.isArray(question.codingExamples) ? question.codingExamples : [];
  const result = runState?.result;
  const programMode = question.executionMode === "PROGRAM";

  return (
    <section
      className={styles.question}
      ref={containerRef}
      tabIndex="-1"
      aria-labelledby={`${groupName}-title`}
    >
      <h2 id={`${groupName}-title`} className={styles.questionText}>{question.questionText}</h2>
      <p className={styles.codingLanguage}>C# coding question</p>
      <p>{programMode
        ? "Write a complete C# program. Your program's output will be checked against the expected results."
        : "Implement the required method. Your source is saved automatically."}</p>
      {programMode ? <div className={styles.contract}><strong>Coding format</strong><span>Program / Main</span></div> : <div className={styles.contract}>
        <strong>Required method signature</strong>
        <code>{contractText(question.methodContract)}</code>
      </div>}

      {examples.length > 0 && (
        <section className={styles.publicTests} aria-label="Public examples">
          <h3>Public examples</h3>
          <ol>
            {examples.map((example, index) => (
              <li key={`${question.id}-example-${index}`}>
                <div><strong>Input</strong><code>{programMode && example.input === "" ? "No input" : displayValue(example.input)}</code></div>
                <div><strong>Expected output</strong><code>{displayValue(example.expectedOutput)}</code></div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <AssessmentCodeEditor
        label={`Code answer for question ${question.id}`}
        description={programMode ? "Write a complete C# program with an entry point such as Main()." : "Use only the required C# method contract shown above."}
        value={sourceCode}
        onChange={(next) => onSourceChange(question.id, next)}
        disabled={disabled}
        height="320px"
      />

      <div
        className={styles.runArea}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-busy={runState?.status === "running"}
      >
        <button type="button" onClick={() => onRun(question.id)} disabled={disabled || runState?.status === "running"}>
          {runState?.status === "running" ? "Running code..." : "Run code"}
        </button>
        {runState?.status === "error" && (
          <p role="alert">{runState.message}</p>
        )}
      </div>

      {result && (
        <section className={styles.runResults} aria-live="polite" aria-label="Public test results">
          <h3>{statusLabel(result.status)}</h3>
          {result.message && <p>{result.message}</p>}
          {Array.isArray(result.diagnostics) && result.diagnostics.length > 0 && (
            <ul>{result.diagnostics.map((item, index) => (
              <li key={`${item.id ?? "diagnostic"}-${index}`}>
                Line {item.line}, column {item.column}: {item.message}
              </li>
            ))}</ul>
          )}
          {Array.isArray(result.tests) && result.tests.length > 0 && (
            <ol>
              {result.tests.map((test, index) => (
                <li key={`${question.id}-run-${index}`}>
                  <strong>Public test {index + 1}: {testStatusLabel(test)}</strong>
                  <div>Input <code>{displayValue(test.input)}</code></div>
                  <div>Expected output <code>{displayValue(test.expectedOutput)}</code></div>
                  {Object.prototype.hasOwnProperty.call(test, "actualOutput") && (
                    <div>Actual output <code>{displayValue(test.actualOutput)}</code></div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </section>
  );
}
