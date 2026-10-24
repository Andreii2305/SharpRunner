const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET ||= "attachment-replacement-test-secret-with-sufficient-length";

const app = require("../src/app");
const sequelize = require("../src/config/database");
const User = require("../src/models/User");
const Classroom = require("../src/models/Classroom");
const ClassroomLesson = require("../src/models/ClassroomLesson");
const ClassroomLessonAttachment = require("../src/models/ClassroomLessonAttachment");
const lessonStorage = require("../src/services/lessonFileStorageService");
const customLessonLifecycle = require("../src/services/customLessonLifecycleService");
const {
  TERMS_VERSION,
  PRIVACY_POLICY_VERSION,
} = require("../src/constants/policyVersions");

let server;
let baseUrl;

before(async () => {
  server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve, reject) => {
  if (!server) return resolve();
  server.close((error) => (error ? reject(error) : resolve()));
}));

const withStubs = async (stubs, callback) => {
  const originals = stubs.map(([target, property]) => [target, property, target[property]]);
  for (const [target, property, replacement] of stubs) target[property] = replacement;
  try {
    return await callback();
  } finally {
    for (const [target, property, original] of originals) target[property] = original;
  }
};

const teacherUser = (id = 71) => ({
  id,
  role: "teacher",
  status: "active",
  tokenVersion: 0,
  termsVersionAccepted: TERMS_VERSION,
  privacyVersionAcknowledged: PRIVACY_POLICY_VERSION,
});

const authToken = (id = 71) => jwt.sign(
  { id, role: "teacher", tokenVersion: 0 },
  process.env.JWT_SECRET,
  { expiresIn: "5m" },
);

