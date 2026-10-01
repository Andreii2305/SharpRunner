import Editor from "@monaco-editor/react";

export default function AssessmentCodeEditor({
  label,
  value,
  onChange,
  disabled = false,
  description,
  height = "240px",
}) {
  const editorValue = value ?? "";
  const serverNeedsFallback = typeof window === "undefined" && typeof Editor !== "function";
  return (
    <div aria-label={label}>
      <div><strong>{label}</strong><span> C#</span></div>
      {description && <p>{description}</p>}
      {serverNeedsFallback ? (
        <pre role="textbox" aria-label={label} aria-readonly={disabled}>{editorValue}</pre>
      ) : (
        <Editor
          height={height}
          language="csharp"
          theme="vs-dark"
          value={editorValue}
          onChange={(next) => onChange?.(next ?? "")}
          options={{
            ariaLabel: label,
            automaticLayout: true,
            minimap: { enabled: false },
            readOnly: disabled,
            scrollBeyondLastLine: false,
            tabSize: 4,
          }}
        />
      )}
    </div>
  );
}
