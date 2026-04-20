import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import Editor from "@monaco-editor/react";
import Sidebar from "../../Components/SideBar/Sidebar.jsx";
import { buildApiUrl, getAuthHeaders } from "../../utils/auth.js";
import { getLevelConfig, getAvailableLevelNumbers } from "../game/levels/levelConfigs.js";
import styles from "./TeacherPage.module.css";
import s from "./TeacherLevelEditorPage.module.css";

const AVAILABLE_LEVELS = getAvailableLevelNumbers();

const toFormData = (levelConfig, override) => {
  const vc = override?.validatorConfig ?? levelConfig?.validatorConfig ?? {};
  const isExact = vc.type === "exactGoal";
  const g0 = isExact ? (vc.goals?.[0] ?? {}) : {};
  return {
    lessonCardTitle:       override?.lessonCardTitle       ?? levelConfig?.lessonCard?.title       ?? "",
    lessonCardDescription: override?.lessonCardDescription ?? levelConfig?.lessonCard?.description ?? "",
    goalTitle:             override?.goalTitle             ?? levelConfig?.goal?.title             ?? "",
    goalDescription:       override?.goalDescription       ?? levelConfig?.goal?.description       ?? "",
    instructionItems:      override?.instructionItems      ?? levelConfig?.instruction?.items      ?? [""],
    defaultCode:           override?.defaultCode           ?? levelConfig?.defaultCode             ?? "",
    validatorType:         vc.type ?? "singleInteger",
    variableName:          isExact ? (g0.name ?? "") : (vc.variableName ?? ""),
    minValue:              vc.minValue != null ? String(vc.minValue) : "",
    maxValue:              vc.maxValue != null ? String(vc.maxValue) : "",
    goalAllowedType:       isExact ? ([...(g0.allowedTypes ?? [])][0] ?? "string") : "string",
    goalRequiredValue:     isExact ? (g0.requiredValue ?? "") : "",
    successMessage:        vc.successMessage ?? "",
    errorMessage:          vc.errorMessage ?? "",
    unexpectedVariableMessage: vc.unexpectedVariableMessage ?? "",
  };
};

const buildValidatorConfig = (form) => {
  const base = { type: form.validatorType };
  if (form.successMessage.trim())            base.successMessage = form.successMessage.trim();
  if (form.errorMessage.trim())              base.errorMessage   = form.errorMessage.trim();
  if (form.unexpectedVariableMessage.trim()) base.unexpectedVariableMessage = form.unexpectedVariableMessage.trim();

  if (form.validatorType === "singleInteger") {
    base.variableName = form.variableName.trim();
    if (form.minValue !== "") base.minValue = Number(form.minValue);
    if (form.maxValue !== "") base.maxValue = Number(form.maxValue);
    return base;
  }
  if (form.validatorType === "exactGoal") {
    base.goals = [{ name: form.variableName.trim(), allowedTypes: [form.goalAllowedType], requiredValue: form.goalRequiredValue.trim() }];
    return base;
  }
  return null;
};

/* ── Small reusable bits ── */
function SCard({ icon, iconCls, title, children }) {
  return (
    <div className={s.card}>
      <div className={s.cardHead}>
        <div className={`${s.cardIcon} ${iconCls}`}>{icon}</div>
        <span className={s.cardTitle}>{title}</span>
      </div>
      <div className={s.cardBody}>{children}</div>
    </div>
  );
}

function F({ label, children, half }) {
  return (
    <div className={half ? s.fieldHalf : s.field}>
      {label && <span className={s.label}>{label}</span>}
      {children}
    </div>
  );
}

