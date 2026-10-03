import { useId, useState } from "react";
import { FiArrowDown, FiArrowUp, FiCheckCircle, FiCode, FiPlus, FiTerminal, FiTrash2 } from "react-icons/fi";
import AssessmentCodeEditor from "./AssessmentCodeEditor.jsx";
import {
  METHOD_TYPES, addCodingParameter, addCodingTestCase, codingModeChangeRequiresConfirmation, defaultValueForType,
  formatArrayPreview, moveCodingParameter, moveCodingTestCase, parameterNameError, removeCodingParameter,
  removeCodingTestCase, updateCodingParameterType, updateCodingReturnType,
  resolveParameterNames, showMethodFieldError, updateCodingExecutionMode, updateCodingParameterName,
} from "./teacherAssessmentBuilderState.js";
import styles from "./TeacherAssessmentBuilderPage.module.css";

const typeLabel = (type) => type?.endsWith("[]") ? `${type} array` : type;
const updateThrough = (question, operation, ...args) => operation([question], question.clientId, ...args)[0];

function ScalarValueEditor({ type, value, disabled, label, onChange }) {
  if (type === "bool") return <label>{label}<small>{typeLabel(type)}</small><select disabled={disabled} value={String(value)} onChange={(event) => onChange(event.target.value === "true")}><option value="false">false</option><option value="true">true</option></select></label>;
  if (type === "string") return <label>{label}<small>{typeLabel(type)}</small><input disabled={disabled} type="text" value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} /></label>;
  return <label>{label}<small>{typeLabel(type)}</small><input disabled={disabled} type="number" step="1" value={Number.isInteger(value) ? value : ""} onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))} /></label>;
}

function TypedValueEditor({ type, value, disabled, label, accessibleLabel, onChange }) {
  if (!type?.endsWith("[]")) return <ScalarValueEditor type={type} value={value} disabled={disabled} label={label} onChange={onChange} />;
  const itemType = type.slice(0, -2);
  const items = Array.isArray(value) ? value : [];
  const accessibleName = accessibleLabel ?? (typeof label === "string" ? label.toLowerCase() : "array input");
  return <fieldset className={styles.arrayEditor} disabled={disabled}>
    <legend>{label} <small>{typeLabel(type)}</small></legend>
    {items.map((item, index) => <div key={`${accessibleName}-${index}`}>
      <ScalarValueEditor type={itemType} value={item} disabled={disabled} label={`Item ${index + 1}`} onChange={(next) => onChange(items.map((current, itemIndex) => itemIndex === index ? next : current))} />
      <button type="button" aria-label={`Remove value ${index + 1} from ${accessibleName}`} onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}><FiTrash2 /></button>
    </div>)}
    <button type="button" className={styles.secondaryButton} disabled={items.length >= 256} onClick={() => onChange([...items, defaultValueForType(itemType)])}><FiPlus /> Add value</button>
    <p className={styles.arrayPreview}>Array preview: <code>{formatArrayPreview(items)}</code></p>
  </fieldset>;
}

