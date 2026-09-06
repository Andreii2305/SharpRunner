import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import {
  FiArrowDown,
  FiArrowUp,
  FiCalendar,
  FiCheckCircle,
  FiClock,
  FiEye,
  FiHelpCircle,
  FiLock,
  FiRotateCcw,
  FiSave,
  FiSliders,
  FiTrash2,
  FiUsers,
} from "react-icons/fi";
import Sidebar from "../../Components/SideBar/Sidebar.jsx";
import ConfirmModal from "../../Components/ConfirmModal/ConfirmModal.jsx";
import { buildApiUrl, getAuthHeaders } from "../../utils/auth.js";
import {
  getAvailableLevelNumbers,
  getLevelConfig,
} from "../game/levels/levelConfigs.js";
import { getCurriculumMetadata } from "../game/levels/curriculumMetadata.js";
import styles from "./TeacherPage.module.css";
import s from "./TeacherLevelEditorPage.module.css";

const AVAILABLE_LEVELS = getAvailableLevelNumbers();

const toDateTimeInput = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
};

const toPhilippineIso = (value) => value ? new Date(`${value}:00+08:00`).toISOString() : null;

const defaultDueInput = () => {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const date = toDateTimeInput(tomorrow).slice(0, 10);
  return `${date}T23:59`;
};

const buildDefaultSettings = () =>
  AVAILABLE_LEVELS.map((levelNumber, index) => {
    const config = getLevelConfig(levelNumber);
    return {
      levelNumber,
      levelKey: config.progressKey,
      isEnabled: true,
      displayOrder: index + 1,
      unlockAt: "",
      dueAt: "",
      hintsEnabled: true,
      hintUnlockThreshold: 3,
      wrongAttemptDeduction: 5,
      lateDeductionPerDay: 3,
    };
  });

const mergeSettings = (rows) => {
  const overrides = new Map((rows ?? []).map((row) => [row.levelKey, row]));
  return buildDefaultSettings()
    .map((setting) => {
      const row = overrides.get(setting.levelKey);
      return row
        ? {
            ...setting,
            isEnabled: row.isEnabled ?? true,
            displayOrder: Number.isInteger(row.displayOrder)
              ? row.displayOrder
              : setting.displayOrder,
            unlockAt: toDateTimeInput(row.unlockAt),
            dueAt: toDateTimeInput(row.dueAt),
            hintsEnabled: row.hintsEnabled ?? true,
            hintUnlockThreshold: Number(row.hintUnlockThreshold ?? 3),
            wrongAttemptDeduction: Number(row.wrongAttemptDeduction ?? 5),
            lateDeductionPerDay: Number(row.lateDeductionPerDay ?? 3),
          }
        : setting;
    })
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((setting, index) => ({ ...setting, displayOrder: index + 1 }));
};

