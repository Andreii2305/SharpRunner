import Editor from "@monaco-editor/react";

export default function AssessmentCodeEditor({ label, value, onChange, disabled = false, description }) {
  return <div aria-label={label}>
    <div><strong>{label}</strong><span>C#</span></div>
    {description && <p>{description}</p>}
    <Editor
      height="240px"
      language="csharp"
      theme="vs-dark"
      value={value ?? ""}
      onChange={(next) => onChange(next ?? "")}
      options={{
        ariaLabel: label,
        automaticLayout: true,
        minimap: { enabled: false },
        readOnly: disabled,
        scrollBeyondLastLine: false,
        tabSize: 4,
      }}
    />
  </div>;
}