export default function CodingQuestionEditor({ question, disabled, validationAttempted = false, onChange }) {
  const executionMode = question.executionMode ?? "METHOD";
  const validationId = useId();
  const [touchedFields, setTouchedFields] = useState({ typeName: false, methodName: false, parameterNames: {} });
  const typeNameInvalid = showMethodFieldError(question.methodContract.typeName, touchedFields.typeName, validationAttempted);
  const methodNameInvalid = showMethodFieldError(question.methodContract.methodName, touchedFields.methodName, validationAttempted);
  const typeNameErrorId = `${validationId}-type-name-error`;
  const methodNameErrorId = `${validationId}-method-name-error`;
  const replace = (changes) => onChange({ ...question, ...changes });
  const setContract = (changes) => replace({ methodContract: { ...question.methodContract, ...changes } });
  const changeTest = (index, changes) => replace({ codingTestCases: question.codingTestCases.map((testCase, itemIndex) => itemIndex === index ? { ...testCase, ...changes } : testCase) });
  const parameterNames = resolveParameterNames(
    question.methodContract.parameterTypes,
    question.methodContract.parameterNames,
  );
  const signature = `public static ${question.methodContract.returnType} ${question.methodContract.methodName.trim() || "<method name>"}(${question.methodContract.parameterTypes.map((type, index) => `${type} ${parameterNames[index]?.trim() || "<parameter name>"}`).join(", ")})`;
  const resetParameterTouches = () => setTouchedFields((current) => ({ ...current, parameterNames: {} }));
  const changeParameters = (operation, ...args) => {
    resetParameterTouches();
    onChange(updateThrough(question, operation, ...args));
  };
  const switchMode = (nextMode) => {
    if (nextMode === executionMode) return;
    if (codingModeChangeRequiresConfirmation(question, nextMode)
      && !window.confirm("Changing the coding format will reset method-specific/test-case configuration that cannot be used by the new format.")) return;
    setTouchedFields({ typeName: false, methodName: false, parameterNames: {} });
    onChange(updateThrough(question, updateCodingExecutionMode, nextMode));
  };
  return <section className={styles.codingEditor} aria-label="Coding question configuration">
    <div className={styles.codingHeading}><div><span>Coding</span><strong>C#</strong></div><p>Choose how student code should be executed and graded.</p></div>
    <fieldset disabled={disabled} className={styles.formatFieldset}>
      <legend>Coding format</legend>
      <div className={styles.formatOptions}>
        <label className={`${styles.formatCard} ${executionMode === "METHOD" ? styles.formatCardSelected : ""}`}>
          <input className={styles.formatRadio} type="radio" name={`${question.clientId}-coding-format`} checked={executionMode === "METHOD"} disabled={disabled} aria-describedby={`${validationId}-method-format-description`} onChange={() => switchMode("METHOD")} />
          <span className={styles.formatCardContent}>
            <span className={styles.formatCardHeading}><span className={styles.formatIcon}><FiCode aria-hidden="true" /><code>{"{}"}</code></span><strong>Method</strong>{executionMode === "METHOD" && <span className={styles.selectedBadge}><FiCheckCircle aria-hidden="true" /> Selected</span>}</span>
            <span id={`${validationId}-method-format-description`} className={styles.formatDescription}>Students implement a required C# method. SharpRunner calls the method with test inputs and checks its return value.</span>
          </span>
        </label>
        <label className={`${styles.formatCard} ${executionMode === "PROGRAM" ? styles.formatCardSelected : ""}`}>
          <input className={styles.formatRadio} type="radio" name={`${question.clientId}-coding-format`} checked={executionMode === "PROGRAM"} disabled={disabled} aria-describedby={`${validationId}-program-format-description`} onChange={() => switchMode("PROGRAM")} />
          <span className={styles.formatCardContent}>
            <span className={styles.formatCardHeading}><span className={styles.formatIcon}><FiTerminal aria-hidden="true" /><code>&gt;_</code></span><strong>Program / Main</strong>{executionMode === "PROGRAM" && <span className={styles.selectedBadge}><FiCheckCircle aria-hidden="true" /> Selected</span>}</span>
            <span id={`${validationId}-program-format-description`} className={styles.formatDescription}>Students write a complete C# program. SharpRunner provides optional console input and checks the program&apos;s output.</span>
          </span>
        </label>
      </div>
    </fieldset>
    {executionMode === "METHOD" && <fieldset disabled={disabled} className={styles.signatureFieldset}>
      <legend>Method signature</legend>
      <div className={styles.codingGrid}>
        <label>Type/Class name<input value={question.methodContract.typeName} maxLength={128} placeholder="Example: Solution" aria-invalid={typeNameInvalid} aria-describedby={typeNameInvalid ? typeNameErrorId : undefined} onBlur={() => setTouchedFields((current) => ({ ...current, typeName: true }))} onChange={(event) => setContract({ typeName: event.target.value })} />{typeNameInvalid && <span id={typeNameErrorId} className={styles.inlineError}>Type/class name is required.</span>}</label>
        <label>Method name<input value={question.methodContract.methodName} maxLength={64} placeholder="Example: AddNumbers" aria-invalid={methodNameInvalid} aria-describedby={methodNameInvalid ? methodNameErrorId : undefined} onBlur={() => setTouchedFields((current) => ({ ...current, methodName: true }))} onChange={(event) => setContract({ methodName: event.target.value })} />{methodNameInvalid && <span id={methodNameErrorId} className={styles.inlineError}>Method name is required.</span>}</label>
        <label>Return type<select value={question.methodContract.returnType} onChange={(event) => onChange(updateThrough(question, updateCodingReturnType, event.target.value))}>{METHOD_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
      </div>
      <div className={styles.signaturePreview}><span>Signature preview</span><code>{signature}</code><p>Students must implement this exact signature.</p></div>
      <div className={styles.parameterHeading}><h4>Parameters</h4><button type="button" className={styles.secondaryButton} disabled={question.methodContract.parameterTypes.length >= 8} onClick={() => changeParameters(addCodingParameter, "int")}><FiPlus /> Add parameter</button></div>
      {question.methodContract.parameterTypes.map((type, index) => {
        const nameError = parameterNameError(parameterNames, index);
        const showNameError = Boolean(nameError && (touchedFields.parameterNames[index] || validationAttempted));
        const nameInputId = `${validationId}-parameter-${index}-name`;
        const nameErrorId = `${validationId}-parameter-${index}-error`;
        const errorMessage = nameError === "required" ? "Parameter name is required."
          : nameError === "duplicate" ? "Parameter names must be unique."
            : "Use a valid C# parameter name.";
        return <div className={styles.parameterRow} key={`parameter-${index}`}>
          <h5>Parameter {index + 1}</h5>
          <div className={styles.parameterFields}>
            <label htmlFor={nameInputId}>Parameter name<input id={nameInputId} value={parameterNames[index] ?? ""} maxLength={64} placeholder="parameterName" aria-invalid={showNameError} aria-describedby={showNameError ? nameErrorId : undefined} onBlur={() => setTouchedFields((current) => ({ ...current, parameterNames: { ...current.parameterNames, [index]: true } }))} onChange={(event) => onChange(updateThrough(question, updateCodingParameterName, index, event.target.value))} />{showNameError && <span id={nameErrorId} className={styles.inlineError}>{errorMessage}</span>}</label>
            <label>Type<select value={type} onChange={(event) => onChange(updateThrough(question, updateCodingParameterType, index, event.target.value))}>{METHOD_TYPES.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}</select></label>
          </div>
          <div className={styles.parameterActions}>
            <button type="button" disabled={index === 0} aria-label={`Move parameter ${index + 1} up`} onClick={() => changeParameters(moveCodingParameter, index, -1)}><FiArrowUp /></button>
            <button type="button" disabled={index === question.methodContract.parameterTypes.length - 1} aria-label={`Move parameter ${index + 1} down`} onClick={() => changeParameters(moveCodingParameter, index, 1)}><FiArrowDown /></button>
            <button type="button" aria-label={`Remove parameter ${index + 1}`} onClick={() => changeParameters(removeCodingParameter, index)}><FiTrash2 /></button>
          </div>
        </div>;
      })}
    </fieldset>}
    <div className={styles.codeEditorGrid}>
      <AssessmentCodeEditor label="Starter code (optional)" value={question.starterCode} disabled={disabled} onChange={(starterCode) => replace({ starterCode })} description="Optional code students receive when they begin this question." />
      <AssessmentCodeEditor label="Reference solution (optional)" value={question.referenceSolution} disabled={disabled} onChange={(referenceSolution) => replace({ referenceSolution })} description="Optional teacher-only solution. It is never shown to students and is not required for grading." />
    </div>
    <fieldset disabled={disabled} className={styles.testCasesFieldset}>
      <legend>Test cases</legend>
      <p><strong>PUBLIC</strong> cases become student-visible examples. <strong>HIDDEN</strong> cases are optional, used for server-only grading, and never shown to students. At least one test case is required. Weights control each test's share of this question's points.</p>
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
            {question.methodContract.parameterTypes.map((type, inputIndex) => {
              const displayName = parameterNames[inputIndex]?.trim() || "parameter";
              return <TypedValueEditor key={`input-${inputIndex}`} type={type} value={testCase.input[inputIndex]} disabled={disabled} label={<>Input for <code>{parameterNames[inputIndex]?.trim() || "<parameter name>"}</code></>} accessibleLabel={`input for ${displayName}`} onChange={(value) => changeTest(testIndex, { input: testCase.input.map((item, itemIndex) => itemIndex === inputIndex ? value : item) })} />;
            })}
            <TypedValueEditor type={question.methodContract.returnType} value={testCase.expectedOutput} disabled={disabled} label="Expected return value" onChange={(expectedOutput) => changeTest(testIndex, { expectedOutput })} />
          </>}
        </div>
      </article>)}
      <button type="button" className={styles.secondaryButton} disabled={question.codingTestCases.length >= 10} onClick={() => onChange(updateThrough(question, addCodingTestCase, "PUBLIC"))}><FiPlus /> Add test case</button>
    </fieldset>
    <p className={styles.configurationNote}>Coding execution availability depends on the secure assessment runner configured for this deployment.</p>
  </section>;
}
