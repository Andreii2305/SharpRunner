import s from "./TeacherLevelEditorPage.module.css";

export default function LevelInterruptionDeductionFields({
  levelKey,
  scoreValue,
  xpValue,
  errors,
  disabled = false,
  onChange,
}) {
  const scoreId = `${levelKey}-interruption-score-deduction`;
  const xpId = `${levelKey}-interruption-xp-deduction`;
  const scoreError = errors?.interruptionScoreDeduction;
  const xpError = errors?.interruptionXpDeduction;

  return (
    <div className={s.interruptionSettings}>
      <p className={s.interruptionExplanation}>
        Counted interruptions include fullscreen exits and leaving the visible game page. They are activity signals, not proof of misconduct.
      </p>
      <div className={s.deductionFields}>
        <div className={s.settingField}>
          <label htmlFor={scoreId}>Score deduction per interruption</label>
          <input
            id={scoreId}
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={scoreValue}
            disabled={disabled}
            aria-describedby={`${scoreId}-description${scoreError ? ` ${scoreId}-error` : ""}`}
            aria-invalid={Boolean(scoreError)}
            onChange={(event) => onChange({ interruptionScoreDeduction: event.target.value })}
          />
          <small id={`${scoreId}-description`}>Zero disables this deduction. Score deductions stop at the existing minimum score of 75.</small>
          {scoreError ? <small id={`${scoreId}-error`} className={s.fieldError} role="alert">{scoreError}</small> : null}
        </div>
        <div className={s.settingField}>
          <label htmlFor={xpId}>XP deduction per interruption</label>
          <input
            id={xpId}
            type="number"
            min="0"
            max="100"
            step="1"
            value={xpValue}
            disabled={disabled}
            aria-describedby={`${xpId}-description${xpError ? ` ${xpId}-error` : ""}`}
            aria-invalid={Boolean(xpError)}
            onChange={(event) => onChange({ interruptionXpDeduction: event.target.value })}
          />
          <small id={`${xpId}-description`}>Zero disables this deduction. It affects only this level&apos;s completion reward, down to zero.</small>
          {xpError ? <small id={`${xpId}-error`} className={s.fieldError} role="alert">{xpError}</small> : null}
        </div>
      </div>
      <small className={s.sessionRateNote}>Changed rates apply to new game sessions. Existing sessions retain their saved rates.</small>
    </div>
  );
}
