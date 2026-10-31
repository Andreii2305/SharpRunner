import assert from "node:assert/strict";
import { after, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
const module = await vite.ssrLoadModule("/src/pages/teacher/TeacherGameInterruptionReport.jsx");
after(async () => vite.close());

const render = (node) => renderToStaticMarkup(node);
const baseState = {
  status: "success",
  loading: false,
  sessionPage: 1,
  eventPage: 1,
  error: "",
  report: {
    scope: { classroom: { id: 25 }, student: { id: 11 }, level: { levelKey: "arrays-level-1" } },
    summary: { recordedEventCount: 2, appliedEventCount: 1, unappliedEventCount: 1, actualScoreDeduction: 0, actualXpDeduction: 0 },
    completionEvidence: { availability: "unavailable" },
    sessions: { items: [{ id: 7, lifecycleStatus: "COMPLETED", startedAt: "2026-10-31T00:00:00.000Z", completedAt: "2026-10-31T02:00:00.000Z", supersededAt: null, scoreDeductionSnapshot: 0.25, xpDeductionSnapshot: 10, recordedEventCount: 2, appliedEventCount: 1, unappliedEventCount: 1, actualScoreDeduction: 0, actualXpDeduction: 0 }], page: 1, limit: 20, total: 1, totalPages: 1 },
    events: { items: [{ id: 2, sessionId: 7, type: "fullscreen_exit", receivedAt: "2026-10-31T01:00:00.000Z", applicationStatus: "applied", appliedAt: "2026-10-31T02:00:00.000Z", actualScoreDeduction: 0, actualXpDeduction: 0 }, { id: 1, sessionId: 7, type: "hidden", receivedAt: "2026-10-31T00:00:00.000Z", applicationStatus: "unapplied", appliedAt: null, actualScoreDeduction: null, actualXpDeduction: null }], page: 1, limit: 20, total: 2, totalPages: 1 },
  },
};

test("production report view renders neutral evidence and distinguishes applied zero from unapplied", () => {
  const html = render(React.createElement(module.TeacherGameInterruptionReportView, { state: baseState, onRetry() {}, onSessionPageChange() {}, onEventPageChange() {} }));
  for (const text of ["Recorded interruptions", "Recorded browser interruptions include fullscreen exits", "Exited fullscreen", "Game page hidden", "Actual score deduction", "Actual XP deduction", "Completion evidence unavailable"]) assert.match(html, new RegExp(text));
  assert.match(html, /Applied[\s\S]*0 score points[\s\S]*0 XP/);
  assert.match(html, /Unapplied[\s\S]*Not applied/);
  assert.match(html, /They are not proof of cheating/);
  assert.match(html, /aria-label="Session history pages"/);
  assert.match(html, /aria-label="Event history pages"/);
});

test("loading and failed snapshots keep disabled pagers without presenting zero", () => {
  for (const state of [
    { ...baseState, status: "loading", loading: true, report: null },
    { ...baseState, status: "error", error: "Unable to load recorded interruptions.", report: null },
    { ...baseState, status: "integrity-error", error: "Recorded interruption data could not be verified.", report: null },
    { ...baseState, status: "inaccessible", error: "Select one classroom to view recorded interruptions.", report: null },
  ]) {
    const html = render(React.createElement(module.TeacherGameInterruptionReportView, { state, onRetry() {}, onSessionPageChange() {}, onEventPageChange() {} }));
    assert.match(html, /aria-label="Session history pages"[\s\S]*disabled/);
    assert.match(html, /aria-label="Event history pages"[\s\S]*disabled/);
    assert.doesNotMatch(html, /No recorded interruptions/);
  }
});

test("zero recorded events and unavailable evidence remain separate statements", () => {
  const state = {
    ...baseState,
    report: {
      ...baseState.report,
      summary: { recordedEventCount: 0, appliedEventCount: 0, unappliedEventCount: 0, actualScoreDeduction: 0, actualXpDeduction: 0 },
      sessions: { items: [], page: 1, limit: 20, total: 0, totalPages: 0 },
      events: { items: [], page: 1, limit: 20, total: 0, totalPages: 0 },
    },
  };
  const html = render(React.createElement(module.TeacherGameInterruptionReportView, { state, onRetry() {}, onSessionPageChange() {}, onEventPageChange() {} }));
  assert.match(html, /No recorded interruptions/);
  assert.match(html, /Completion evidence unavailable/);
});

test("level disclosure is accessible and requires one exact classroom", () => {
  const disabled = render(React.createElement(module.RecordedInterruptionsButton, { levelKey: "arrays-level-1", expanded: false, exactClassroom: false, onClick() {} }));
  assert.match(disabled, /disabled/);
  assert.match(disabled, /Select one classroom/);
  const enabled = render(React.createElement(module.RecordedInterruptionsButton, { levelKey: "arrays-level-1", expanded: true, exactClassroom: true, onClick() {} }));
  assert.match(enabled, /aria-expanded="true"/);
  assert.match(enabled, /aria-controls="recorded-interruptions-arrays-level-1"/);
});
