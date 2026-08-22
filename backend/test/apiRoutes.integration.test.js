const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

process.env.JWT_SECRET = "integration-test-secret-with-sufficient-length";
process.env.DEVELOPER_SETUP_KEY = "developer-integration-key";
process.env.ADMIN_SETUP_KEY = "admin-integration-key";

const app = require("../src/app");
const User = require("../src/models/User");
const UserProgress = require("../src/models/UserProgress");
const Classroom = require("../src/models/Classroom");
const ClassroomMembership = require("../src/models/ClassroomMembership");
const LevelContentOverride = require("../src/models/LevelContentOverride");
const LevelDeadline = require("../src/models/LevelDeadline");
const AdminActivityLog = require("../src/models/AdminActivityLog");
const AdminInvite = require("../src/models/AdminInvite");
const XpTransaction = require("../src/models/XpTransaction");
const sequelize = require("../src/config/database");

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

const authToken = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "5m" });

const apiRequest = async (path, { method = "GET", token, body } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  return { response, payload };
};

const withStubs = async (stubs, callback) => {
  const originals = stubs.map(([target, property]) => [target, property, target[property]]);
  for (const [target, property, replacement] of stubs) target[property] = replacement;
  try {
    return await callback();
  } finally {
    for (const [target, property, original] of originals) target[property] = original;
  }
};

const activeUser = (overrides = {}) => ({
  id: 1,
  firstName: "Test",
  lastName: "User",
  username: "test-user",
  email: "test@example.com",
  role: "student",
  status: "active",
  emailVerifiedAt: new Date(),
  password: null,
  xpTotal: 0,
  save: async () => undefined,
  ...overrides,
});

test("POST /api/auth/login authenticates a verified account and issues a JWT", async () => {
  const user = activeUser({
    id: 11,
    password: bcrypt.hashSync("correct-password", 4),
  });

  await withStubs([
    [User, "findOne", async () => user],
    [UserProgress, "findAll", async () => []],
    [UserProgress, "bulkCreate", async () => []],
  ], async () => {
    const { response, payload } = await apiRequest("/api/auth/login", {
      method: "POST",
      body: { identifier: user.email, password: "correct-password" },
    });

    assert.equal(response.status, 200);
    assert.equal(payload.user.id, 11);
    assert.equal(jwt.verify(payload.token, process.env.JWT_SECRET).id, 11);
  });
});

test("GET /api/auth/me rejects an inactive account even with a valid token", async () => {
  await withStubs([
    [User, "findByPk", async () => activeUser({ status: "inactive" })],
  ], async () => {
    const { response, payload } = await apiRequest("/api/auth/me", {
      token: authToken(1, "student"),
    });
    assert.equal(response.status, 403);
    assert.equal(payload.message, "Account is not active");
  });
});

test("POST /api/classrooms/join creates an active membership", async () => {
  const classroom = {
    id: 9,
    className: "C# Fundamentals",
    section: "BSIT 1A",
    schoolYear: "2026-2027",
    classCode: "ABC234",
    maxStudents: 30,
    description: null,
    teacherId: 4,
  };
  let createdMembership;

  await withStubs([
    [User, "findByPk", async () => activeUser()],
    [Classroom, "findOne", async () => classroom],
    [ClassroomMembership, "findOne", async () => null],
    [ClassroomMembership, "count", async () => 3],
    [ClassroomMembership, "create", async (values) => {
      createdMembership = { ...values, joinedAt: values.joinedAt };
      return createdMembership;
    }],
  ], async () => {
    const { response, payload } = await apiRequest("/api/classrooms/join", {
      method: "POST",
      token: authToken(1, "student"),
      body: { classCode: "abc234" },
    });
    assert.equal(response.status, 201);
    assert.equal(payload.classroom.id, 9);
    assert.equal(createdMembership.status, "active");
    assert.equal(createdMembership.studentId, 1);
  });
});

