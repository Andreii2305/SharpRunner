const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const crypto = require("node:crypto");

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
const PasswordResetToken = require("../src/models/PasswordResetToken");
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

const authToken = (id, role, tokenVersion = 0) =>
  jwt.sign({ id, role, tokenVersion }, process.env.JWT_SECRET, { expiresIn: "5m" });

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

test("GET /api/auth/me rejects an access token after its session version is revoked", async () => {
  await withStubs([
    [User, "findByPk", async () => activeUser({ tokenVersion: 4 })],
  ], async () => {
    const { response, payload } = await apiRequest("/api/auth/me", {
      token: authToken(1, "student", 3),
    });
    assert.equal(response.status, 401);
    assert.equal(payload.message, "Session has been revoked");
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
  const user = activeUser({ xpTotal: 40 });
  const progressRow = {
    userId: 1,
    levelKey: "tutorial-level-1",
    attemptCount: 0,
    isCompleted: false,
    hintUsed: false,
    detailedHintUnlocked: false,
    save: async () => undefined,
  };
  const membership = { id: 1, classroomId: 9, studentId: 1, status: "active" };

  await withStubs([
    [User, "findByPk", async () => user],
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
    [sequelize, "transaction", async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } })],
    [XpTransaction, "create", async (values) => values],
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
      assert.equal(payload.detailedHint, null);
      if (expected === 3) assert.ok(payload.basicHint.includes("portal method"));
    }

    const hintResponse = await apiRequest(
      "/api/progress/level/tutorial-level-1/hint-use",
      { method: "POST", token: authToken(1, "student"), body: {} },
    );
    assert.equal(hintResponse.response.status, 200);
    assert.equal(hintResponse.payload.hintUsed, true);
    assert.equal(progressRow.hintType, "basic");
    assert.equal(progressRow.attemptCountAtHintUnlock, 3);

    const purchaseResponse = await apiRequest(
      "/api/progress/level/tutorial-level-1/detailed-hint-purchase",
      { method: "POST", token: authToken(1, "student"), body: {} },
    );
    assert.equal(purchaseResponse.response.status, 200);
    assert.equal(purchaseResponse.payload.purchased, true);
    assert.equal(purchaseResponse.payload.currentXp, 25);
    assert.ok(purchaseResponse.payload.detailedHint.includes("WalkToPortal"));

    const retryResponse = await apiRequest(
      "/api/progress/level/tutorial-level-1/detailed-hint-purchase",
      { method: "POST", token: authToken(1, "student"), body: {} },
    );
    assert.equal(retryResponse.response.status, 200);
    assert.equal(retryResponse.payload.purchased, false);
    assert.equal(retryResponse.payload.currentXp, 25);
  });
});

test("hint state persists across refresh for teacher thresholds 1 and 5", async () => {
  const user = activeUser({ xpTotal: 40 });
  const progressRow = {
    userId: 1,
    levelKey: "tutorial-level-1",
    attemptCount: 0,
    isCompleted: false,
    hintUsed: false,
    detailedHintUnlocked: false,
    startedAt: new Date(),
    save: async () => undefined,
  };
  const membership = { id: 1, classroomId: 9, studentId: 1, status: "active" };
  const setting = {
    levelKey: "tutorial-level-1",
    hintsEnabled: true,
    hintUnlockThreshold: 1,
    isEnabled: true,
    displayOrder: 1,
  };

  await withStubs([
    [User, "findByPk", async () => user],
    [ClassroomMembership, "findOne", async () => membership],
    [UserProgress, "findAll", async () => [progressRow]],
    [UserProgress, "bulkCreate", async () => []],
    [UserProgress, "findOne", async () => progressRow],
    [LevelContentOverride, "findAll", async () => [setting]],
  ], async () => {
    for (const threshold of [1, 5]) {
      setting.hintUnlockThreshold = threshold;
      progressRow.attemptCount = 0;

      for (let expected = 1; expected <= threshold; expected += 1) {
        const attempt = await apiRequest(
          "/api/progress/level/tutorial-level-1/attempt",
          { method: "POST", token: authToken(1, "student"), body: {} },
        );
        assert.equal(attempt.response.status, 200);
        assert.equal(attempt.payload.hintUnlocked, expected === threshold);
        assert.equal(attempt.payload.attemptsRemaining, threshold - expected);
        assert.equal(attempt.payload.basicHint === null, expected < threshold);
      }

      const refreshed = await apiRequest(
        "/api/progress/level/tutorial-level-1/start",
        { method: "POST", token: authToken(1, "student"), body: {} },
      );
      assert.equal(refreshed.response.status, 200);
      assert.equal(refreshed.payload.hintUnlockThreshold, threshold);
      assert.equal(refreshed.payload.hintUnlocked, true);
      assert.ok(refreshed.payload.basicHint.includes("portal method"));
      assert.equal(refreshed.payload.detailedHint, null);
    }
  });
});

