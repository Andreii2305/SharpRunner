import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./TeacherAssessmentBuilderPage.jsx", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("./TeacherAssessmentBuilderPage.module.css", import.meta.url), "utf8");

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

test("desktop builder keeps scope and assessment selectors compact above the editor", () => {
  assert.match(styles, /\.main\s*\{[^}]*padding:\s*18px\s+clamp\(18px,\s*3vw,\s*44px\)\s+48px/s);
  assert.match(styles, /\.pageHeader\s*\{[^}]*margin-bottom:\s*14px/s);
  assert.match(styles, /\.selectorCard\s*\{[^}]*padding:\s*16px\s+18px/s);
  assert.match(styles, /\.slotGrid\s+article\s*\{[^}]*display:\s*grid[^}]*grid-template-areas:\s*"heading action"\s*"summary action"/s);
  assert.match(styles, /@media\s*\(max-width:\s*900px\)[\s\S]*\.slotGrid\s+article\s*\{[^}]*grid-template-areas:\s*"heading"\s*"summary"\s*"action"/);
});

test("page shell keeps the builder beside the full-height sidebar instead of below it", () => {
  assert.match(styles, /\.root\s*\{[^}]*display:\s*flex[^}]*align-items:\s*flex-start/s);
  assert.match(styles, /\.main\s*\{[^}]*flex:\s*1[^}]*margin-left:\s*0/s);
  assert.doesNotMatch(styles, /@media\s*\(max-width:\s*900px\)\s*\{[^}]*\.main\s*\{[^}]*margin-left/s);
});