test("PUT /api/progress rejects forged completion with invalid source code", async () => {
  const progressRow = {
    id: 1,
    userId: 1,
    levelKey: "tutorial-level-1",
    lessonTitle: "Tutorial",
    orderIndex: 1,
    progressPercent: 0,
    isCompleted: false,
    completedAt: null,
    attemptCount: 0,
    timeSpentSeconds: 0,
    finalScore: null,
    startedAt: new Date(),
    save: async () => assert.fail("invalid completion must not be saved"),
  };
  const membership = { id: 1, classroomId: 9, studentId: 1, status: "active" };

  await withStubs([
    [User, "findByPk", async () => activeUser()],
    [ClassroomMembership, "findOne", async () => membership],
    [UserProgress, "findAll", async () => [progressRow]],
    [UserProgress, "bulkCreate", async () => []],
    [UserProgress, "findOne", async () => progressRow],
    [LevelContentOverride, "findAll", async () => []],
  ], async () => {
    const { response, payload } = await apiRequest(
      "/api/progress/level/tutorial-level-1",
      {
        method: "PUT",
        token: authToken(1, "student"),
        body: {
          progressPercent: 100,
          isCompleted: true,
          sourceCode: "int hacked = 100;",
        },
      },
    );
    assert.equal(response.status, 422);
    assert.equal(payload.code, "LEVEL_VALIDATION_FAILED");
    assert.equal(progressRow.isCompleted, false);
  });
});

test("PUT /api/progress accepts valid source and returns the backend score", async () => {
  const user = activeUser();
  const progressRow = {
    id: 1,
    userId: 1,
    levelKey: "tutorial-level-1",
    lessonTitle: "Tutorial",
    orderIndex: 1,
    progressPercent: 0,
    isCompleted: false,
    completedAt: null,
    attemptCount: 1,
    timeSpentSeconds: 0,
    finalScore: null,
    startedAt: new Date(Date.now() - 60_000),
    save: async () => undefined,
  };
  const membership = { id: 1, classroomId: 9, studentId: 1, status: "active" };

  await withStubs([
    [User, "findByPk", async () => user],
    [User, "findAll", async () => []],
    [ClassroomMembership, "findOne", async () => membership],
    [ClassroomMembership, "findAll", async () => []],
    [UserProgress, "findAll", async () => [progressRow]],
    [UserProgress, "bulkCreate", async () => []],
    [UserProgress, "findOne", async () => progressRow],
    [LevelContentOverride, "findAll", async () => []],
    [LevelDeadline, "findOne", async () => null],
    [sequelize, "transaction", async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } })],
    [XpTransaction, "findOne", async () => null],
    [XpTransaction, "create", async (value) => value],
  ], async () => {
    const { response, payload } = await apiRequest(
      "/api/progress/level/tutorial-level-1",
      {
        method: "PUT",
        token: authToken(1, "student"),
        body: {
          progressPercent: 100,
          isCompleted: true,
          sourceCode: "int steps = 3;",
        },
      },
    );
    assert.equal(response.status, 200);
    assert.equal(progressRow.isCompleted, true);
    assert.equal(progressRow.finalScore, 95);
    assert.equal(payload.levels[0].finalScore, 95);
    assert.equal(payload.xpAward.amount, 25);
    assert.equal(payload.summary.xp, 25);
  });
});

test("failed attempts unlock the free hint at the teacher-controlled threshold", async () => {
  const progressRow = {
    userId: 1,
    levelKey: "tutorial-level-1",
    attemptCount: 0,
    isCompleted: false,
    hintUsed: false,
    save: async () => undefined,
  };
  const membership = { id: 1, classroomId: 9, studentId: 1, status: "active" };

  await withStubs([
    [User, "findByPk", async () => activeUser()],
    [ClassroomMembership, "findOne", async () => membership],
    [UserProgress, "findAll", async () => [progressRow]],
    [UserProgress, "bulkCreate", async () => []],
    [UserProgress, "findOne", async () => progressRow],
    [LevelContentOverride, "findAll", async () => [{
      levelKey: "tutorial-level-1",
      hintsEnabled: true,
      hintUnlockThreshold: 3,
      isEnabled: true,
      displayOrder: 1,
    }]],
  ], async () => {
    for (let expected = 1; expected <= 3; expected += 1) {
      const { response, payload } = await apiRequest(
        "/api/progress/level/tutorial-level-1/attempt",
        { method: "POST", token: authToken(1, "student"), body: {} },
      );
      assert.equal(response.status, 200);
      assert.equal(payload.attemptCount, expected);
      assert.equal(payload.hintUnlocked, expected >= 3);
      assert.equal(payload.attemptsRemaining, Math.max(0, 3 - expected));
    }

    const hintResponse = await apiRequest(
      "/api/progress/level/tutorial-level-1/hint-use",
      { method: "POST", token: authToken(1, "student"), body: {} },
    );
    assert.equal(hintResponse.response.status, 200);
    assert.equal(hintResponse.payload.hintUsed, true);
    assert.equal(progressRow.hintType, "basic");
    assert.equal(progressRow.attemptCountAtHintUnlock, 3);
  });
});