/* ── Page ── */
function TeacherLevelEditorPage() {
  const { classroomId } = useParams();
  const navigate = useNavigate();

  const [overridesMap, setOverridesMap] = useState({});
  const [selectedLevel, setSelectedLevel] = useState(AVAILABLE_LEVELS[0] ?? 1);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editorHeight, setEditorHeight] = useState(200);
  const editorRef = useRef(null);

  const fetchOverrides = useCallback(async () => {
    try {
      const res = await axios.get(
        buildApiUrl(`/api/teacher/classrooms/${classroomId}/level-overrides`),
        { headers: getAuthHeaders() },
      );
      const map = {};
      for (const row of res.data) map[row.levelKey] = row;
      setOverridesMap(map);
      return map;
    } catch {
      return {};
    }
  }, [classroomId]);

  useEffect(() => {
    setLoading(true);
    fetchOverrides().then((map) => {
      const cfg = getLevelConfig(selectedLevel);
      setForm(toFormData(cfg, map[cfg?.progressKey ?? ""]));
      setLoading(false);
    });
  }, [classroomId, fetchOverrides]);

  const pick = (num) => {
    setSelectedLevel(num);
    setStatus(null);
    const cfg = getLevelConfig(num);
    setForm(toFormData(cfg, overridesMap[cfg?.progressKey ?? ""]));
  };

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const setInstr = (i, v) =>
    setForm((p) => { const arr = [...p.instructionItems]; arr[i] = v; return { ...p, instructionItems: arr }; });

  const handleSave = async () => {
    setSaving(true); setStatus(null);
    try {
      const cfg = getLevelConfig(selectedLevel);
      const lk = cfg?.progressKey ?? "";
      await axios.put(
        buildApiUrl(`/api/teacher/classrooms/${classroomId}/level-overrides/${lk}`),
        {
          lessonCardTitle:       form.lessonCardTitle.trim()       || null,
          lessonCardDescription: form.lessonCardDescription.trim() || null,
          goalTitle:             form.goalTitle.trim()             || null,
          goalDescription:       form.goalDescription.trim()       || null,
          instructionItems:      form.instructionItems.filter((x) => x.trim()),
          defaultCode:           form.defaultCode.trim()           || null,
          validatorConfig:       buildValidatorConfig(form),
        },
        { headers: getAuthHeaders() },
      );
      const map = await fetchOverrides();
      setForm(toFormData(cfg, map[lk]));
      setStatus({ ok: true, text: "Saved successfully" });
    } catch (err) {
      setStatus({ ok: false, text: err.response?.data?.message ?? "Save failed" });
    } finally { setSaving(false); }
  };

  const handleReset = async () => {
    if (!window.confirm("Reset this level to default? All customizations will be removed.")) return;
    setSaving(true); setStatus(null);
    try {
      const cfg = getLevelConfig(selectedLevel);
      const lk = cfg?.progressKey ?? "";
      await axios.delete(
        buildApiUrl(`/api/teacher/classrooms/${classroomId}/level-overrides/${lk}`),
        { headers: getAuthHeaders() },
      );
      const map = await fetchOverrides();
      setForm(toFormData(cfg, map[lk]));
      setStatus({ ok: true, text: "Reset to default" });
    } catch (err) {
      setStatus({ ok: false, text: err.response?.data?.message ?? "Reset failed" });
    } finally { setSaving(false); }
  };

  const cfg = getLevelConfig(selectedLevel);
  const lk  = cfg?.progressKey ?? "";
  const hasOverride = Boolean(overridesMap[lk]);

  return (
    <div className={styles.root}>
      <Sidebar />
      <div className={styles.main}>
        {/* header */}
        <div className={styles.pageHeader}>
          <button type="button" className={s.backBtn} onClick={() => navigate("/teacher/classes")}>
            ← Back to Classes
          </button>
          <div className={styles.pageTitle} style={{ marginLeft: 4 }}>
            Level Editor — Classroom #{classroomId}
          </div>
        </div>

        {loading ? (
          <div className={s.loading}>
            <div className={s.spinner} />
            Loading level data…
          </div>
        ) : (
          <div className={s.editorLayout}>
            {/* sidebar */}
            <nav className={s.sidebar}>
              <div className={s.sidebarLabel}>Levels</div>
              {AVAILABLE_LEVELS.map((num) => {
                const c = getLevelConfig(num);
                const overridden = Boolean(overridesMap[c?.progressKey ?? ""]);
                return (
                  <button
                    key={num}
                    type="button"
                    className={`${s.sidebarItem} ${num === selectedLevel ? s.sidebarItemActive : ""}`}
                    onClick={() => pick(num)}
                  >
                    <div className={s.sidebarNum}>{num}</div>
                    <div className={s.sidebarInfo}>
                      <span className={s.sidebarName}>Level {num}</span>
                      {overridden && <span className={s.sidebarTag}>● Customized</span>}
                    </div>
                  </button>
                );
              })}
            </nav>

            {/* main form */}
            <div className={s.formPanel}>
              {/* banner */}
              <div className={s.banner}>
                <div>
                  <div className={s.bannerTitle}>{cfg?.title ?? `Level ${selectedLevel}`}</div>
                  <div className={s.bannerSub}>{cfg?.subtitle ?? cfg?.progressKey ?? ""}</div>
                </div>
                {hasOverride
                  ? <span className={s.badgeCustom}>✦ Customized</span>
                  : <span className={s.badgeDefault}>Default</span>}
              </div>

              {/* Lesson Card */}
              <SCard icon="📖" iconCls={s.iBlue} title="Lesson Card">
                <F label="Title">
                  <input
                    className={s.input}
                    value={form.lessonCardTitle ?? ""}
                    onChange={(e) => set("lessonCardTitle", e.target.value)}
                    placeholder={cfg?.lessonCard?.title ?? "Lesson title"}
                  />
                </F>
                <F label="Description">
                  <textarea
                    className={s.textarea}
                    value={form.lessonCardDescription ?? ""}
                    onChange={(e) => set("lessonCardDescription", e.target.value)}
                    placeholder={cfg?.lessonCard?.description ?? "Lesson description"}
                  />
                </F>
              </SCard>

              {/* Goal */}
              <SCard icon="🎯" iconCls={s.iGreen} title="Goal">
                <F label="Title">
                  <input
                    className={s.input}
                    value={form.goalTitle ?? ""}
                    onChange={(e) => set("goalTitle", e.target.value)}
                    placeholder={cfg?.goal?.title ?? "Goal"}
                  />
                </F>
                <F label="Description">
                  <textarea
                    className={s.textarea}
                    value={form.goalDescription ?? ""}
                    onChange={(e) => set("goalDescription", e.target.value)}
                    placeholder={cfg?.goal?.description ?? "Goal description"}
                  />
                </F>
              </SCard>

              {/* Instructions */}
              <SCard icon="📋" iconCls={s.iPurple} title="Instructions">
                <div className={s.instrList}>
                  {(form.instructionItems ?? []).map((item, i) => (
                    <div key={i} className={s.instrRow}>
                      <div className={s.instrBullet}>{i + 1}</div>
                      <input
                        className={s.input}
                        style={{ flex: 1 }}
                        value={item}
                        onChange={(e) => setInstr(i, e.target.value)}
                        placeholder={`Instruction ${i + 1}`}
                      />
                      <button
                        type="button"
                        className={s.removeBtn}
                        onClick={() => setForm((p) => ({ ...p, instructionItems: p.instructionItems.filter((_, idx) => idx !== i) }))}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className={s.addBtn}
                  onClick={() => setForm((p) => ({ ...p, instructionItems: [...p.instructionItems, ""] }))}
                >
                  + Add instruction
                </button>
              </SCard>

              {/* Starter Code */}
              <SCard icon="💻" iconCls={s.iSlate} title="Starter Code">
                <span className={s.label}>C# code shown to students when they open this level</span>
                <div className={s.monacoWrap} style={{ height: editorHeight }}>
                  <Editor
                    height={editorHeight}
                    language="csharp"
                    theme="vs-dark"
                    value={form.defaultCode ?? ""}
                    onChange={(val) => set("defaultCode", val ?? "")}
                    onMount={(editor) => {
                      editorRef.current = editor;
                      const updateHeight = () => {
                        const contentHeight = Math.max(120, editor.getContentHeight());
                        setEditorHeight(contentHeight);
                        editor.layout();
                      };
                      updateHeight();
                      editor.onDidContentSizeChange(updateHeight);
                    }}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 13,
                      fontFamily: "'Fira Code', 'Consolas', 'Courier New', monospace",
                      fontLigatures: true,
                      lineNumbers: "on",
                      scrollBeyondLastLine: false,
                      tabSize: 2,
                      insertSpaces: true,
                      wordWrap: "on",
                      renderLineHighlight: "line",
                      bracketPairColorization: { enabled: true },
                      padding: { top: 12, bottom: 12 },
                      overviewRulerLanes: 0,
                      scrollbar: { vertical: "hidden", horizontal: "hidden" },
                    }}
                  />
                </div>
              </SCard>

              {/* Validator */}
              <SCard icon="⚙️" iconCls={s.iAmber} title="Validator Configuration">
                <div className={s.warning}>
                  <span className={s.warnIcon}>⚠️</span>
                  <span>
                    Changing the variable name updates what the validator checks.
                    Ensure your starter code uses the exact same variable name.
                  </span>
                </div>

                <F label="Validator type">
                  <div className={s.typePills}>
                    <button
                      type="button"
                      className={`${s.pill} ${form.validatorType === "singleInteger" ? s.pillActive : ""}`}
                      onClick={() => set("validatorType", "singleInteger")}
                    >
                      <div className={s.pillName}>Single Integer</div>
                      <div className={s.pillSub}>int steps = 7;</div>
                    </button>
                    <button
                      type="button"
                      className={`${s.pill} ${form.validatorType === "exactGoal" ? s.pillActive : ""}`}
                      onClick={() => set("validatorType", "exactGoal")}
                    >
                      <div className={s.pillName}>Exact Goal</div>
                      <div className={s.pillSub}>string myName = "Kai";</div>
                    </button>
                  </div>
                </F>

                <div className={s.divider} />

                <F label="Variable name">
                  <input
                    className={s.input}
                    value={form.variableName ?? ""}
                    onChange={(e) => set("variableName", e.target.value)}
                    placeholder={form.validatorType === "singleInteger" ? "steps" : "myName"}
                  />
                </F>

                {form.validatorType === "singleInteger" && (
                  <div className={s.fieldHalf}>
                    <div className={s.field}>
                      <span className={s.label}>Min value</span>
                      <input type="number" className={s.input} value={form.minValue ?? ""} onChange={(e) => set("minValue", e.target.value)} placeholder="1" />
                    </div>
                    <div className={s.field}>
                      <span className={s.label}>Max value</span>
                      <input type="number" className={s.input} value={form.maxValue ?? ""} onChange={(e) => set("maxValue", e.target.value)} placeholder="40" />
                    </div>
                  </div>
                )}

                {form.validatorType === "exactGoal" && (
                  <div className={s.fieldHalf}>
                    <div className={s.field}>
                      <span className={s.label}>Allowed type</span>
                      <select className={s.select} value={form.goalAllowedType ?? "string"} onChange={(e) => set("goalAllowedType", e.target.value)}>
                        <option value="int">int</option>
                        <option value="string">string</option>
                        <option value="double">double</option>
                        <option value="float">float</option>
                        <option value="bool">bool</option>
                        <option value="char">char</option>
                      </select>
                    </div>
                    <div className={s.field}>
                      <span className={s.label}>Required value</span>
                      <input className={s.input} value={form.goalRequiredValue ?? ""} onChange={(e) => set("goalRequiredValue", e.target.value)} placeholder={`"Kai"`} />
                    </div>
                  </div>
                )}

                <div className={s.divider} />

                <F label="Success message">
                  <input className={s.input} value={form.successMessage ?? ""} onChange={(e) => set("successMessage", e.target.value)} placeholder="Code accepted. Executing…" />
                </F>
                <F label="Error / failure message">
                  <input className={s.input} value={form.errorMessage ?? ""} onChange={(e) => set("errorMessage", e.target.value)} placeholder="You failed. Check your declaration." />
                </F>
                <F label="Unexpected variable message">
                  <input className={s.input} value={form.unexpectedVariableMessage ?? ""} onChange={(e) => set("unexpectedVariableMessage", e.target.value)} placeholder='Only "steps" is allowed in this level.' />
                </F>
              </SCard>

              {/* Action bar */}
              <div className={s.actionBar}>
                <button type="button" className={s.saveBtn} onClick={handleSave} disabled={saving}>
                  {saving ? "Saving…" : "💾 Save Changes"}
                </button>
                {hasOverride && (
                  <button type="button" className={s.resetBtn} onClick={handleReset} disabled={saving}>
                    ↺ Reset to Default
                  </button>
                )}
                <div className={s.spacer} />
                {status && (
                  <div className={status.ok ? s.statusOk : s.statusErr}>
                    {status.ok ? "✓" : "✕"} {status.text}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default TeacherLevelEditorPage;