const replacementRequest = async ({
  token = authToken(),
  filename = "replacement.txt",
  mimeType = "text/plain",
  contents = "replacement bytes",
} = {}) => {
  const body = new FormData();
  body.append("files", new Blob([contents], { type: mimeType }), filename);
  const response = await fetch(`${baseUrl}/api/teacher/classrooms/31/lessons/41/attachments/51/file`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  const text = await response.text();
  return { response, payload: text ? JSON.parse(text) : null };
};

const attachmentFixture = (overrides = {}) => ({
  id: 51,
  classroomId: 31,
  lessonId: 41,
  originalName: "original.txt",
  storedName: "original-stored.txt",
  mimeType: "text/plain",
  sizeBytes: 14,
  data: Buffer.from("original bytes"),
  storageProvider: "supabase",
  storageKey: "old/object.txt",
  sha256: "old-hash",
  scanStatus: "clean",
  displayOrder: 0,
  save: async () => undefined,
  ...overrides,
});

const successfulRouteStubs = ({ attachment, stored, deleted = [] }) => {
  const lesson = {
    id: 41,
    version: 1,
    contentVersion: 1,
    save: async () => undefined,
  };
  const transaction = { LOCK: { UPDATE: "UPDATE" } };
  return [
    [User, "findByPk", async () => teacherUser()],
    [Classroom, "findByPk", async () => ({ id: 31, teacherId: 71 })],
    [ClassroomLesson, "findByPk", async () => lesson],
    [ClassroomLessonAttachment, "findOne", async () => attachment],
    [customLessonLifecycle, "lockContentRevisionForEdit", async () => lesson],
    [sequelize, "transaction", async (callback) => callback(transaction)],
    [lessonStorage, "uploadFile", async () => stored],
    [lessonStorage, "deleteFile", async (record) => { deleted.push({ ...record }); }],
  ];
};

test("teacher attachment replacement updates clean metadata to the new signature_checked status and hash", async () => {
  const attachment = attachmentFixture();
  const stored = {
    data: Buffer.from("replacement bytes"),
    storageProvider: "database",
    storageKey: null,
    sha256: "new-signature-hash",
    scanStatus: "signature_checked",
  };

  await withStubs(successfulRouteStubs({ attachment, stored }), async () => {
    const { response, payload } = await replacementRequest();

    assert.equal(response.status, 200);
    assert.equal(payload.message, "Attachment replaced");
    assert.equal(payload.attachment.scanStatus, "signature_checked");
    assert.equal(attachment.sha256, "new-signature-hash");
    assert.equal(attachment.scanStatus, "signature_checked");
  });
});

test("teacher attachment replacement updates not_configured metadata to the new clean status and hash", async () => {
  const attachment = attachmentFixture({ scanStatus: "not_configured", sha256: null });
  const stored = {
    data: null,
    storageProvider: "supabase",
    storageKey: "new/object.txt",
    sha256: "new-clean-hash",
    scanStatus: "clean",
  };

  await withStubs(successfulRouteStubs({ attachment, stored }), async () => {
    const { response, payload } = await replacementRequest();

    assert.equal(response.status, 200);
    assert.equal(payload.attachment.scanStatus, "clean");
    assert.equal(attachment.sha256, "new-clean-hash");
    assert.equal(attachment.scanStatus, "clean");
  });
});

test("rejected teacher attachment replacement leaves the original record unchanged", async () => {
  let classroomReads = 0;
  let storageUploads = 0;
  let attachmentReads = 0;

  await withStubs([
    [User, "findByPk", async () => teacherUser()],
    [Classroom, "findByPk", async () => { classroomReads += 1; return { id: 31, teacherId: 71 }; }],
    [ClassroomLessonAttachment, "findOne", async () => { attachmentReads += 1; return attachmentFixture(); }],
    [lessonStorage, "uploadFile", async () => { storageUploads += 1; throw new Error("must not upload"); }],
  ], async () => {
    const { response } = await replacementRequest({ filename: "blocked.exe", mimeType: "application/octet-stream" });

    assert.equal(response.status, 400);
    assert.equal(classroomReads, 0);
    assert.equal(attachmentReads, 0);
    assert.equal(storageUploads, 0);
  });
});

test("teacher attachment replacement storage failure leaves the original record unchanged", async () => {
  const attachment = attachmentFixture();
  const original = { ...attachment };
  let saveCalls = 0;

  await withStubs([
    [User, "findByPk", async () => teacherUser()],
    [Classroom, "findByPk", async () => ({ id: 31, teacherId: 71 })],
    [ClassroomLessonAttachment, "findOne", async () => attachment],
    [lessonStorage, "uploadFile", async () => { throw new Error("storage unavailable"); }],
    [console, "error", () => undefined],
  ], async () => {
    attachment.save = async () => { saveCalls += 1; };
    const { response } = await replacementRequest();

    assert.equal(response.status, 500);
    assert.equal(saveCalls, 0);
    assert.equal(attachment.storedName, original.storedName);
    assert.equal(attachment.storageKey, original.storageKey);
    assert.equal(attachment.sha256, original.sha256);
    assert.equal(attachment.scanStatus, original.scanStatus);
  });
});

test("teacher attachment replacement database failure keeps persisted metadata and cleans the new stored object", async () => {
  const persisted = {
    storedName: "original-stored.txt",
    storageProvider: "supabase",
    storageKey: "old/object.txt",
    sha256: "old-hash",
    scanStatus: "clean",
  };
  const attachment = attachmentFixture({
    save: async () => { throw new Error("database unavailable"); },
  });
  const stored = {
    data: null,
    storageProvider: "supabase",
    storageKey: "new/object.txt",
    sha256: "new-hash",
    scanStatus: "signature_checked",
  };
  const deleted = [];

  await withStubs([
    ...successfulRouteStubs({ attachment, stored, deleted }),
    [console, "error", () => undefined],
  ], async () => {
    const { response } = await replacementRequest();

    assert.equal(response.status, 500);
    assert.deepEqual(persisted, {
      storedName: "original-stored.txt",
      storageProvider: "supabase",
      storageKey: "old/object.txt",
      sha256: "old-hash",
      scanStatus: "clean",
    });
    assert.deepEqual(deleted.map((record) => record.storageKey), ["new/object.txt"]);
  });
});

test("old-file cleanup failure after commit logs the failure and still reports the persisted replacement", async () => {
  const attachment = attachmentFixture();
  const stored = {
    data: null,
    storageProvider: "supabase",
    storageKey: "new/object.txt",
    sha256: "new-hash",
    scanStatus: "clean",
  };
  const deleteAttempts = [];
  const loggedErrors = [];
  const stubs = successfulRouteStubs({ attachment, stored });
  const deleteStubIndex = stubs.findIndex(([target, property]) => target === lessonStorage && property === "deleteFile");
  stubs[deleteStubIndex] = [lessonStorage, "deleteFile", async (record) => {
    deleteAttempts.push(record.storageKey);
    throw new Error("old storage cleanup failed");
  }];

  await withStubs([
    ...stubs,
    [console, "error", (...args) => { loggedErrors.push(args); }],
  ], async () => {
    const { response, payload } = await replacementRequest();

    assert.equal(response.status, 200);
    assert.equal(payload.message, "Attachment replaced");
    assert.equal(payload.attachment.scanStatus, "clean");
    assert.equal(attachment.storageKey, "new/object.txt");
    assert.equal(attachment.sha256, "new-hash");
    assert.equal(attachment.scanStatus, "clean");
    assert.deepEqual(deleteAttempts, ["old/object.txt"]);
    assert.deepEqual(loggedErrors, [["Failed to clean up replaced attachment storage"]]);
  });
});

test("unauthorized teacher attachment replacement performs no storage upload or attachment mutation", async () => {
  let storageUploads = 0;
  let attachmentReads = 0;

  await withStubs([
    [User, "findByPk", async () => teacherUser()],
    [Classroom, "findByPk", async () => ({ id: 31, teacherId: 999 })],
    [ClassroomLessonAttachment, "findOne", async () => { attachmentReads += 1; return attachmentFixture(); }],
    [lessonStorage, "uploadFile", async () => { storageUploads += 1; throw new Error("must not upload"); }],
  ], async () => {
    const { response, payload } = await replacementRequest();

    assert.equal(response.status, 403);
    assert.equal(payload.message, "Access denied");
    assert.equal(storageUploads, 0);
    assert.equal(attachmentReads, 0);
  });
});