test("teacher routes reject students and allow teachers to create their own classroom", async () => {
  const student = activeUser({ role: "student" });
  await withStubs([[User, "findByPk", async () => student]], async () => {
    const { response } = await apiRequest("/api/teacher/classrooms", {
      token: authToken(1, "student"),
    });
    assert.equal(response.status, 403);
  });

  const teacher = activeUser({ id: 4, role: "teacher" });
  let createdClassroom;
  await withStubs([
    [User, "findByPk", async () => teacher],
    [Classroom, "findOne", async () => null],
    [Classroom, "create", async (values) => {
      createdClassroom = { id: 15, createdAt: new Date(), updatedAt: new Date(), ...values };
      return createdClassroom;
    }],
  ], async () => {
    const { response, payload } = await apiRequest("/api/teacher/classrooms", {
      method: "POST",
      token: authToken(4, "teacher"),
      body: {
        className: "Advanced C#",
        section: "BSIT 2A",
        schoolYear: "2026-2027",
      },
    });
    assert.equal(response.status, 201);
    assert.equal(payload.classroom.teacherId, 4);
    assert.equal(createdClassroom.teacherId, 4);
  });
});

test("teacher classroom controls enforce ownership and preserve removed memberships", async () => {
  const teacher = activeUser({ id: 4, role: "teacher" });
  const foreignClassroom = { id: 25, teacherId: 99, isActive: true };

  await withStubs([
    [User, "findByPk", async () => teacher],
    [Classroom, "findByPk", async () => foreignClassroom],
  ], async () => {
    const roster = await apiRequest("/api/teacher/classrooms/25/students", {
      token: authToken(4, "teacher"),
    });
    assert.equal(roster.response.status, 403);

    const classwork = await apiRequest("/api/teacher/classrooms/25/lessons", {
      token: authToken(4, "teacher"),
    });
    assert.equal(classwork.response.status, 403);

    const removal = await apiRequest("/api/teacher/classrooms/25/students/7", {
      method: "PATCH",
      token: authToken(4, "teacher"),
      body: { status: "removed" },
    });
    assert.equal(removal.response.status, 403);
  });

  const ownedClassroom = {
    id: 25, teacherId: 4, isActive: true, className: "Owned Class",
    section: "A", schoolYear: "2026-2027", classCode: "OLD234",
    save: async () => undefined,
  };
  const membership = {
    classroomId: 25, studentId: 7, status: "active", joinedAt: new Date(),
    save: async () => undefined,
  };
  await withStubs([
    [User, "findByPk", async () => teacher],
    [Classroom, "findByPk", async () => ownedClassroom],
    [ClassroomMembership, "findOne", async () => membership],
  ], async () => {
    const removal = await apiRequest("/api/teacher/classrooms/25/students/7", {
      method: "PATCH",
      token: authToken(4, "teacher"),
      body: { status: "removed" },
    });
    assert.equal(removal.response.status, 200);
    assert.equal(membership.status, "removed");
    assert.equal(removal.payload.membership.studentId, 7);
  });
});

test("teacher can archive, reactivate, and rotate the code of an owned classroom", async () => {
  const teacher = activeUser({ id: 4, role: "teacher" });
  const classroom = {
    id: 31, teacherId: 4, isActive: true, className: "Lifecycle Class",
    section: "B", schoolYear: "2026-2027", classCode: "OLD234",
    save: async () => undefined,
  };
  await withStubs([
    [User, "findByPk", async () => teacher],
    [Classroom, "findByPk", async () => classroom],
    [Classroom, "findOne", async () => null],
  ], async () => {
    const archived = await apiRequest("/api/teacher/classrooms/31", {
      method: "PATCH", token: authToken(4, "teacher"), body: { isActive: false },
    });
    assert.equal(archived.response.status, 200);
    assert.equal(classroom.isActive, false);

    const blockedRotation = await apiRequest("/api/teacher/classrooms/31/regenerate-code", {
      method: "POST", token: authToken(4, "teacher"), body: {},
    });
    assert.equal(blockedRotation.response.status, 409);

    const reactivated = await apiRequest("/api/teacher/classrooms/31", {
      method: "PATCH", token: authToken(4, "teacher"), body: { isActive: true },
    });
    assert.equal(reactivated.response.status, 200);

    const rotated = await apiRequest("/api/teacher/classrooms/31/regenerate-code", {
      method: "POST", token: authToken(4, "teacher"), body: {},
    });
    assert.equal(rotated.response.status, 200);
    assert.notEqual(classroom.classCode, "OLD234");
    assert.match(classroom.classCode, /^[A-Z2-9]{6}$/);
  });
});