function TeacherLevelEditorPage() {
  const { classroomId } = useParams();
  const navigate = useNavigate();
  const initialSettings = useMemo(buildDefaultSettings, []);
  const [settings, setSettings] = useState(initialSettings);
  const [selectedLevelKey, setSelectedLevelKey] = useState(
    initialSettings[0]?.levelKey ?? "",
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pastDeadlineConfirmOpen, setPastDeadlineConfirmOpen] = useState(false);
  const [extensionsOpen, setExtensionsOpen] = useState(false);
  const [extensionStudents, setExtensionStudents] = useState([]);
  const [extensionDrafts, setExtensionDrafts] = useState({});
  const [extensionsLoading, setExtensionsLoading] = useState(false);
  const [persistedDueByKey, setPersistedDueByKey] = useState({});

  const fetchSettings = useCallback(async () => {
    const response = await axios.get(
      buildApiUrl(`/api/teacher/classrooms/${classroomId}/level-overrides`),
      { headers: getAuthHeaders() },
    );
    const merged = mergeSettings(response.data);
    setSettings(merged);
    setPersistedDueByKey(Object.fromEntries(merged.map((row) => [row.levelKey, row.dueAt])));
    setSelectedLevelKey((current) =>
      merged.some((row) => row.levelKey === current)
        ? current
        : merged[0]?.levelKey ?? "",
    );
  }, [classroomId]);

  useEffect(() => {
    setLoading(true);
    fetchSettings()
      .catch(() => setStatus({ ok: false, text: "Unable to load classroom levels." }))
      .finally(() => setLoading(false));
  }, [fetchSettings]);

  const selectedIndex = settings.findIndex(
    (setting) => setting.levelKey === selectedLevelKey,
  );
  const selected = settings[selectedIndex] ?? settings[0];
  const config = getLevelConfig(selected?.levelNumber);
  const curriculum = getCurriculumMetadata(config);

  const updateSelected = (updates) => {
    setStatus(null);
    setSettings((current) =>
      current.map((setting) =>
        setting.levelKey === selectedLevelKey
          ? { ...setting, ...updates }
          : setting,
      ),
    );
  };

  useEffect(() => {
    setExtensionsOpen(false);
    setExtensionStudents([]);
    setExtensionDrafts({});
  }, [selectedLevelKey]);

  const fetchExtensions = useCallback(async () => {
    if (!selectedLevelKey) return;
    setExtensionsLoading(true);
    try {
      const response = await axios.get(
        buildApiUrl(`/api/teacher/classrooms/${classroomId}/levels/${selectedLevelKey}/extensions`),
        { headers: getAuthHeaders() },
      );
      const rows = response.data?.students ?? [];
      setExtensionStudents(rows);
      setExtensionDrafts(Object.fromEntries(rows.map((row) => [row.studentId, {
        extendedDueAt: toDateTimeInput(row.extensionDueAt),
        reason: row.extensionReason ?? "",
      }])));
    } catch (error) {
      setStatus({ ok: false, text: error.response?.data?.message ?? "Unable to load extensions." });
    } finally {
      setExtensionsLoading(false);
    }
  }, [classroomId, selectedLevelKey]);

  const toggleExtensions = async () => {
    const next = !extensionsOpen;
    setExtensionsOpen(next);
    if (next) await fetchExtensions();
  };

  const saveExtension = async (studentId) => {
    const draft = extensionDrafts[studentId];
    if (!draft?.extendedDueAt) {
      setStatus({ ok: false, text: "Choose an extended date and time." });
      return;
    }
    try {
      await axios.put(
        buildApiUrl(`/api/teacher/classrooms/${classroomId}/levels/${selectedLevelKey}/extensions/${studentId}`),
        { extendedDueAt: toPhilippineIso(draft.extendedDueAt), reason: draft.reason || null },
        { headers: getAuthHeaders() },
      );
      await fetchExtensions();
      setStatus({ ok: true, text: "Student extension saved." });
    } catch (error) {
      setStatus({ ok: false, text: error.response?.data?.message ?? "Unable to save extension." });
    }
  };

  const removeExtension = async (student) => {
    if (!window.confirm(`Remove the extension for ${student.studentName}? The class deadline will apply immediately.`)) return;
    try {
      await axios.delete(
        buildApiUrl(`/api/teacher/classrooms/${classroomId}/levels/${selectedLevelKey}/extensions/${student.studentId}`),
        { headers: getAuthHeaders() },
      );
      await fetchExtensions();
      setStatus({ ok: true, text: "Student extension removed." });
    } catch (error) {
      setStatus({ ok: false, text: error.response?.data?.message ?? "Unable to remove extension." });
    }
  };

  const moveSelected = (direction) => {
    const nextIndex = selectedIndex + direction;
    if (selectedIndex < 0 || nextIndex < 0 || nextIndex >= settings.length) return;
    setSettings((current) => {
      const next = [...current];
      [next[selectedIndex], next[nextIndex]] = [next[nextIndex], next[selectedIndex]];
      return next.map((setting, index) => ({ ...setting, displayOrder: index + 1 }));
    });
    setStatus(null);
  };

  const persistSettings = async () => {
    setSaving(true);
    setStatus(null);
    try {
      await axios.put(
        buildApiUrl(`/api/teacher/classrooms/${classroomId}/level-settings`),
        {
          settings: settings.map((setting) => ({
            levelKey: setting.levelKey,
            isEnabled: setting.isEnabled,
            unlockAt: toPhilippineIso(setting.unlockAt),
            dueAt: toPhilippineIso(setting.dueAt),
            hintsEnabled: setting.hintsEnabled,
            hintUnlockThreshold: Number(setting.hintUnlockThreshold),
            wrongAttemptDeduction: Number(setting.wrongAttemptDeduction),
            lateDeductionPerDay: Number(setting.lateDeductionPerDay),
          })),
        },
        { headers: getAuthHeaders() },
      );
      await fetchSettings();
      setStatus({ ok: true, text: "Classroom level settings saved." });
    } catch (error) {
      setStatus({
        ok: false,
        text: error.response?.data?.message ?? "Unable to save classroom settings.",
      });
    } finally {
      setSaving(false);
    }
  };

  const saveSettings = () => {
    const hasPastDeadline = settings.some((setting) => (
      setting.dueAt
      && setting.dueAt !== persistedDueByKey[setting.levelKey]
      && new Date(toPhilippineIso(setting.dueAt)).getTime() < Date.now()
    ));
    if (hasPastDeadline) {
      setPastDeadlineConfirmOpen(true);
      return;
    }
    void persistSettings();
  };

  const resetSettings = async () => {
    setConfirmOpen(false);
    setSaving(true);
    setStatus(null);
    try {
      await axios.delete(
        buildApiUrl(`/api/teacher/classrooms/${classroomId}/level-settings`),
        { headers: getAuthHeaders() },
      );
      await fetchSettings();
      setStatus({ ok: true, text: "Classroom levels reset to system defaults." });
    } catch (error) {
      setStatus({
        ok: false,
        text: error.response?.data?.message ?? "Unable to reset classroom settings.",
      });
    } finally {
      setSaving(false);
    }
  };

  const enabledCount = useMemo(
    () => settings.filter((setting) => setting.isEnabled).length,
    [settings],
  );

  return (
    <div className={styles.root}>
      <Sidebar />
      <div className={styles.main}>
        <div className={styles.pageHeader}>
          <button type="button" className={s.backBtn} onClick={() => navigate("/teacher/classes")}>← Back to Classes</button>
          <div className={styles.pageTitle}>Classroom Level Manager — Classroom #{classroomId}</div>
        </div>

        {loading ? (
          <div className={s.loading}><div className={s.spinner} />Loading classroom levels…</div>
        ) : (
          <div className={s.editorLayout}>
            <nav className={s.sidebar} aria-label="Classroom levels">
              <div className={s.sidebarLabel}>Levels · {enabledCount}/{settings.length} enabled</div>
              {settings.map((setting, index) => {
                const level = getLevelConfig(setting.levelNumber);
                return (
                  <button
                    key={setting.levelKey}
                    type="button"
                    className={`${s.sidebarItem} ${setting.levelKey === selectedLevelKey ? s.sidebarItemActive : ""}`}
                    onClick={() => { setSelectedLevelKey(setting.levelKey); setStatus(null); }}
                  >
                    <span className={s.sidebarNum}>{index + 1}</span>
                    <span className={s.sidebarInfo}>
                      <span className={s.sidebarName}>{level?.title ?? `Level ${setting.levelNumber}`}</span>
                      <span className={setting.isEnabled ? s.enabledTag : s.disabledTag}>{setting.isEnabled ? "Enabled" : "Disabled"}</span>
                    </span>
                  </button>
                );
              })}
            </nav>

            <main className={s.formPanel}>
              <div className={s.managerHeader}>
                <div>
                  <span className={s.eyebrow}>Assigned position {selectedIndex + 1}</span>
                  <h1>{config?.title ?? "Level preview"}</h1>
                  <p>{config?.subtitle ?? selected?.levelKey}</p>
                </div>
                <div className={s.headerActions}>
                  <button type="button" className={s.orderButton} onClick={() => moveSelected(-1)} disabled={selectedIndex <= 0}><FiArrowUp /> Move up</button>
                  <button type="button" className={s.orderButton} onClick={() => moveSelected(1)} disabled={selectedIndex >= settings.length - 1}><FiArrowDown /> Move down</button>
                </div>
              </div>

              <div className={s.managerGrid}>
                <section className={s.previewPanel}>
                  <div className={s.sectionHeading}>
                    <FiEye />
                    <div><h2>Student preview</h2><p>System curriculum is read-only and cannot be changed by teachers.</p></div>
                    <span className={s.readOnlyBadge}><FiLock /> Read only</span>
                  </div>
                  <article className={s.previewCard}><span className={s.previewLabel}>Lesson</span><h3>{config?.lessonCard?.title ?? "Lesson"}</h3><p>{config?.lessonCard?.description ?? "No lesson description."}</p></article>
                  <article className={s.previewCard}><span className={s.previewLabel}>Goal</span><h3>{config?.goal?.title ?? "Goal"}</h3><p>{config?.goal?.description ?? "Complete the coding objective."}</p></article>
                  <article className={s.previewCard}>
                    <span className={s.previewLabel}>Instructions</span>
                    <ol>{(config?.instruction?.items ?? []).map((item) => <li key={item}>{item}</li>)}</ol>
                  </article>
                  <article className={s.previewCard}><span className={s.previewLabel}>Starter code</span><pre><code>{config?.defaultCode ?? "// No starter code"}</code></pre></article>
                  <article className={s.previewCard}>
                    <span className={s.previewLabel}>Curriculum mapping</span>
                    <p><strong>{curriculum.curriculumSource}</strong> · {curriculum.moduleName} · {curriculum.lessonName}</p>
                    <p>{curriculum.learningObjective}</p>
                    <p>Conceptual difficulty: <strong>{curriculum.difficulty}</strong></p>
                    <small>{curriculum.referenceAccessNote}</small>
                  </article>
                  {selected?.hintsEnabled ? <article className={`${s.previewCard} ${s.hintPreview}`}><span className={s.previewLabel}>Level-specific guidance</span><p>A free basic hint unlocks after the configured failures. Students may then spend XP on a protected detailed hint for this exact challenge.</p></article> : null}
                </section>

                <aside className={s.settingsPanel}>
                  <div className={s.sectionHeading}><FiSliders /><div><h2>Challenge settings</h2><p>These conditions apply only to this classroom. Game code and validators remain system-managed.</p></div></div>
                  <label className={s.toggleRow}>
                    <span><strong><FiCheckCircle /> Level availability</strong><small>Students can access this level in the assigned sequence.</small></span>
                    <input type="checkbox" checked={selected?.isEnabled ?? true} onChange={(event) => updateSelected({ isEnabled: event.target.checked })} />
                  </label>
                  <label className={s.settingField}>
                    <span><FiClock /> Unlock date and time</span>
                    <input type="datetime-local" value={selected?.unlockAt ?? ""} onChange={(event) => updateSelected({ unlockAt: event.target.value })} />
                    <small>Leave empty to unlock according to the assigned order.</small>
                  </label>
                  <fieldset className={s.deadlineFieldset}>
                    <legend><FiCalendar /> Due date</legend>
                    <label><input type="radio" name={`due-${selectedLevelKey}`} checked={!selected?.dueAt} onChange={() => {
                      if (selected?.dueAt && !window.confirm("Remove this class deadline? Any individual extensions for this level will also be removed.")) return;
                      updateSelected({ dueAt: "" });
                      setExtensionsOpen(false);
                    }} /> No due date</label>
                    <label><input type="radio" name={`due-${selectedLevelKey}`} checked={Boolean(selected?.dueAt)} onChange={() => updateSelected({ dueAt: defaultDueInput() })} /> Set due date</label>
                    {selected?.dueAt ? (
                      <input type="datetime-local" value={selected.dueAt} onChange={(event) => updateSelected({ dueAt: event.target.value })} />
                    ) : null}
                    <small>Unfinished levels are locked after this date and time. Times shown in Philippine Time.</small>
                  </fieldset>
                  <div className={s.extensionManager}>
                    <div>
                      <strong><FiUsers /> Student extensions</strong>
                      <small>Grant a later deadline without changing the class deadline.</small>
                    </div>
                    <button type="button" onClick={toggleExtensions} disabled={!selected?.dueAt}>
                      {extensionsOpen ? "Hide extensions" : "Manage extensions"}
                    </button>
                    {!selected?.dueAt ? <small>Set a class due date to manage extensions.</small> : null}
                  </div>
                  {extensionsOpen ? (
                    <div className={s.extensionList}>
                      <strong>Class deadline: {selected?.dueAt?.replace("T", " ")} (Philippine Time)</strong>
                      {extensionsLoading ? <span>Loading students…</span> : extensionStudents.length ? extensionStudents.map((student) => {
                        const draft = extensionDrafts[student.studentId] ?? { extendedDueAt: "", reason: "" };
                        return (
                          <article key={student.studentId}>
                            <div><strong>{student.studentName}</strong><small>{student.status.replaceAll("_", " ")} · Effective {student.effectiveDueAt ? toDateTimeInput(student.effectiveDueAt).replace("T", " ") : "none"}</small></div>
                            <input
                              aria-label={`Extended deadline for ${student.studentName}`}
                              type="datetime-local"
                              value={draft.extendedDueAt}
                              onChange={(event) => setExtensionDrafts((current) => ({ ...current, [student.studentId]: { ...draft, extendedDueAt: event.target.value } }))}
                            />
                            <input
                              aria-label={`Extension reason for ${student.studentName}`}
                              placeholder="Reason (optional)"
                              value={draft.reason}
                              onChange={(event) => setExtensionDrafts((current) => ({ ...current, [student.studentId]: { ...draft, reason: event.target.value } }))}
                            />
                            <div className={s.extensionActions}>
                              <button type="button" onClick={() => saveExtension(student.studentId)}>{student.extensionDueAt ? "Update" : "Grant"}</button>
                              {student.extensionDueAt ? <button type="button" className={s.removeExtension} onClick={() => removeExtension(student)}><FiTrash2 /> Remove</button> : null}
                            </div>
                          </article>
                        );
                      }) : <span>No active students in this classroom.</span>}
                    </div>
                  ) : null}
                  <label className={s.toggleRow}>
                    <span><strong><FiHelpCircle /> Student hints</strong><small>Allow the free basic hint and optional XP-purchased detailed hint after the configured number of failures.</small></span>
                    <input type="checkbox" checked={selected?.hintsEnabled ?? true} onChange={(event) => updateSelected({ hintsEnabled: event.target.checked })} />
                  </label>
                  <label className={s.settingField}>
                    <span>Hint unlocks after failed attempts</span>
                    <input type="number" min="1" max="10" step="1" disabled={!selected?.hintsEnabled} value={selected?.hintUnlockThreshold ?? 3} onChange={(event) => updateSelected({ hintUnlockThreshold: event.target.value })} />
                    <small>Default: 3. The basic educational hint remains free.</small>
                  </label>
                  <div className={s.gradingBox}>
                    <h3>Grading policy</h3>
                    <p>Scores begin at 100 points. Hard deadlines prevent late submissions; extensions reopen access.</p>
                    <label className={s.settingField}>
                      <span>Points deducted per wrong attempt</span>
                      <input type="number" min="0" max="100" step="0.5" value={selected?.wrongAttemptDeduction ?? 5} onChange={(event) => updateSelected({ wrongAttemptDeduction: event.target.value })} />
                      <small>System default: −5 points.</small>
                    </label>
                  </div>
                </aside>
              </div>

              <div className={s.actionBar}>
                <button type="button" className={s.saveBtn} onClick={saveSettings} disabled={saving}><FiSave /> {saving ? "Saving…" : "Save classroom settings"}</button>
                <button type="button" className={s.resetBtn} onClick={() => setConfirmOpen(true)} disabled={saving}><FiRotateCcw /> Reset to default</button>
                <span className={s.spacer} />
                {status ? <span className={status.ok ? s.statusOk : s.statusErr}>{status.ok ? "✓" : "!"} {status.text}</span> : null}
              </div>
            </main>
          </div>
        )}
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="Reset all classroom level settings?"
        message="This restores the system order, enables every level, clears schedules and due dates, enables hints, and restores the default grading deductions."
        confirmLabel="Reset all settings"
        danger
        confirmDisabled={saving}
        onConfirm={resetSettings}
        onCancel={() => !saving && setConfirmOpen(false)}
      />
      <ConfirmModal
        open={pastDeadlineConfirmOpen}
        title="Set a deadline in the past?"
        message="This deadline has already passed. Unfinished students may immediately lose access."
        confirmLabel="Set Deadline"
        danger
        confirmDisabled={saving}
        onConfirm={() => {
          setPastDeadlineConfirmOpen(false);
          void persistSettings();
        }}
        onCancel={() => !saving && setPastDeadlineConfirmOpen(false)}
      />
    </div>
  );
}

export default TeacherLevelEditorPage;
