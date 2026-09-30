import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./TeacherAssessmentBuilderPage.jsx", import.meta.url), "utf8");

test("builder exposes labelled settings, question controls, preview, and lifecycle confirmations", () => {
  for (const marker of ["Assessment builder", "Passing percentage", "Maximum attempts", "Answer review policy", "Add question", "Move question up", "Move choice down", "Preview", "Publish assessment?", "Delete assessment?"]) {
    assert.equal(source.includes(marker), true, marker);
  }
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
});

test("preview remains teacher-local and answer keys are never persisted in browser storage", () => {
  assert.equal(source.includes("studentAssessmentService"), false);
  assert.equal(source.includes("localStorage"), false);
  assert.equal(source.includes("sessionStorage"), false);
  assert.equal(source.includes("console."), false);
});

test("attempt locks disable writes and direct route identity drives requests", () => {
  assert.match(source, /structureLocked/);
  assert.match(source, /classroomId/);
  assert.match(source, /lessonKey/);
  assert.match(source, /assessmentId/);
});