test("teacher can update profile and change a password after current-password verification", async () => {
  const teacher = activeUser({
    id: 4, role: "teacher", authProvider: "password",
    password: bcrypt.hashSync("current-password", 4),
  });
  await withStubs([
    [User, "findByPk", async () => teacher],
    [User, "findOne", async () => null],
  ], async () => {
    const profile = await apiRequest("/api/auth/me/profile", {
      method: "PUT", token: authToken(4, "teacher"),
      body: { firstName: "Ada", lastName: "Teacher", username: "ada-teacher" },
    });
    assert.equal(profile.response.status, 200);
    assert.equal(profile.payload.user.username, "ada-teacher");

    const rejected = await apiRequest("/api/auth/me/password", {
      method: "PUT", token: authToken(4, "teacher"),
      body: { currentPassword: "wrong-password", newPassword: "new-password-123" },
    });
    assert.equal(rejected.response.status, 401);

    const changed = await apiRequest("/api/auth/me/password", {
      method: "PUT", token: authToken(4, "teacher"),
      body: { currentPassword: "current-password", newPassword: "new-password-123" },
    });
    assert.equal(changed.response.status, 200);
    assert.equal(await bcrypt.compare("new-password-123", teacher.password), true);
  });
});

test("admin status route updates a verified non-admin account and writes an audit log", async () => {
  const admin = activeUser({ id: 7, username: "admin", role: "admin" });
  const target = activeUser({ id: 8, username: "student-eight", status: "inactive" });
  let auditEntry;

  await withStubs([
    [User, "findByPk", async (id, options) => {
      if (id === 7) return options?.attributes?.length === 1 ? { username: admin.username } : admin;
      return target;
    }],
    [AdminActivityLog, "create", async (values) => {
      auditEntry = values;
      return values;
    }],
  ], async () => {
    const { response, payload } = await apiRequest("/api/admin/users/8/status", {
      method: "PATCH",
      token: authToken(7, "admin"),
      body: { status: "active" },
    });
    assert.equal(response.status, 200);
    assert.equal(payload.user.status, "active");
    assert.equal(auditEntry.activity, "Updated user status");
    assert.equal(auditEntry.targetUserId, 8);
  });
});

test("admin user and log endpoints return bounded pagination metadata", async () => {
  const admin = activeUser({ id: 7, username: "admin", role: "admin" });
  const userRows = [activeUser({ id: 21 }), activeUser({ id: 22 })];
  await withStubs([
    [User, "findByPk", async () => admin],
    [User, "findAndCountAll", async (options) => {
      assert.equal(options.limit, 2);
      assert.equal(options.offset, 2);
      return { count: 7, rows: userRows };
    }],
  ], async () => {
    const { response, payload } = await apiRequest("/api/admin/users?page=2&limit=2", { token: authToken(7, "admin") });
    assert.equal(response.status, 200);
    assert.equal(payload.total, 7);
    assert.equal(payload.totalPages, 4);
    assert.equal(payload.users.length, 2);
  });

  await withStubs([
    [User, "findByPk", async () => admin],
    [AdminActivityLog, "findAndCountAll", async (options) => {
      assert.equal(options.limit, 5);
      assert.equal(options.offset, 5);
      return { count: 11, rows: [] };
    }],
  ], async () => {
    const { response, payload } = await apiRequest("/api/admin/logs?page=2&limit=5", { token: authToken(7, "admin") });
    assert.equal(response.status, 200);
    assert.equal(payload.totalPages, 3);
  });
});

