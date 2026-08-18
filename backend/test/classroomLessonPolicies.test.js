const test = require("node:test");
const assert = require("node:assert/strict");
const { isStudentAssigned, submissionPolicyError } = require("../src/services/classroomLessonPolicyService");
const { extensionAllowed, isDangerousFilename } = require("../src/services/fileSecurityService");

test("class-wide and targeted content enforce audience membership", () => {
  assert.equal(isStudentAssigned({ assignedStudentIds: [] }, 7), true);
  assert.equal(isStudentAssigned({ assignedStudentIds: [7, 9] }, 7), true);
  assert.equal(isStudentAssigned({ assignedStudentIds: [7, 9] }, 8), false);
});

test("submission policies enforce due dates and attempt limits", () => {
  const now = new Date("2026-08-18T12:00:00Z");
  assert.match(submissionPolicyError({ dueAt: "2026-08-17T12:00:00Z", allowLateSubmissions: false }, null, now), /late submissions/);
  assert.match(submissionPolicyError({ maxAttempts: 2, allowLateSubmissions: true }, { attemptCount: 2 }, now), /all submission attempts/);
  assert.equal(submissionPolicyError({ maxAttempts: 3, allowLateSubmissions: true }, { attemptCount: 2 }, now), null);
});

test("upload security blocks dangerous files and validates teacher allowlists", () => {
  assert.equal(isDangerousFilename("worksheet.pdf.exe"), true);
  assert.equal(isDangerousFilename("worksheet.pdf"), false);
  assert.equal(extensionAllowed("answer.PDF", ["pdf", ".docx"]), true);
  assert.equal(extensionAllowed("answer.zip", ["pdf", "docx"]), false);
});
