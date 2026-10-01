import styles from "./TeacherAssessmentBuilderPage.module.css";

export function StudentCodingPreview({ question }) {
  const publicCases = question.codingTestCases.filter((testCase) => testCase.visibility === "PUBLIC");
  const signature = `public static ${question.methodContract.returnType} ${question.methodContract.methodName || "MethodName"}(${question.methodContract.parameterTypes.map((type, index) => `${type} arg${index + 1}`).join(", ")})`;
  return <div className={styles.codingPreview}>
    <p><strong>C# signature</strong></p><code>{signature}</code>
    <pre>{question.starterCode || "No starter code"}</pre>
    <h4>Public examples</h4>
    {publicCases.length ? <ul>{publicCases.map((testCase) => <li key={testCase.clientId}><span>Input: {JSON.stringify(testCase.input)}</span><span>Expected: {JSON.stringify(testCase.expectedOutput)}</span></li>)}</ul> : <p>No public examples.</p>}
  </div>;
}

export function TeacherCodingConfigurationPreview({ question, index }) {
  const hiddenCases = question.codingTestCases.filter((testCase) => testCase.visibility === "HIDDEN");
  return <article><h4>Coding question {index + 1}</h4><p><strong>Reference solution</strong></p><pre>{question.referenceSolution || "No reference solution"}</pre><h5>Hidden tests</h5>{hiddenCases.map((testCase) => <p key={testCase.clientId}>{JSON.stringify({ input: testCase.input, expectedOutput: testCase.expectedOutput, weight: testCase.weight })}</p>)}</article>;
}
