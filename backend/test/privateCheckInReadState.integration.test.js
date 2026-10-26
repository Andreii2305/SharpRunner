const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { after, afterEach, before, beforeEach, describe, test } = require("node:test");

process.env.JWT_SECRET = "private-check-in-read-state-test-secret";

const User = require("../src/models/User");
const TeacherStudentCheckIn = require("../src/models/TeacherStudentCheckIn");
const UserNotificationView = require("../src/models/UserNotificationView");
const Classroom = require("../src/models/Classroom");
const ClassroomMembership = require("../src/models/ClassroomMembership");
const { TERMS_VERSION, PRIVACY_POLICY_VERSION } = require("../src/constants/policyVersions");

const originals = {
  findUser: User.findByPk,
  findCheckIn: TeacherStudentCheckIn.findOne,
  findOrCreateView: UserNotificationView.findOrCreate,
  findClassroom: Classroom.findByPk,
  findMembership: ClassroomMembership.findOne,
};

const actors = new Map([
  [51, "student"],
  [52, "student"],
  [41, "teacher"],
  [61, "admin"],
]);
const checkIns = [
  { id: 81, senderId: 41, recipientStudentId: 51, classroomId: 7, message: "Private content" },
  { id: 82, senderId: 41, recipientStudentId: 52, classroomId: 8, message: "Other private content" },
];
const views = new Map();
let checkInQueries;
let viewWrites;
let membershipReads;
let classroomReads;
let server;
let baseUrl;

const activeActor = (id, role) => ({
  id,
  role,
  status: "active",
  tokenVersion: 0,
  termsVersionAccepted: TERMS_VERSION,
  privacyVersionAcknowledged: PRIVACY_POLICY_VERSION,
});

const authToken = (id) => jwt.sign(
  { id, tokenVersion: 0 },
  process.env.JWT_SECRET,
  { expiresIn: "5m" },
);

const request = async (notificationId, actorId) => {
  const response = await fetch(`${baseUrl}/api/notifications/${notificationId}/viewed`, {
    method: "POST",
    headers: actorId ? { Authorization: `Bearer ${authToken(actorId)}` } : {},
  });
  return { response, payload: await response.json() };
};

