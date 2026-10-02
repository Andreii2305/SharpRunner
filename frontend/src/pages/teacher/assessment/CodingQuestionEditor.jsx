import { useId } from "react";
import { FiArrowDown, FiArrowUp, FiPlus, FiTrash2 } from "react-icons/fi";
import AssessmentCodeEditor from "./AssessmentCodeEditor.jsx";
import {
  METHOD_TYPES, addCodingParameter, addCodingTestCase, codingModeChangeRequiresConfirmation, defaultValueForType,
  moveCodingParameter, moveCodingTestCase, removeCodingParameter,
  removeCodingTestCase, updateCodingParameterType, updateCodingReturnType,
  updateCodingExecutionMode,
} from "./teacherAssessmentBuilderState.js";
import styles from "./TeacherAssessmentBuilderPage.module.css";

const typeLabel = (type) => type.replace("[]", " array");
const updateThrough = (question, operation, ...args) => operation([question], question.clientId, ...args)[0];

function ScalarValueEditor({ type, value, disabled, label, onChange }) {
  if (type === "bool") return <label>{label}<select disabled={disabled} value={String(value)} onChange={(event) => onChange(event.target.value === "true")}><option value="false">false</option><option value="true">true</option></select></label>;
  if (type === "string") return <label>{label}<input disabled={disabled} type="text" value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} /></label>;
  return <label>{label}<input disabled={disabled} type="number" step="1" value={Number.isInteger(value) ? value : ""} onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))} /></label>;
}

function TypedValueEditor({ type, value, disabled, label, onChange }) {
  if (!type?.endsWith("[]")) return <ScalarValueEditor type={type} value={value} disabled={disabled} label={label} onChange={onChange} />;
  const itemType = type.slice(0, -2);
  const items = Array.isArray(value) ? value : [];
  return <fieldset className={styles.arrayEditor} disabled={disabled}>
    <legend>{label} <small>{typeLabel(type)}</small></legend>
    {items.map((item, index) => <div key={`${label}-${index}`}>
      <ScalarValueEditor type={itemType} value={item} disabled={disabled} label={`Item ${index + 1}`} onChange={(next) => onChange(items.map((current, itemIndex) => itemIndex === index ? next : current))} />
      <button type="button" aria-label={`Remove ${label} item ${index + 1}`} onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}><FiTrash2 /></button>
    </div>)}
    <button type="button" className={styles.secondaryButton} disabled={items.length >= 256} onClick={() => onChange([...items, defaultValueForType(itemType)])}><FiPlus /> Add item</button>
  </fieldset>;
}

