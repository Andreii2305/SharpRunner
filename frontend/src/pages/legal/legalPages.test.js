import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const srcDirectory = path.resolve(directory, "../..");

test("Terms and Privacy documents are public application routes", () => {
  const app = fs.readFileSync(path.join(srcDirectory, "App.jsx"), "utf8");
  assert.match(app, /path="\/privacy-policy"/);
  assert.match(app, /path="\/terms"/);
  assert.doesNotMatch(app, /path="\/privacy-policy"[\s\S]{0,120}<ProtectedRoute/);
  assert.doesNotMatch(app, /path="\/terms"[\s\S]{0,120}<ProtectedRoute/);
});

test("landing footer links both documents and policy layouts include mobile rules", () => {
  const footer = fs.readFileSync(path.join(srcDirectory, "Components/Footer/Footer.jsx"), "utf8");
  const legalCss = fs.readFileSync(path.join(directory, "LegalPages.module.css"), "utf8");
  const modalCss = fs.readFileSync(path.join(srcDirectory, "Components/PolicyAcceptanceModal/PolicyAcceptanceModal.module.css"), "utf8");
  assert.match(footer, /to="\/privacy-policy"/);
  assert.match(footer, /to="\/terms"/);
  assert.match(legalCss, /@media \(max-width: 600px\)/);
  assert.match(modalCss, /max-height: calc\(100dvh/);
  assert.match(modalCss, /orientation: landscape/);
});