test("admin summary reports active users and classrooms", async () => {
  const admin = activeUser({ id: 7, role: "admin" });
  const counts = [40, 4, 31];
  await withStubs([
    [User, "findByPk", async () => admin],
    [User, "count", async () => counts.shift()],
    [Classroom, "count", async () => 6],
  ], async () => {
    const { response, payload } = await apiRequest("/api/admin/summary", { token: authToken(7, "admin") });
    assert.equal(response.status, 200);
    assert.deepEqual(payload, { totalUsers: 40, activeTeachers: 4, activeStudents: 31, activeClassrooms: 6 });
  });
});

test("admin role changes and deletion are audited while admin accounts remain protected", async () => {
  const admin = activeUser({ id: 7, username: "admin", role: "admin" });
  const target = activeUser({ id: 8, username: "student-eight", role: "student" });
  const auditRows = [];
  await withStubs([
    [User, "findByPk", async (id) => id === 7 ? admin : target],
    [AdminActivityLog, "create", async (values) => { auditRows.push(values); return values; }],
  ], async () => {
    const changed = await apiRequest("/api/admin/users/8/role", {
      method: "PATCH", token: authToken(7, "admin"), body: { role: "teacher" },
    });
    assert.equal(changed.response.status, 200);
    assert.equal(target.role, "teacher");
    assert.equal(auditRows.at(-1).activity, "Updated user role");

    const protectedAdmin = await apiRequest("/api/admin/users/7/role", {
      method: "PATCH", token: authToken(7, "admin"), body: { role: "student" },
    });
    assert.equal(protectedAdmin.response.status, 403);
  });

  let destroyed = false;
  target.destroy = async () => { destroyed = true; };
  await withStubs([
    [User, "findByPk", async (id) => id === 7 ? admin : target],
    [AdminActivityLog, "create", async (values) => { auditRows.push(values); return values; }],
  ], async () => {
    const deleted = await apiRequest("/api/admin/users/8", { method: "DELETE", token: authToken(7, "admin") });
    assert.equal(deleted.response.status, 200);
    assert.equal(destroyed, true);
    assert.equal(auditRows.at(-1).activity, "Deleted user account");
  });
});

test("admin password reset emails a temporary password and never returns it in the API", async () => {
  process.env.SMTP_HOST = "smtp.test.local";
  process.env.SMTP_USER = "mailer@test.local";
  process.env.SMTP_PASS = "test-password";
  process.env.EMAIL_FROM = "SharpRunner <mailer@test.local>";
  const admin = activeUser({ id: 7, username: "admin", role: "admin" });
  const teacher = activeUser({
    id: 8, username: "teacher-eight", role: "teacher", authProvider: "password",
    password: bcrypt.hashSync("old-password", 4),
  });
  let sentMail;
  await withStubs([
    [User, "findByPk", async (id) => id === 7 ? admin : teacher],
    [AdminActivityLog, "create", async (values) => values],
    [nodemailer, "createTransport", () => ({ sendMail: async (message) => { sentMail = message; } })],
  ], async () => {
    const { response, payload } = await apiRequest("/api/admin/users/8/reset-password", {
      method: "POST", token: authToken(7, "admin"), body: {},
    });
    assert.equal(response.status, 200);
    assert.equal("temporaryPassword" in payload, false);
    assert.match(sentMail.text, /Temporary password:/);
    const temporaryPassword = sentMail.text.match(/Temporary password: (.+)/)[1].trim();
    assert.equal(await bcrypt.compare(temporaryPassword, teacher.password), true);
  });
});

test("developer login token authorizes creation of a one-time admin invite", async () => {
  const login = await apiRequest("/api/developer/login", {
    method: "POST",
    body: { setupKey: process.env.DEVELOPER_SETUP_KEY },
  });
  assert.equal(login.response.status, 200);

  await withStubs([
    [AdminInvite, "findOne", async () => null],
    [AdminInvite, "create", async (values) => ({
      id: 22,
      createdAt: new Date(),
      ...values,
    })],
  ], async () => {
    const { response, payload } = await apiRequest("/api/developer/admin-invites", {
      method: "POST",
      token: login.payload.token,
      body: { invitedEmail: "future-admin@example.com", expiresInHours: 24 },
    });
    assert.equal(response.status, 201);
    assert.equal(payload.invite.invitedEmail, "future-admin@example.com");
    assert.match(payload.invite.inviteCode, /^[A-Z2-9]{10}$/);
  });
});