describe("private check-in notification read state", () => {
before(async () => {
  const app = require("../src/app");
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
  views.clear();
  checkInQueries = [];
  viewWrites = 0;
  membershipReads = 0;
  classroomReads = 0;
  User.findByPk = async (id) => {
    const role = actors.get(Number(id));
    return role ? activeActor(Number(id), role) : null;
  };
  TeacherStudentCheckIn.findOne = async (options) => {
    checkInQueries.push(options);
    return checkIns.find((row) => (
      row.id === Number(options.where.id)
      && row.recipientStudentId === Number(options.where.recipientStudentId)
    )) || null;
  };
  UserNotificationView.findOrCreate = async ({ where, defaults }) => {
    viewWrites += 1;
    const mapKey = `${where.userId}:${where.notificationKey}`;
    let row = views.get(mapKey);
    if (row) return [row, false];
    row = {
      ...where,
      viewedAt: defaults.viewedAt,
      saveCalls: 0,
      async save() { this.saveCalls += 1; },
    };
    views.set(mapKey, row);
    return [row, true];
  };
  Classroom.findByPk = async () => { classroomReads += 1; return null; };
  ClassroomMembership.findOne = async () => { membershipReads += 1; return null; };
});

afterEach(() => {
  User.findByPk = originals.findUser;
  TeacherStudentCheckIn.findOne = originals.findCheckIn;
  UserNotificationView.findOrCreate = originals.findOrCreateView;
  Classroom.findByPk = originals.findClassroom;
  ClassroomMembership.findOne = originals.findMembership;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test("the exact check-in recipient is authorized before the canonical view key is written", async () => {
  const result = await request("check-in-81", 51);

  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload, {
    message: "Notification marked as viewed",
    notificationId: "check-in-81",
  });
  assert.equal(checkInQueries.length, 1);
  assert.deepEqual(checkInQueries[0], {
    where: { id: 81, recipientStudentId: 51 },
    attributes: ["id"],
  });
  assert.equal(viewWrites, 1);
  assert.equal(views.has("51:check-in-81"), true);
});

test("classmates, sender, admin, and missing records cannot create read state", async () => {
  for (const [actorId, expectedStatus] of [[52, 404], [41, 403], [61, 403]]) {
    const result = await request("check-in-81", actorId);
    assert.equal(result.response.status, expectedStatus);
    if (expectedStatus === 404) {
      assert.deepEqual(result.payload, { message: "Notification not found" });
    }
  }
  const missing = await request("check-in-999", 51);
  assert.equal(missing.response.status, 404);
  assert.deepEqual(missing.payload, { message: "Notification not found" });
  assert.equal(viewWrites, 0);
  assert.equal(views.size, 0);
});

test("a check-in from another classroom cannot be substituted for the recipient's record", async () => {
  const result = await request("check-in-82", 51);
  assert.equal(result.response.status, 404);
  assert.deepEqual(result.payload, { message: "Notification not found" });
  assert.deepEqual(checkInQueries[0].where, { id: 82, recipientStudentId: 51 });
  assert.equal(viewWrites, 0);
});

test("removed membership and archived classroom state are not consulted for delivered check-ins", async () => {
  const result = await request("check-in-81", 51);
  assert.equal(result.response.status, 200);
  assert.equal(membershipReads, 0);
  assert.equal(classroomReads, 0);
});

test("malformed and unsafe check-in IDs are rejected without a lookup or view write", async () => {
  for (const notificationId of [
    "check-in-0",
    "check-in--1",
    "check-in-1.5",
    "check-in-01",
    "check-in-9007199254740992",
    "check-in-81-extra",
    "check-in",
    "check-injected-81",
    "check-in-%E0%A4%A",
  ]) {
    const result = await request(notificationId, 51);
    assert.equal(result.response.status, 400, notificationId);
    assert.deepEqual(result.payload, { message: "Invalid notification id" });
  }
  assert.equal(checkInQueries.length, 0);
  assert.equal(viewWrites, 0);
});

test("repeated recipient requests keep one view row and preserve timestamp refresh behavior", async () => {
  assert.equal((await request("check-in-81", 51)).response.status, 200);
  const existing = views.get("51:check-in-81");
  const initialViewedAt = existing.viewedAt;
  await new Promise((resolve) => setTimeout(resolve, 2));
  assert.equal((await request("check-in-81", 51)).response.status, 200);

  assert.equal(views.size, 1);
  assert.equal(existing.saveCalls, 1);
  assert.ok(existing.viewedAt >= initialViewedAt);
});

test("existing notification keys retain their read-state behavior without check-in lookups", async () => {
  const result = await request("current-level-arrays-level-1", 51);
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload, {
    message: "Notification marked as viewed",
    notificationId: "current-level-arrays-level-1",
  });
  assert.equal(checkInQueries.length, 0);
  assert.equal(views.has("51:current-level-arrays-level-1"), true);
});

test("check-in lookup failures return and log no message content or private metadata", async () => {
  const privateText = checkIns[0].message;
  TeacherStudentCheckIn.findOne = async () => {
    throw new Error(`database failure: ${privateText}`);
  };
  const originalConsoleError = console.error;
  const logs = [];
  console.error = (...values) => { logs.push(values.join(" ")); };
  try {
    const result = await request("check-in-81", 51);
    assert.equal(result.response.status, 500);
    assert.deepEqual(result.payload, { message: "Server error" });
  } finally {
    console.error = originalConsoleError;
  }
  assert.doesNotMatch(logs.join("\n"), new RegExp(privateText));
  assert.equal(viewWrites, 0);
});
});
