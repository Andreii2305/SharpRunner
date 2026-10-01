import Editor from "@monaco-editor/react";
import { useId } from "react";

export default function AssessmentCodeEditor({
  label,
  value,
  onChange,
  disabled = false,
  description,
  height = "240px",
}) {
  const editorId = useId();
  const labelId = `${editorId}-label`;
  const descriptionId = `${editorId}-description`;
  const editorValue = value ?? "";
  const serverNeedsFallback = typeof window === "undefined" && typeof Editor !== "function";
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      aria-describedby={description ? descriptionId : undefined}
      style={{ minWidth: 0, overflow: "hidden" }}
    >
      <div><strong id={labelId}>{label}</strong><span> C#</span></div>
      {description && <p id={descriptionId}>{description}</p>}
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