test("teacher-disabled hints hide both tiers and reject use or purchase", async () => {
  const user = activeUser({ xpTotal: 40 });
  const progressRow = {
    userId: 1,
    levelKey: "tutorial-level-1",
    attemptCount: 5,
    isCompleted: false,
    hintUsed: true,
    detailedHintUnlocked: true,
    detailedHintPurchasedAt: new Date(),
    startedAt: new Date(),
    save: async () => undefined,
  };
  const membership = { id: 1, classroomId: 9, studentId: 1, status: "active" };
  const disabledSetting = {
    levelKey: "tutorial-level-1",
    hintsEnabled: false,
    hintUnlockThreshold: 3,
    isEnabled: true,
    displayOrder: 1,
  };

  await withStubs([
    [User, "findByPk", async () => user],
    [ClassroomMembership, "findOne", async () => membership],
    [UserProgress, "findAll", async () => [progressRow]],
    [UserProgress, "bulkCreate", async () => []],
    [UserProgress, "findOne", async () => progressRow],
    [LevelContentOverride, "findAll", async () => [disabledSetting]],
    [sequelize, "transaction", async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } })],
  ], async () => {
    const refreshed = await apiRequest(
      "/api/progress/level/tutorial-level-1/start",
      { method: "POST", token: authToken(1, "student"), body: {} },
    );
    assert.equal(refreshed.response.status, 200);
    assert.equal(refreshed.payload.hintsEnabled, false);
    assert.equal(refreshed.payload.hintUnlocked, false);
    assert.equal(refreshed.payload.basicHint, null);
    assert.equal(refreshed.payload.detailedHint, null);

    const basic = await apiRequest(
      "/api/progress/level/tutorial-level-1/hint-use",
      { method: "POST", token: authToken(1, "student"), body: {} },
    );
    assert.equal(basic.response.status, 403);
    assert.equal(basic.payload.code, "HINTS_DISABLED");

    const detailed = await apiRequest(
      "/api/progress/level/tutorial-level-1/detailed-hint-purchase",
      { method: "POST", token: authToken(1, "student"), body: {} },
    );
    assert.equal(detailed.response.status, 403);
    assert.equal(detailed.payload.code, "HINTS_DISABLED");
    assert.equal(user.xpTotal, 40);
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
  const counts = [40, 35, 4, 31, 5];
  await withStubs([
    [User, "findByPk", async () => admin],
    [User, "count", async () => counts.shift()],
    [Classroom, "count", async () => 6],
  ], async () => {
    const { response, payload } = await apiRequest("/api/admin/summary", { token: authToken(7, "admin") });
    assert.equal(response.status, 200);
    assert.deepEqual(payload, { totalUsers: 40, activeUsers: 35, activeTeachers: 4, activeStudents: 31, activeClassrooms: 6, archivedAccounts: 5 });
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
  target.status = "archived";
  target.destroy = async () => { destroyed = true; };
  await withStubs([
    [User, "findByPk", async (id) => id === 7 ? admin : target],
    [AdminActivityLog, "create", async (values) => { auditRows.push(values); return values; }],
  ], async () => {
    const deleted = await apiRequest("/api/admin/users/8", { method: "DELETE", token: authToken(7, "admin"), body: { confirmation: "DELETE" } });
    assert.equal(deleted.response.status, 200);
    assert.equal(destroyed, true);
    assert.equal(auditRows.at(-1).activity, "USER_DELETED");
  });
});

test("admin archive, restore, and force logout preserve accounts and rotate token versions", async () => {
  const admin = activeUser({ id: 7, username: "admin", role: "admin", tokenVersion: 0 });
  const target = activeUser({ id: 8, username: "student-eight", role: "student", tokenVersion: 2 });
  const auditRows = [];
  await withStubs([
    [User, "findByPk", async (id, options) => id === 7 ? (options?.attributes?.length === 1 ? { username: admin.username } : admin) : target],
    [AdminActivityLog, "create", async (values) => { auditRows.push(values); return values; }],
  ], async () => {
    const archived = await apiRequest("/api/admin/users/8/archive", { method: "POST", token: authToken(7, "admin"), body: {} });
    assert.equal(archived.response.status, 200);
    assert.equal(target.status, "archived");
    assert.equal(target.tokenVersion, 3);
    assert.equal(auditRows.at(-1).activity, "USER_ARCHIVED");

    const restored = await apiRequest("/api/admin/users/8/restore", { method: "POST", token: authToken(7, "admin"), body: {} });
    assert.equal(restored.response.status, 200);
    assert.equal(target.status, "active");
    assert.equal(target.tokenVersion, 4);
    assert.equal(auditRows.at(-1).activity, "USER_RESTORED");

    const revoked = await apiRequest("/api/admin/users/8/force-logout", { method: "POST", token: authToken(7, "admin"), body: {} });
    assert.equal(revoked.response.status, 200);
    assert.equal(target.tokenVersion, 5);
    assert.equal(auditRows.at(-1).activity, "SESSION_REVOKED");
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

test("forgot-password is generic, hashes emailed tokens, and excludes Google and archived accounts", async () => {
  process.env.SMTP_HOST = "smtp.test.local";
  process.env.SMTP_USER = "mailer@test.local";
  process.env.SMTP_PASS = "test-password";
  process.env.EMAIL_FROM = "SharpRunner <mailer@test.local>";
  process.env.FRONTEND_URL = "https://app.sharprunner.test";
  const localUser = activeUser({
    id: 81,
    authProvider: "password",
    password: null,
  });
  const googleUser = activeUser({ id: 82, email: "google@example.com", authProvider: "google" });
  const archivedUser = activeUser({
    id: 83,
    email: "archived@example.com",
    status: "archived",
    authProvider: "password",
    password: bcrypt.hashSync("old-password", 4),
  });
  const pendingUser = activeUser({
    id: 84,
    email: "pending@example.com",
    status: "pending",
    emailVerifiedAt: null,
    authProvider: "password",
    password: bcrypt.hashSync("old-password", 4),
  });
  const lookupResults = [localUser, null, googleUser, archivedUser, pendingUser];
  const storedRecords = [];
  const sentMail = [];

  await withStubs([
    [User, "findOne", async () => lookupResults.shift() || null],
    [User, "findByPk", async (id) => id === pendingUser.id ? pendingUser : localUser],
    [PasswordResetToken, "findOne", async () => null],
    [PasswordResetToken, "update", async () => [0]],
    [PasswordResetToken, "create", async (values) => {
      storedRecords.push(values);
      return { ...values, id: 1, destroy: async () => undefined };
    }],
    [sequelize, "transaction", async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } })],
    [nodemailer, "createTransport", () => ({ sendMail: async (message) => { sentMail.push(message); } })],
  ], async () => {
    const responses = [];
    for (const email of [
      localUser.email,
      "missing@example.com",
      googleUser.email,
      archivedUser.email,
      pendingUser.email,
    ]) {
      responses.push(await apiRequest("/api/auth/forgot-password", {
        method: "POST",
        body: { email },
      }));
    }

    for (const result of responses) {
      assert.equal(result.response.status, 200);
      assert.equal(
        result.payload.message,
        "If an account exists for that email, password reset instructions have been sent.",
      );
    }
    assert.equal(sentMail.length, 2);
    assert.equal(sentMail[0].to, localUser.email);
    assert.equal(sentMail[1].to, pendingUser.email);
    for (const [index, message] of sentMail.entries()) {
      assert.doesNotMatch(message.text, /old-password/);
      const rawToken = new URL(message.text.match(/https:\/\/\S+/)[0]).searchParams.get("token");
      assert.equal(rawToken.length, 64);
      assert.equal(
        storedRecords[index].tokenHash,
        crypto.createHash("sha256").update(rawToken).digest("hex"),
      );
      assert.notEqual(storedRecords[index].tokenHash, rawToken);
    }
    assert.equal(pendingUser.status, "pending");
    assert.equal(pendingUser.emailVerifiedAt, null);
  });
});

test("forgot-password rate limiting does not disclose account existence", async () => {
  const expected = "Too many password reset requests. Please try again later.";
  const limited = await apiRequest("/api/auth/forgot-password", {
    method: "POST",
    body: { email: "test@example.com" },
  });
  assert.equal(limited.response.status, 429);
  assert.equal(limited.payload.message, expected);
});

test("reset-password is single-use, bcrypt-hashes the password, and revokes an existing JWT", async () => {
  const rawToken = "a".repeat(64);
  const user = activeUser({
    id: 91,
    authProvider: "password",
    password: null,
    tokenVersion: 2,
  });
  const oldSession = authToken(user.id, user.role, user.tokenVersion);
  let available = true;
  let invalidatedCount = 0;

  await withStubs([
    [PasswordResetToken, "findOne", async () => available
      ? { id: 7, userId: user.id, usedAt: null, expiresAt: new Date(Date.now() + 60_000) }
      : null],
    [PasswordResetToken, "update", async () => {
      available = false;
      invalidatedCount += 1;
      return [1];
    }],
    [User, "findByPk", async () => user],
    [sequelize, "transaction", async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } })],
  ], async () => {
    const reset = await apiRequest("/api/auth/reset-password", {
      method: "POST",
      body: { token: rawToken, password: "new-password-123", confirmPassword: "new-password-123" },
    });
    assert.equal(reset.response.status, 200);
    assert.equal(await bcrypt.compare("new-password-123", user.password), true);
    assert.equal(user.tokenVersion, 3);
    assert.equal(invalidatedCount, 1);

    const reuse = await apiRequest("/api/auth/reset-password", {
      method: "POST",
      body: { token: rawToken, password: "other-password", confirmPassword: "other-password" },
    });
    assert.equal(reuse.response.status, 400);
    assert.equal(reuse.payload.message, "This password reset link is invalid or has expired.");

    const protectedRequest = await apiRequest("/api/auth/me", { token: oldSession });
    assert.equal(protectedRequest.response.status, 401);
    assert.equal(protectedRequest.payload.message, "Session has been revoked");
  });
});

test("reset-password enforces confirmation and the existing eight-character policy", async () => {
  const token = "b".repeat(64);
  const mismatch = await apiRequest("/api/auth/reset-password", {
    method: "POST",
    body: { token, password: "long-enough", confirmPassword: "different-password" },
  });
  assert.equal(mismatch.response.status, 400);
  assert.equal(mismatch.payload.message, "Passwords do not match.");

  const short = await apiRequest("/api/auth/reset-password", {
    method: "POST",
    body: { token, password: "short", confirmPassword: "short" },
  });
  assert.equal(short.response.status, 400);
  assert.equal(short.payload.message, "Password must be at least 8 characters.");
});

test("reset-password gives one response for invalid, expired, used, and superseded tokens", async () => {
  await withStubs([
    [PasswordResetToken, "findOne", async () => null],
    [sequelize, "transaction", async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } })],
  ], async () => {
    for (const token of ["c", "d", "e", "f"].map((letter) => letter.repeat(64))) {
      const result = await apiRequest("/api/auth/reset-password", {
        method: "POST",
        body: { token, password: "valid-password", confirmPassword: "valid-password" },
      });
      assert.equal(result.response.status, 400);
      assert.equal(result.payload.message, "This password reset link is invalid or has expired.");
    }
  });
});