export default function CodingQuestionEditor({ question, disabled, onChange }) {
  const executionMode = question.executionMode ?? "METHOD";
  const validationId = useId();
  const typeNameInvalid = !question.methodContract.typeName.trim();
  const methodNameInvalid = !question.methodContract.methodName.trim();
  const typeNameErrorId = `${validationId}-type-name-error`;
  const methodNameErrorId = `${validationId}-method-name-error`;
  const replace = (changes) => onChange({ ...question, ...changes });
  const setContract = (changes) => replace({ methodContract: { ...question.methodContract, ...changes } });
  const changeTest = (index, changes) => replace({ codingTestCases: question.codingTestCases.map((testCase, itemIndex) => itemIndex === index ? { ...testCase, ...changes } : testCase) });
  const signature = `public static ${question.methodContract.returnType} ${question.methodContract.methodName || "MethodName"}(${question.methodContract.parameterTypes.map((type, index) => `${type} arg${index + 1}`).join(", ")})`;
  const switchMode = (nextMode) => {
    if (nextMode === executionMode) return;
    if (codingModeChangeRequiresConfirmation(question, nextMode)
      && !window.confirm("Changing the coding format will reset method-specific/test-case configuration that cannot be used by the new format.")) return;
    onChange(updateThrough(question, updateCodingExecutionMode, nextMode));
  };
  return <section className={styles.codingEditor} aria-label="Coding question configuration">
    <div className={styles.codingHeading}><div><span>Coding</span><strong>C#</strong></div><p>Choose how student code should be executed and graded.</p></div>
    <fieldset disabled={disabled} className={styles.signatureFieldset}>
      <legend>Coding format</legend>
      <label><input type="radio" name={`${question.clientId}-coding-format`} checked={executionMode === "METHOD"} onChange={() => switchMode("METHOD")} /> Method</label>
      <p>Students implement a required C# method. SharpRunner calls the method with test inputs and checks its return value.</p>
      <label><input type="radio" name={`${question.clientId}-coding-format`} checked={executionMode === "PROGRAM"} onChange={() => switchMode("PROGRAM")} /> Program / Main</label>
      <p>Students write a complete C# program. SharpRunner provides optional console input and checks the program&apos;s output.</p>
    </fieldset>
    {executionMode === "METHOD" && <fieldset disabled={disabled} className={styles.signatureFieldset}>
      <legend>Method signature</legend>
      <div className={styles.codingGrid}>
        <label>Type/Class name<input value={question.methodContract.typeName} maxLength={128} placeholder="Solution" aria-invalid={typeNameInvalid} aria-describedby={typeNameInvalid ? typeNameErrorId : undefined} onChange={(event) => setContract({ typeName: event.target.value })} />{typeNameInvalid && <span id={typeNameErrorId} className={styles.inlineError}>Type/class name is required.</span>}</label>
        <label>Method name<input value={question.methodContract.methodName} maxLength={64} placeholder="AddNumbers" aria-invalid={methodNameInvalid} aria-describedby={methodNameInvalid ? methodNameErrorId : undefined} onChange={(event) => setContract({ methodName: event.target.value })} />{methodNameInvalid && <span id={methodNameErrorId} className={styles.inlineError}>Method name is required.</span>}</label>
        <label>Return type<select value={question.methodContract.returnType} onChange={(event) => onChange(updateThrough(question, updateCodingReturnType, event.target.value))}>{METHOD_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
      </div>
      <div className={styles.signaturePreview}><span>Signature preview</span><code>{signature}</code></div>
      <div className={styles.parameterHeading}><h4>Parameters</h4><button type="button" className={styles.secondaryButton} disabled={question.methodContract.parameterTypes.length >= 8} onClick={() => onChange(updateThrough(question, addCodingParameter, "int"))}><FiPlus /> Add parameter</button></div>
      {question.methodContract.parameterTypes.map((type, index) => <div className={styles.parameterRow} key={`parameter-${index}`}>
        <span>Argument {index + 1}</span>
        <label><span className={styles.srOnly}>Argument {index + 1} type</span><select value={type} onChange={(event) => onChange(updateThrough(question, updateCodingParameterType, index, event.target.value))}>{METHOD_TYPES.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}</select></label>
        <button type="button" disabled={index === 0} aria-label={`Move parameter ${index + 1} up`} onClick={() => onChange(updateThrough(question, moveCodingParameter, index, -1))}><FiArrowUp /></button>
        <button type="button" disabled={index === question.methodContract.parameterTypes.length - 1} aria-label={`Move parameter ${index + 1} down`} onClick={() => onChange(updateThrough(question, moveCodingParameter, index, 1))}><FiArrowDown /></button>
        <button type="button" aria-label={`Remove parameter ${index + 1}`} onClick={() => onChange(updateThrough(question, removeCodingParameter, index))}><FiTrash2 /></button>
      </div>)}
    </fieldset>}
    <div className={styles.codeEditorGrid}>
      <AssessmentCodeEditor label="Starter code" value={question.starterCode} disabled={disabled} onChange={(starterCode) => replace({ starterCode })} description="Optional code students receive when they begin this question." />
      <AssessmentCodeEditor label="Reference solution" value={question.referenceSolution} disabled={disabled} onChange={(referenceSolution) => replace({ referenceSolution })} description="This teacher-only solution is never shown to students." />
    </div>
    <fieldset disabled={disabled} className={styles.testCasesFieldset}>
      <legend>Test cases</legend>
      <p><strong>PUBLIC</strong> cases become student-visible examples. <strong>HIDDEN</strong> cases are used for grading and never shown to students. Weights control each test's share of this question's points.</p>
      {question.codingTestCases.map((testCase, testIndex) => <article className={styles.testCaseCard} key={testCase.clientId}>
        <header><div><span>Test {testIndex + 1}</span><strong className={testCase.visibility === "HIDDEN" ? styles.hiddenBadge : styles.publicBadge}>{testCase.visibility}</strong></div><div className={styles.iconActions}>
          <button type="button" disabled={testIndex === 0} aria-label={`Move test ${testIndex + 1} up`} onClick={() => onChange(updateThrough(question, moveCodingTestCase, testIndex, -1))}><FiArrowUp /></button>
          <button type="button" disabled={testIndex === question.codingTestCases.length - 1} aria-label={`Move test ${testIndex + 1} down`} onClick={() => onChange(updateThrough(question, moveCodingTestCase, testIndex, 1))}><FiArrowDown /></button>
          <button type="button" aria-label={`Remove test ${testIndex + 1}`} onClick={() => onChange(updateThrough(question, removeCodingTestCase, testIndex))}><FiTrash2 /></button>
        </div></header>
        <div className={styles.testCaseGrid}>
          <label>Visibility<select value={testCase.visibility} onChange={(event) => changeTest(testIndex, { visibility: event.target.value })}><option value="PUBLIC">PUBLIC — student example</option><option value="HIDDEN">HIDDEN — grading only</option></select></label>
          <label>Weight<input type="number" min="0.01" max="99999999.99" step="0.01" value={testCase.weight} onChange={(event) => changeTest(testIndex, { weight: event.target.value })} /></label>
        </div>
        <div className={styles.testValues}>
          {executionMode === "PROGRAM" ? <>
            <label>Standard input<textarea value={testCase.input} onChange={(event) => changeTest(testIndex, { input: event.target.value })} /><small>Text provided through Console.ReadLine(). Leave blank if no input is required.</small></label>
            <label>Expected output<textarea value={testCase.expectedOutput} onChange={(event) => changeTest(testIndex, { expectedOutput: event.target.value })} /><small>The output SharpRunner expects the program to print. Leave blank when no output is expected.</small></label>
          </> : <>
            {question.methodContract.parameterTypes.map((type, inputIndex) => <TypedValueEditor key={`input-${inputIndex}`} type={type} value={testCase.input[inputIndex]} disabled={disabled} label={`Argument ${inputIndex + 1} (${type})`} onChange={(value) => changeTest(testIndex, { input: testCase.input.map((item, itemIndex) => itemIndex === inputIndex ? value : item) })} />)}
            <TypedValueEditor type={question.methodContract.returnType} value={testCase.expectedOutput} disabled={disabled} label={`Expected output (${question.methodContract.returnType})`} onChange={(expectedOutput) => changeTest(testIndex, { expectedOutput })} />
          </>}
        </div>
      </article>)}
      <button type="button" className={styles.secondaryButton} disabled={question.codingTestCases.length >= 10} onClick={() => onChange(updateThrough(question, addCodingTestCase, "PUBLIC"))}><FiPlus /> Add test case</button>
      {!question.codingTestCases.some((testCase) => testCase.visibility === "HIDDEN") && <p className={styles.inlineError} role="status">Add at least one HIDDEN test case before publication.</p>}
    </fieldset>
    <p className={styles.configurationNote}>Coding execution availability depends on the secure assessment runner configured for this deployment.</p>
  </section>;
}
