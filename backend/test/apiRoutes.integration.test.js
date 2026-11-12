const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const crypto = require("node:crypto");
const fs = require("node:fs");
const dns = require("node:dns").promises;
const { Op } = require("sequelize");

process.env.JWT_SECRET = "integration-test-secret-with-sufficient-length";
process.env.DEVELOPER_SETUP_KEY = "developer-integration-key";
process.env.ADMIN_SETUP_KEY = "admin-integration-key";

const app = require("../src/app");
const User = require("../src/models/User");
const UserProgress = require("../src/models/UserProgress");
const Classroom = require("../src/models/Classroom");
const ClassroomLesson = require("../src/models/ClassroomLesson");
const ClassroomLessonAttachment = require("../src/models/ClassroomLessonAttachment");
const ClassroomLessonPlacement = require("../src/models/ClassroomLessonPlacement");
const ClassroomLessonContentAccess = require("../src/models/ClassroomLessonContentAccess");
const ClassroomLessonReadingCompletion = require("../src/models/ClassroomLessonReadingCompletion");
const ClassroomLessonProgress = require("../src/models/ClassroomLessonProgress");
const ClassroomLessonSubmission = require("../src/models/ClassroomLessonSubmission");
const ClassroomLessonSubmissionAttachment = require("../src/models/ClassroomLessonSubmissionAttachment");
const ClassroomLessonVersion = require("../src/models/ClassroomLessonVersion");
const LessonTopic = require("../src/models/LessonTopic");
const ClassroomMembership = require("../src/models/ClassroomMembership");
const LevelContentOverride = require("../src/models/LevelContentOverride");
const LevelDeadline = require("../src/models/LevelDeadline");
const AdminActivityLog = require("../src/models/AdminActivityLog");
const AdminInvite = require("../src/models/AdminInvite");
const XpTransaction = require("../src/models/XpTransaction");
const PasswordResetToken = require("../src/models/PasswordResetToken");
const EmailVerificationToken = require("../src/models/EmailVerificationToken");
const HintFeedback = require("../src/models/HintFeedback");
const LearningAnalyticsEvent = require("../src/models/LearningAnalyticsEvent");
const GameInterruptionCompletionEvidence = require("../src/models/GameInterruptionCompletionEvidence");
const GameInterruptionEvent = require("../src/models/GameInterruptionEvent");
const GameInterruptionSession = require("../src/models/GameInterruptionSession");
const PublicTestimonialSubmission = require("../src/models/PublicTestimonialSubmission");
const LessonAssessment = require("../src/models/LessonAssessment");
const AssessmentAttempt = require("../src/models/AssessmentAttempt");
const AssessmentAttemptGrant = require("../src/models/AssessmentAttemptGrant");
const sequelize = require("../src/config/database");
const lessonStorage = require("../src/services/lessonFileStorageService");
const officePreviewService = require("../src/services/officePreviewService");
const customLessonLifecycle = require("../src/services/customLessonLifecycleService");
const classroomMembershipDecisionService = require("../src/services/classroomMembershipDecisionService");
const classroomJoinRequestService = require("../src/services/classroomJoinRequestService");
const builtInLessonContentService = require("../src/services/builtInLessonContentService");
const lessonProgressionService = require("../src/services/lessonProgressionService");
const studentClassService = require("../src/services/studentClassService");
const { derivePublicationStatus } = require("../src/services/lessonBuilderService");
const { DEFAULT_LEVEL_PROGRESS } = require("../src/constants/progressDefaults");
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

const authToken = (id, role, tokenVersion = 0) =>
  jwt.sign({ id, role, tokenVersion }, process.env.JWT_SECRET, { expiresIn: "5m" });

const apiRequest = async (path, { method = "GET", token, body, headers = {} } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
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

const completionInterruptionStubs = ({ classroomId = 9 } = {}) => {
  let nextEvidenceId = 1;
  let evidenceRow = null;
  return [
    [Classroom, "findByPk", async (id) => ({ id, isActive: true })],
    [GameInterruptionSession, "findAll", async () => []],
    [GameInterruptionEvent, "findAll", async () => []],
    [GameInterruptionCompletionEvidence, "findOne", async () => evidenceRow],
    [GameInterruptionCompletionEvidence, "create", async (values) => {
      evidenceRow = { id: nextEvidenceId++, classroomId, ...values };
      return evidenceRow;
    }],
  ];
};

const transactionStub = async (optionsOrCallback, maybeCallback) => {
  const callback = typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback;
  const transaction = {
    LOCK: { UPDATE: "UPDATE" },
    finished: false,
    ...(typeof optionsOrCallback === "object" ? { parent: optionsOrCallback.transaction } : {}),
  };
  return callback(transaction);
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
  termsVersionAccepted: TERMS_VERSION,
  termsAcceptedAt: new Date(),
  privacyVersionAcknowledged: PRIVACY_POLICY_VERSION,
  privacyAcknowledgedAt: new Date(),
  researchConsent: false,
  researchConsentAt: null,
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
    assert.equal(payload.user.policyStatus.requiresAcceptance, false);
    assert.equal(jwt.verify(payload.token, process.env.JWT_SECRET).id, 11);
  });
});

test("email token and code verification activate through the locked status transition", async () => {
  const user = activeUser({
    id: 61,
    role: "teacher",
    status: "pending",
    emailVerifiedAt: null,
    email: "pending-teacher@example.com",
  });
  const tokenRecord = {
    id: 501,
    userId: user.id,
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    async save(options) {
      assert.equal(options.transaction.LOCK.UPDATE, "UPDATE");
    },
  };
  let tokenUpdates = 0;

  await withStubs([
    [sequelize, "transaction", transactionStub],
    [User, "findByPk", async (id, options) => {
      assert.equal(id, user.id);
      assert.equal(options.lock, "UPDATE");
      return user;
    }],
    [User, "findOne", async () => user],
    [PublicTestimonialSubmission, "findAll", async () => {
      throw new Error("activation must not load testimonial submissions");
    }],
    [EmailVerificationToken, "findOne", async () => tokenRecord],
    [EmailVerificationToken, "update", async (_values, options) => {
      assert.equal(options.transaction.LOCK.UPDATE, "UPDATE");
      tokenUpdates += 1;
      return [1];
    }],
  ], async () => {
    const tokenResult = await apiRequest("/api/auth/verify-email", {
      method: "POST",
      body: { token: "a".repeat(64) },
    });
    assert.equal(tokenResult.response.status, 200);
    assert.equal(user.status, "active");
    assert.ok(user.emailVerifiedAt instanceof Date);

    user.status = "pending";
    user.emailVerifiedAt = null;
    tokenRecord.usedAt = null;
    const codeResult = await apiRequest("/api/auth/verify-email-code", {
      method: "POST",
      body: { email: user.email, code: "123456" },
    });
    assert.equal(codeResult.response.status, 200);
    assert.equal(user.status, "active");
    assert.ok(user.emailVerifiedAt instanceof Date);
  });

  assert.equal(tokenUpdates, 2);
});

test("registration requires Terms agreement and Privacy acknowledgement before account creation", async () => {
  let createCalled = false;
  await withStubs([[User, "create", async () => { createCalled = true; }]], async () => {
    const { response, payload } = await apiRequest("/api/auth/register", {
      method: "POST",
      body: {
        firstName: "New", lastName: "Student", username: "new-student",
        email: "new-student@example.com", password: "password123",
        acceptTerms: false, acknowledgePrivacy: true,
      },
    });
    assert.equal(response.status, 400);
    assert.equal(payload.code, "POLICY_ACCEPTANCE_REQUIRED");
    assert.equal(createCalled, false);
  });
});

test("registration stores server-controlled policy versions and keeps research consent optional", async () => {
  const created = [];
  process.env.SMTP_HOST = "smtp.test.local";
  process.env.SMTP_USER = "mailer@test.local";
  process.env.SMTP_PASS = "test-password";
  process.env.EMAIL_FROM = "SharpRunner <mailer@test.local>";

  await withStubs([
    [dns, "resolveMx", async () => [{ exchange: "mail.example.com", priority: 10 }]],
    [User, "findOne", async () => null],
    [User, "create", async (values) => {
      const user = { id: 100 + created.length, ...values, destroy: async () => undefined };
      created.push(user);
      return user;
    }],
    [EmailVerificationToken, "create", async (values) => ({ id: 50 + created.length, ...values, destroy: async () => undefined })],
    [EmailVerificationToken, "update", async () => [0]],
    [AdminActivityLog, "create", async (values) => values],
    [nodemailer, "createTransport", () => ({ sendMail: async () => undefined })],
  ], async () => {
    for (const [suffix, researchConsent] of [["optional-off", false], ["optional-on", true]]) {
      const result = await apiRequest("/api/auth/register", {
        method: "POST",
        body: {
          firstName: "Policy", lastName: "Student", username: suffix,
          email: `${suffix}@example.com`, password: "password123",
          acceptTerms: true, acknowledgePrivacy: true, researchConsent,
        },
      });
      assert.equal(result.response.status, 201);
    }
  });

  assert.equal(created.length, 2);
  for (const user of created) {
    assert.equal(user.termsVersionAccepted, TERMS_VERSION);
    assert.equal(user.privacyVersionAcknowledged, PRIVACY_POLICY_VERSION);
    assert.ok(user.termsAcceptedAt instanceof Date);
    assert.ok(user.privacyAcknowledgedAt instanceof Date);
  }
  assert.equal(created[0].researchConsent, false);
  assert.equal(created[0].researchConsentAt, null);
  assert.equal(created[1].researchConsent, true);
  assert.ok(created[1].researchConsentAt instanceof Date);
});

test("outdated users are gated, current users are not, and acceptance only updates the caller", async () => {
  const oldUser = activeUser({
    id: 41,
    termsVersionAccepted: null,
    privacyVersionAcknowledged: null,
  });
  await withStubs([
    [User, "findByPk", async () => oldUser],
    [AdminActivityLog, "create", async (values) => values],
  ], async () => {
    const blocked = await apiRequest("/api/practice/health", { token: authToken(41, "student") });
    assert.equal(blocked.response.status, 428);
    assert.equal(blocked.payload.code, "POLICY_ACCEPTANCE_REQUIRED");

    oldUser.termsVersionAccepted = "0.9";
    oldUser.privacyVersionAcknowledged = PRIVACY_POLICY_VERSION;
    const oldTermsBlocked = await apiRequest("/api/practice/health", { token: authToken(41, "student") });
    assert.equal(oldTermsBlocked.response.status, 428);
    assert.equal(oldTermsBlocked.payload.policyStatus.privacyAcknowledged, true);
    assert.equal(oldTermsBlocked.payload.policyStatus.termsAccepted, false);

    const me = await apiRequest("/api/auth/me", { token: authToken(41, "student") });
    assert.equal(me.response.status, 200);
    assert.equal(me.payload.user.policyStatus.requiresAcceptance, true);

    const accepted = await apiRequest("/api/auth/me/policy-acceptance", {
      method: "PUT",
      token: authToken(41, "student"),
      body: { userId: 999, acceptTerms: true, acknowledgePrivacy: true },
    });
    assert.equal(accepted.response.status, 200);
    assert.equal(oldUser.id, 41);
    assert.equal(oldUser.termsVersionAccepted, TERMS_VERSION);
    assert.equal(oldUser.privacyVersionAcknowledged, PRIVACY_POLICY_VERSION);
    assert.equal(accepted.payload.policyStatus.requiresAcceptance, false);
  });
});

test("research consent can be declined or withdrawn only for the authenticated user", async () => {
  const user = activeUser({ id: 51, researchConsent: false, researchConsentAt: null });
  const auditRows = [];
  await withStubs([
    [User, "findByPk", async () => user],
    [AdminActivityLog, "create", async (values) => { auditRows.push(values); return values; }],
  ], async () => {
    const enabled = await apiRequest("/api/auth/me/research-consent", {
      method: "PUT", token: authToken(51, "student"),
      body: { userId: 999, researchConsent: true },
    });
    assert.equal(enabled.response.status, 200);
    assert.equal(user.id, 51);
    assert.equal(user.researchConsent, true);
    assert.ok(user.researchConsentAt instanceof Date);

    const withdrawn = await apiRequest("/api/auth/me/research-consent", {
      method: "PUT", token: authToken(51, "student"), body: { researchConsent: false },
    });
    assert.equal(withdrawn.response.status, 200);
    assert.equal(user.researchConsent, false);
    assert.equal(user.researchConsentAt, null);
    assert.deepEqual(auditRows.map((row) => row.activity), ["RESEARCH_CONSENT_GRANTED", "RESEARCH_CONSENT_WITHDRAWN"]);
  });
});

test("POST /api/practice/run requires an authenticated learner or educator and rejects unsafe APIs before execution", async () => {
  const unauthenticated = await apiRequest("/api/practice/run", {
    method: "POST",
    body: { code: 'Console.WriteLine("Hello");' },
  });
  assert.equal(unauthenticated.response.status, 401);

  await withStubs([[User, "findByPk", async () => activeUser({ id: 82, role: "student" })]], async () => {
    const unsafe = await apiRequest("/api/practice/run", {
      method: "POST",
      token: authToken(82, "student"),
      body: { code: 'System.IO.File.ReadAllText("secret");' },
    });
    assert.equal(unsafe.response.status, 400);
    assert.equal(unsafe.payload.rejected, true);
    assert.match(unsafe.payload.stderr, /File access/);
  });
});

test("practice API reports remote health and preserves runner result types", async () => {
  const http = require("node:http");
  const runnerToken = "remote-runner-token-that-is-at-least-32-characters";
  let runnerMode = "success";
  let coldHealthRequests = 0;
  const runnerServer = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/health/auth") {
      if (req.headers.authorization !== `Bearer ${runnerToken}` || runnerMode === "auth") {
        res.statusCode = 401;
        res.end(JSON.stringify({ message: "Unauthorized" }));
      } else if (runnerMode === "unhealthy") {
        res.statusCode = 503;
        res.end(JSON.stringify({ status: "error", dotnet: false }));
      } else if (runnerMode === "loading" || (runnerMode === "cold" && coldHealthRequests++ < 2)) {
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.end("<html><body>Service waking up</body></html>");
      } else {
        res.end(JSON.stringify({ status: "ok", dotnet: true }));
      }
      return;
    }
    if (req.url !== "/run" || req.method !== "POST") {
      res.statusCode = 404;
      res.end(JSON.stringify({ message: "Not found" }));
      return;
    }
    if (req.headers.authorization !== `Bearer ${runnerToken}` || runnerMode === "auth") {
      res.statusCode = 401;
      res.end(JSON.stringify({ message: "Unauthorized" }));
      return;
    }
    if (runnerMode === "unhealthy") {
      res.statusCode = 503;
      res.end(JSON.stringify({ message: "Runner unavailable" }));
      return;
    }
    const results = {
      success: { success: true, stdout: "api works", stderr: "" },
      cold: { success: true, stdout: "runner woke", stderr: "" },
      compiler: { success: false, stdout: "", stderr: "error CS1002", errorType: "compiler" },
      runtime: { success: false, stdout: "", stderr: "IndexOutOfRangeException", errorType: "runtime" },
      timeout: { success: false, stdout: "", stderr: "Execution timed out", timedOut: true, errorType: "timeout" },
    };
    res.end(JSON.stringify(results[runnerMode]));
  });
  await new Promise((resolve) => runnerServer.listen(0, "127.0.0.1", resolve));

  const previous = Object.fromEntries(["NODE_ENV", "PRACTICE_RUNNER_URL", "PRACTICE_RUNNER_TOKEN", "PRACTICE_RUNNER_READY_TIMEOUT_MS"].map((key) => [key, process.env[key]]));
  process.env.NODE_ENV = "production";
  process.env.PRACTICE_RUNNER_URL = `127.0.0.1:${runnerServer.address().port}`;
  process.env.PRACTICE_RUNNER_TOKEN = ` ${runnerToken} `;
  process.env.PRACTICE_RUNNER_READY_TIMEOUT_MS = "200";
  const studentStub = [[User, "findByPk", async () => activeUser({ id: 83, role: "student" })]];
  try {
    await withStubs(studentStub, async () => {
      const health = await apiRequest("/api/practice/health", { token: authToken(83, "student") });
      assert.equal(health.response.status, 200);
      assert.deepEqual(health.payload, { available: true });

      for (const mode of ["success", "compiler", "runtime", "timeout"]) {
        runnerMode = mode;
        const result = await apiRequest("/api/practice/run", { method: "POST", token: authToken(83, "student"), body: { code: `// ${mode}\nConsole.WriteLine(1);` } });
        assert.equal(result.response.status, mode === "timeout" ? 408 : 200);
        assert.equal(result.payload.errorType, mode === "success" ? undefined : mode);
      }

      runnerMode = "cold";
      coldHealthRequests = 0;
      const startingOne = await apiRequest("/api/practice/run", { method: "POST", token: authToken(83, "student"), body: { code: "Console.WriteLine(1);" } });
      assert.equal(startingOne.response.status, 503);
      assert.equal(startingOne.payload.code, "PRACTICE_RUNNER_STARTING");
      assert.equal(startingOne.response.headers.get("retry-after"), "5");
      const startingTwo = await apiRequest("/api/practice/run", { method: "POST", token: authToken(83, "student"), body: { code: "Console.WriteLine(1);" } });
      assert.equal(startingTwo.response.status, 503);
      const coldStart = await apiRequest("/api/practice/run", { method: "POST", token: authToken(83, "student"), body: { code: "Console.WriteLine(1);" } });
      assert.equal(coldStart.response.status, 200);
      assert.equal(coldStart.payload.stdout, "runner woke");
      assert.equal(coldHealthRequests, 3);

      runnerMode = "loading";
      const wakeTimeout = await apiRequest("/api/practice/run", { method: "POST", token: authToken(83, "student"), body: { code: "Console.WriteLine(1);" } });
      assert.equal(wakeTimeout.response.status, 503);
      assert.equal(wakeTimeout.payload.errorType, "service_starting");
      assert.equal(wakeTimeout.payload.reason, "runner_starting");

      runnerMode = "auth";
      const authFailure = await apiRequest("/api/practice/run", { method: "POST", token: authToken(83, "student"), body: { code: "Console.WriteLine(1);" } });
      assert.equal(authFailure.response.status, 503);
      assert.equal(authFailure.payload.errorType, "authentication");
      assert.equal(authFailure.payload.reason, "runner_auth_failed");
      assert.equal(authFailure.payload.unavailable, true);
      assert.equal(authFailure.payload.stdout, "");
      runnerMode = "unhealthy";
      const runtimeFailure = await apiRequest("/api/practice/run", { method: "POST", token: authToken(83, "student"), body: { code: "Console.WriteLine(1);" } });
      assert.equal(runtimeFailure.response.status, 503);
      assert.equal(runtimeFailure.payload.errorType, "service_unavailable");
      assert.equal(runtimeFailure.payload.reason, "runtime_unavailable");
    });

    await new Promise((resolve) => runnerServer.close(resolve));
    await withStubs(studentStub, async () => {
      const unreachable = await apiRequest("/api/practice/run", { method: "POST", token: authToken(83, "student"), body: { code: "Console.WriteLine(1);" } });
      assert.equal(unreachable.response.status, 503);
      delete process.env.PRACTICE_RUNNER_URL;
      const missing = await apiRequest("/api/practice/health", { token: authToken(83, "student") });
      assert.equal(missing.response.status, 503);
      assert.deepEqual(missing.payload, { available: false, reason: "runner_url_missing" });
    });
  } finally {
    if (runnerServer.listening) await new Promise((resolve) => runnerServer.close(resolve));
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
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

test("teacher dashboard uses unique active students from active classrooms without truncating rows", async () => {
  const classrooms = Array.from({ length: 5 }, (_, index) => ({
    id: index + 1,
    className: `Class ${index + 1}`,
    section: `Section ${index + 1}`,
    schoolYear: "2026-2027",
    maxStudents: 30,
    description: null,
    classCode: `CODE${index + 1}`,
    teacherId: 4,
    isActive: true,
    createdAt: new Date(),
  }));
  const students = Array.from({ length: 12 }, (_, index) => activeUser({
    id: index + 1,
    username: `student-${index + 1}`,
    firstName: "Student",
    lastName: String(index + 1),
    isPlayingGame: false,
    lastGameHeartbeatAt: null,
    gamificationPreference: null,
  }));
  const memberships = students.map((student, index) => ({
    classroomId: (index % 2) + 1,
    studentId: student.id,
    joinedAt: new Date(),
    updatedAt: new Date(),
  }));
  memberships.push({ classroomId: 2, studentId: 1, joinedAt: new Date(), updatedAt: new Date() });

  await withStubs([
    [User, "findByPk", async () => activeUser({ id: 4, role: "teacher" })],
    [Classroom, "findAll", async (options) => {
      assert.equal(options.where.teacherId, 4);
      assert.equal(options.where.isActive, true);
      return classrooms;
    }],
    [ClassroomMembership, "findAll", async (options) => {
      assert.equal(options.where.status, "active");
      return memberships;
    }],
    [User, "findAll", async (options) => {
      assert.equal(options.where.role, "student");
      assert.equal(options.where.status, "active");
      return students;
    }],
    [UserProgress, "findAll", async (options) => options.group
      ? students.map((student) => ({ userId: student.id, rowCount: 100 }))
      : []],
  ], async () => {
    const { response, payload } = await apiRequest("/api/teacher/dashboard", {
      token: authToken(4, "teacher"),
    });

    assert.equal(response.status, 200);
    assert.equal(payload.overview.totalStudents, 12);
    assert.equal(payload.overview.totalClassrooms, 5);
    assert.equal(payload.studentPerformance.length, 12);
    assert.deepEqual(payload.studentPerformance.find((student) => student.userId === 1).sections.sort(), ["Section 1", "Section 2"]);
  });
});

test("GET /api/classrooms/me preserves active fields and adds isolated pending requests", async () => {
  const studentId = 51;
  const activeJoinedAt = new Date("2026-09-01T08:00:00.000Z");
  const pendingRequestedAt = new Date("2026-10-22T08:00:00.000Z");
  const activeMembership = {
    id: 70,
    classroomId: 7,
    studentId,
    joinedAt: activeJoinedAt,
    updatedAt: new Date("2026-10-01T08:00:00.000Z"),
    classroom: {
      id: 7,
      className: "Active classroom",
      section: "A",
      schoolYear: "2026-2027",
      classCode: "ACTIVE7",
      maxStudents: 30,
      description: "Existing response field",
      teacherId: 41,
    },
  };
  const pendingMembership = {
    id: 80,
    classroomId: 8,
    studentId,
    status: "pending",
    requestedAt: pendingRequestedAt,
    classroom: {
      id: 8,
      className: "Pending classroom",
      section: "B",
      schoolYear: "2026-2027",
      classCode: "SECRET8",
      teacherId: 42,
      description: "Must not be exposed",
    },
  };
  let scenario = "pending-only";

  await withStubs([
    [User, "findByPk", async () => activeUser({ id: studentId })],
    [ClassroomMembership, "findAll", async (options) => {
      assert.equal(options.where.studentId, studentId);
      assert.equal(options.include[0].where.isActive, true);
      if (options.where.status === "active") {
        return scenario === "pending-only" ? [] : [activeMembership];
      }
      assert.equal(options.where.status, "pending");
      assert.deepEqual(options.attributes, ["id", "classroomId", "status", "requestedAt"]);
      assert.deepEqual(options.include[0].attributes, ["id", "className", "section", "schoolYear"]);
      assert.deepEqual(options.order, [["requestedAt", "DESC NULLS LAST"], ["id", "DESC"]]);
      return scenario === "active-only" ? [] : [
        scenario === "pending-only"
          ? { ...pendingMembership, requestedAt: null }
          : pendingMembership,
      ];
    }],
  ], async () => {
    const requestMe = () => apiRequest("/api/classrooms/me", {
      token: authToken(studentId, "student"),
    });

    const pendingOnly = await requestMe();
    assert.equal(pendingOnly.response.status, 200);
    assert.equal(pendingOnly.payload.hasActiveMembership, false);
    assert.equal(pendingOnly.payload.totalClassrooms, 0);
    assert.deepEqual(pendingOnly.payload.classrooms, []);
    assert.equal(pendingOnly.payload.primaryClassroom, null);
    assert.deepEqual(pendingOnly.payload.pendingRequests, [{
      classroom: {
        id: 8,
        className: "Pending classroom",
        section: "B",
        schoolYear: "2026-2027",
      },
      status: "pending",
      requestedAt: null,
    }]);

    scenario = "active-only";
    const activeOnly = await requestMe();
    assert.equal(activeOnly.response.status, 200);
    assert.equal(activeOnly.payload.hasActiveMembership, true);
    assert.equal(activeOnly.payload.totalClassrooms, 1);
    assert.equal(activeOnly.payload.classrooms[0].classCode, "ACTIVE7");
    assert.equal(activeOnly.payload.classrooms[0].description, "Existing response field");
    assert.equal(activeOnly.payload.classrooms[0].joinedAt, activeJoinedAt.toISOString());
    assert.deepEqual(activeOnly.payload.primaryClassroom, activeOnly.payload.classrooms[0]);
    assert.deepEqual(activeOnly.payload.pendingRequests, []);

    scenario = "active-plus-pending";
    const combined = await requestMe();
    assert.equal(combined.response.status, 200);
    assert.equal(combined.payload.hasActiveMembership, true);
    assert.equal(combined.payload.totalClassrooms, 1);
    assert.equal(combined.payload.pendingRequests.length, 1);
    assert.deepEqual(combined.payload.pendingRequests[0], {
      classroom: {
        id: 8,
        className: "Pending classroom",
        section: "B",
        schoolYear: "2026-2027",
      },
      status: "pending",
      requestedAt: pendingRequestedAt.toISOString(),
    });
    assert.equal("classCode" in combined.payload.pendingRequests[0].classroom, false);
    assert.equal("teacherId" in combined.payload.pendingRequests[0].classroom, false);
    assert.equal("description" in combined.payload.pendingRequests[0].classroom, false);
  });
});

test("POST /api/classrooms/join submits a pending request using the authenticated student", async () => {
  const classroom = {
    id: 9,
    className: "C# Fundamentals",
    section: "BSIT 1A",
    schoolYear: "2026-2027",
  };
  const requestedAt = new Date("2026-10-22T08:00:00.000Z");
  let serviceInput;

  await withStubs([
    [User, "findByPk", async () => activeUser()],
    [classroomJoinRequestService, "submitJoinRequest", async (input) => {
      serviceInput = input;
      return {
        changed: true,
        created: true,
        classroom: { ...classroom, classCode: "ABC234", teacherId: 4 },
        membership: {
          id: 71,
          classroomId: 9,
          studentId: 1,
          status: "pending",
          requestedAt,
          joinedAt: null,
          secret: "must-not-leak",
        },
      };
    }],
  ], async () => {
    const { response, payload } = await apiRequest("/api/classrooms/join", {
      method: "POST",
      token: authToken(1, "student"),
      body: { classCode: "abc234", studentId: 999 },
    });
    assert.equal(response.status, 201);
    assert.deepEqual(serviceInput, { classCode: "ABC234", studentId: 1 });
    assert.deepEqual(payload, {
      changed: true,
      membership: { status: "pending", requestedAt: requestedAt.toISOString() },
      classroom,
      message: "Join request submitted",
    });
  });
});

test("POST /api/classrooms/join distinguishes repeated pending and preserves its timestamp", async () => {
  const requestedAt = new Date("2026-09-01T08:00:00.000Z");
  const result = {
    changed: false,
    created: false,
    classroom: { id: 9, className: "C# Fundamentals", section: "BSIT 1A", schoolYear: "2026-2027" },
    membership: { status: "pending", requestedAt },
  };

  await withStubs([
    [User, "findByPk", async () => activeUser()],
    [classroomJoinRequestService, "submitJoinRequest", async () => result],
  ], async () => {
    const { response, payload } = await apiRequest("/api/classrooms/join", {
      method: "POST", token: authToken(1, "student"), body: { classCode: "ABC234" },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(payload, {
      changed: false,
      membership: {
        status: "pending",
        requestedAt: requestedAt.toISOString(),
      },
      classroom: {
        id: 9,
        className: "C# Fundamentals",
        section: "BSIT 1A",
        schoolYear: "2026-2027",
      },
      message: "Join request is already awaiting teacher approval",
    });
  });
});

test("POST /api/classrooms/join distinguishes an already-active membership", async () => {
  const joinedAt = new Date("2026-09-01T08:00:00.000Z");

  await withStubs([
    [User, "findByPk", async () => activeUser()],
    [classroomJoinRequestService, "submitJoinRequest", async () => ({
      changed: false,
      created: false,
      classroom: { id: 9, className: "C# Fundamentals", section: "BSIT 1A", schoolYear: "2026-2027" },
      membership: { status: "active", joinedAt, requestedAt: new Date("2026-08-01T00:00:00.000Z") },
    })],
  ], async () => {
    const { response, payload } = await apiRequest("/api/classrooms/join", {
      method: "POST", token: authToken(1, "student"), body: { classCode: "ABC234" },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(payload.membership, { status: "active", joinedAt: joinedAt.toISOString() });
    assert.equal(payload.message, "You are already an active member of this classroom");
  });
});

test("POST /api/classrooms/join maps join-request service errors", async () => {
  await withStubs([
    [User, "findByPk", async () => activeUser()],
    [classroomJoinRequestService, "submitJoinRequest", async () => {
      throw new classroomJoinRequestService.ClassroomJoinRequestError(
        404,
        "CLASSROOM_NOT_FOUND",
        "Classroom not found for this code",
      );
    }],
  ], async () => {
    const { response, payload } = await apiRequest("/api/classrooms/join", {
      method: "POST", token: authToken(1, "student"), body: { classCode: "ABC234" },
    });
    assert.equal(response.status, 404);
    assert.deepEqual(payload, {
      message: "Classroom not found for this code",
      code: "CLASSROOM_NOT_FOUND",
    });
  });
});

test("teacher direct-add activates matched students under the classroom transaction", async () => {
  const teacher = activeUser({ id: 4, role: "teacher" });
  const classroom = { id: 25, teacherId: 4, maxStudents: 2, isActive: true };
  const student = { id: 7, username: "student-seven" };
  const transaction = { LOCK: { UPDATE: "UPDATE" } };
  let created;

  await withStubs([
    [User, "findByPk", async () => teacher],
    [User, "findAll", async () => [student]],
    [Classroom, "findByPk", async () => classroom],
    [sequelize, "transaction", async (callback) => callback(transaction)],
    [ClassroomMembership, "findOne", async (options) => {
      assert.equal(options.transaction, transaction);
      return null;
    }],
    [ClassroomMembership, "count", async () => 0],
    [ClassroomMembership, "create", async (values, options) => {
      assert.equal(options.transaction, transaction);
      created = values;
      return values;
    }],
  ], async () => {
    const { response, payload } = await apiRequest("/api/teacher/classrooms/25/students", {
      method: "POST", token: authToken(4, "teacher"), body: { studentIds: [7] },
    });
    assert.equal(response.status, 200);
    assert.equal(payload.activatedCount, 1);
    assert.equal(payload.totalMatchedStudents, 1);
    assert.equal(created.studentId, 7);
    assert.equal(created.status, "active");
  });
});

test("teacher direct-add enforces capacity without changing an existing non-active row", async () => {
  const teacher = activeUser({ id: 4, role: "teacher" });
  const classroom = { id: 25, teacherId: 4, maxStudents: 1, isActive: true };
  const membership = {
    id: 2, classroomId: 25, studentId: 7, status: "removed", joinedAt: new Date("2026-09-01T00:00:00Z"),
    save: async () => assert.fail("full classroom must not reactivate the membership"),
  };
  const transaction = { LOCK: { UPDATE: "UPDATE" } };

  await withStubs([
    [User, "findByPk", async () => teacher],
    [User, "findAll", async () => [{ id: 7, username: "student-seven" }]],
    [Classroom, "findByPk", async () => classroom],
    [sequelize, "transaction", async (callback) => callback(transaction)],
    [ClassroomMembership, "findOne", async () => membership],
    [ClassroomMembership, "count", async () => 1],
  ], async () => {
    const { response, payload } = await apiRequest("/api/teacher/classrooms/25/students", {
      method: "POST", token: authToken(4, "teacher"), body: { studentIds: [7] },
    });
    assert.equal(response.status, 409);
    assert.equal(payload.message, "This classroom is already full");
    assert.equal(membership.status, "removed");
  });
});

test("teacher direct-add rejects an inactive classroom without creating a membership", async () => {
  const teacher = activeUser({ id: 4, role: "teacher" });
  const classroom = { id: 25, teacherId: 4, maxStudents: 30, isActive: false };
  const transaction = { LOCK: { UPDATE: "UPDATE" } };
  let membershipReads = 0;
  let membershipWrites = 0;

  await withStubs([
    [User, "findByPk", async () => teacher],
    [User, "findAll", async () => [{ id: 7, username: "student-seven" }]],
    [Classroom, "findByPk", async () => classroom],
    [sequelize, "transaction", async (callback) => callback(transaction)],
    [ClassroomMembership, "findOne", async () => { membershipReads += 1; return null; }],
    [ClassroomMembership, "count", async () => 0],
    [ClassroomMembership, "create", async (values) => { membershipWrites += 1; return values; }],
  ], async () => {
    const { response, payload } = await apiRequest("/api/teacher/classrooms/25/students", {
      method: "POST", token: authToken(4, "teacher"), body: { studentIds: [7] },
    });

    assert.equal(response.status, 409);
    assert.deepEqual(payload, { message: "Classroom is inactive" });
    assert.equal(membershipReads, 0);
    assert.equal(membershipWrites, 0);
  });
});

test("teacher direct-add cannot reactivate a non-active membership in an inactive classroom", async () => {
  const teacher = activeUser({ id: 4, role: "teacher" });
  const classroom = { id: 25, teacherId: 4, maxStudents: 30, isActive: false };
  const joinedAt = new Date("2026-09-01T08:00:00.000Z");
  const updatedAt = new Date("2026-10-01T08:00:00.000Z");
  const membership = {
    id: 2,
    classroomId: 25,
    studentId: 7,
    status: "removed",
    joinedAt,
    updatedAt,
    save: async () => assert.fail("inactive classroom must not reactivate the membership"),
  };
  const transaction = { LOCK: { UPDATE: "UPDATE" } };
  let membershipReads = 0;

  await withStubs([
    [User, "findByPk", async () => teacher],
    [User, "findAll", async () => [{ id: 7, username: "student-seven" }]],
    [Classroom, "findByPk", async () => classroom],
    [sequelize, "transaction", async (callback) => callback(transaction)],
    [ClassroomMembership, "findOne", async () => { membershipReads += 1; return membership; }],
    [ClassroomMembership, "count", async () => 0],
  ], async () => {
    const { response, payload } = await apiRequest("/api/teacher/classrooms/25/students", {
      method: "POST", token: authToken(4, "teacher"), body: { studentIds: [7] },
    });

    assert.equal(response.status, 409);
    assert.deepEqual(payload, { message: "Classroom is inactive" });
    assert.equal(membershipReads, 0);
    assert.equal(membership.status, "removed");
    assert.equal(membership.joinedAt, joinedAt);
    assert.equal(membership.updatedAt, updatedAt);
  });
});

test("teacher direct-add rejects an inactive batch before any partial membership writes", async () => {
  const teacher = activeUser({ id: 4, role: "teacher" });
  const classroom = { id: 25, teacherId: 4, maxStudents: 30, isActive: false };
  const transaction = { LOCK: { UPDATE: "UPDATE" } };
  const createdStudentIds = [];

  await withStubs([
    [User, "findByPk", async () => teacher],
    [User, "findAll", async () => [
      { id: 7, username: "student-seven" },
      { id: 8, username: "student-eight" },
    ]],
    [Classroom, "findByPk", async () => classroom],
    [sequelize, "transaction", async (callback) => callback(transaction)],
    [ClassroomMembership, "findOne", async () => null],
    [ClassroomMembership, "count", async () => 0],
    [ClassroomMembership, "create", async (values) => {
      createdStudentIds.push(values.studentId);
      return values;
    }],
  ], async () => {
    const { response, payload } = await apiRequest("/api/teacher/classrooms/25/students", {
      method: "POST", token: authToken(4, "teacher"), body: { studentIds: [7, 8] },
    });

    assert.equal(response.status, 409);
    assert.deepEqual(payload, { message: "Classroom is inactive" });
    assert.deepEqual(createdStudentIds, []);
  });
});

test("teacher direct-add rechecks locked ownership before inactive state or membership data", async () => {
  const teacher = activeUser({ id: 4, role: "teacher" });
  const initiallyOwned = { id: 25, teacherId: 4, maxStudents: 30, isActive: true };
  const lockedForeign = { id: 25, teacherId: 99, maxStudents: 30, isActive: false };
  const transaction = { LOCK: { UPDATE: "UPDATE" } };
  let classroomReads = 0;
  let membershipReads = 0;

  await withStubs([
    [User, "findByPk", async () => teacher],
    [User, "findAll", async () => [{ id: 7, username: "student-seven" }]],
    [Classroom, "findByPk", async () => {
      classroomReads += 1;
      return classroomReads === 1 ? initiallyOwned : lockedForeign;
    }],
    [sequelize, "transaction", async (callback) => callback(transaction)],
    [ClassroomMembership, "findOne", async () => { membershipReads += 1; return null; }],
  ], async () => {
    const { response, payload } = await apiRequest("/api/teacher/classrooms/25/students", {
      method: "POST", token: authToken(4, "teacher"), body: { studentIds: [7] },
    });

    assert.equal(response.status, 403);
    assert.deepEqual(payload, { message: "You are not allowed to update this classroom" });
    assert.equal(membershipReads, 0);
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
    xpAwarded: 0,
    xpAwardedAt: null,
    startedAt: new Date(),
    save: async () => assert.fail("invalid completion must not be saved"),
  };
  const membership = { id: 1, classroomId: 9, studentId: 1, status: "active" };

  await withStubs([
    ...completionInterruptionStubs(),
    [LessonAssessment, "findAll", async () => []],
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

test("PUT /api/progress strictly rejects malformed or oversized interruption batches before mutation", async () => {
  const membership = { id: 1, classroomId: 9, studentId: 1, status: "active" };
  let progressReads = 0;
  await withStubs([
    [User, "findByPk", async () => activeUser()],
    [ClassroomMembership, "findOne", async () => membership],
    [UserProgress, "findAll", async () => { progressReads += 1; return []; }],
    [UserProgress, "bulkCreate", async () => assert.fail("invalid batches must not create progress")],
  ], async () => {
    const token = authToken(1, "student");
    const cases = [
      {},
      [{ sessionId: 1, eventKey: "pending_event_001", eventType: "hidden", timestamp: 1 }],
      Array.from({ length: 101 }, (_, index) => ({
        sessionId: 1,
        eventKey: `pending_${String(index).padStart(3, "0")}`,
        eventType: "hidden",
      })),
    ];
    for (const interruptionEvents of cases) {
      const { response, payload } = await apiRequest(
        "/api/progress/level/tutorial-level-1?classroomId=9",
        {
          method: "PUT",
          token,
          body: {
            progressPercent: 100,
            isCompleted: true,
            sourceCode: "int steps = 3;",
            activityId: "completion_action_123",
            interruptionEvents,
          },
        },
      );
      assert.equal(response.status, 400);
      assert.deepEqual(payload, {
        code: "INVALID_PENDING_EVENTS",
        message: "Invalid pending interruption events",
      });
    }
  });
  assert.equal(progressReads, 0);
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
    xpAwarded: 0,
    xpAwardedAt: null,
    startedAt: new Date(Date.now() - 60_000),
    save: async () => undefined,
  };
  const membership = { id: 1, classroomId: 9, studentId: 1, status: "active" };

  await withStubs([
    ...completionInterruptionStubs(),
    [LessonAssessment, "findAll", async () => []],
    [User, "findByPk", async () => user],
    [User, "findAll", async () => []],
    [ClassroomMembership, "findOne", async () => membership],
    [ClassroomMembership, "findAll", async () => []],
    [UserProgress, "findAll", async () => [progressRow]],
    [UserProgress, "bulkCreate", async () => []],
    [UserProgress, "findOne", async () => progressRow],
    [LevelContentOverride, "findAll", async () => []],
    [LevelDeadline, "findOne", async () => null],
    [LearningAnalyticsEvent, "create", async (values) => values],
    [sequelize, "transaction", transactionStub],
    [XpTransaction, "findOne", async () => null],
    [XpTransaction, "findAll", async () => []],
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
          activityId: "valid_completion_123",
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

test("failed solution retries create one sanitized event and increment academic attempts once", async () => {
  const user = activeUser({ xpTotal: 40 });
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
    xpAwarded: 0,
    xpAwardedAt: null,
    startedAt: new Date("2026-09-21T00:00:00Z"),
    hintUsed: false,
    detailedHintUnlocked: false,
    save: async () => undefined,
  };
  const membership = { id: 1, classroomId: 9, studentId: 1, status: "active" };
  const events = [];
  const wrongSource = `using System;
class Program {
  static void WalkToPortal(int distanceInSteps) {}
  static void Main(string[] args) {
    int steps = 0;
    WalkToPortal(steps);
  }
}`;

  await withStubs([
    ...completionInterruptionStubs(),
    [LessonAssessment, "findAll", async () => []],
    [User, "findByPk", async () => user],
    [User, "findAll", async () => []],
    [ClassroomMembership, "findOne", async () => membership],
    [ClassroomMembership, "findAll", async () => []],
    [UserProgress, "findAll", async () => [progressRow]],
    [UserProgress, "bulkCreate", async () => []],
    [UserProgress, "findOne", async () => progressRow],
    [LevelContentOverride, "findAll", async () => []],
    [LevelDeadline, "findOne", async () => null],
    [LearningAnalyticsEvent, "findOne", async ({ where }) => (
      events.find((event) => event.dedupeKey === where.dedupeKey) ?? null
    )],
    [LearningAnalyticsEvent, "create", async (values) => {
      const event = { ...values };
      events.push(event);
      return event;
    }],
    [sequelize, "transaction", transactionStub],
    [XpTransaction, "findOne", async () => null],
    [XpTransaction, "findAll", async () => []],
    [XpTransaction, "create", async (values) => values],
  ], async () => {
    const body = { sourceCode: wrongSource, activityId: "attempt_action_123" };
    const first = await apiRequest("/api/progress/level/tutorial-level-1/attempt", {
      method: "POST", token: authToken(1, "student"), body,
    });
    const retry = await apiRequest("/api/progress/level/tutorial-level-1/attempt", {
      method: "POST", token: authToken(1, "student"), body,
    });
    const completion = await apiRequest("/api/progress/level/tutorial-level-1", {
      method: "PUT",
      token: authToken(1, "student"),
      body: {
        progressPercent: 100,
        isCompleted: true,
        sourceCode: "int steps = 3;",
        activityId: "completion_after_failure_123",
      },
    });

    assert.equal(first.response.status, 200);
    assert.equal(first.payload.attemptRecorded, true);
    assert.equal(retry.response.status, 200);
    assert.equal(retry.payload.attemptRecorded, false);
    assert.equal(completion.response.status, 200);
    assert.equal(progressRow.attemptCount, 1);
    assert.equal(events.length, 2);
    assert.deepEqual({
      classroomId: events[0].classroomId,
      eventType: events[0].eventType,
      attemptNumber: events[0].attemptNumber,
      failureCategory: events[0].failureCategory,
    }, {
      classroomId: 9,
      eventType: "solution_attempt_failed",
      attemptNumber: 1,
      failureCategory: "wrong_logic",
    });
    assert.equal(events[0].sourceCode, undefined);
    assert.equal(events[0].stderr, undefined);
    assert.equal(events[0].metadata, undefined);
    assert.deepEqual(events.map((event) => [event.eventType, event.attemptNumber]), [
      ["solution_attempt_failed", 1],
      ["level_completed", 2],
    ]);
    assert.equal(events[1].score, 95);
    assert.ok(events.every((event) => event.occurredAt instanceof Date));
    assert.ok(events[0].occurredAt <= events[1].occurredAt);
    assert.equal(events[1].sourceCode, undefined);
  });
});

test("first-submission completion records one successful academic attempt and replay records none", async () => {
  const user = activeUser();
  const writeTransactions = {};
  let transactionSequence = 0;
  let progressSaveCount = 0;
  user.save = async (options = {}) => { writeTransactions.user = options.transaction; };
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
    xpAwarded: 0,
    xpAwardedAt: null,
    startedAt: new Date("2026-09-21T00:00:00Z"),
    activeSessionId: null,
    hintUsed: false,
    save: async (options = {}) => {
      progressSaveCount += 1;
      if (progressRow.isCompleted) writeTransactions.progress = options.transaction;
    },
  };
  const membership = { id: 1, classroomId: 9, studentId: 1, status: "active" };
  const events = [];
  const xpLedgers = [];

  await withStubs([
    ...completionInterruptionStubs(),
    [LessonAssessment, "findAll", async () => []],
    [User, "findByPk", async () => user],
    [User, "findAll", async () => []],
    [ClassroomMembership, "findOne", async () => membership],
    [ClassroomMembership, "findAll", async () => []],
    [UserProgress, "findAll", async () => [progressRow]],
    [UserProgress, "bulkCreate", async () => []],
    [UserProgress, "findOne", async () => progressRow],
    [LevelContentOverride, "findAll", async () => []],
    [LevelDeadline, "findOne", async () => null],
    [LearningAnalyticsEvent, "findOne", async ({ where }) => (
      events.find((event) => event.dedupeKey === where.dedupeKey) ?? null
    )],
    [LearningAnalyticsEvent, "create", async (values, options = {}) => {
      const event = { ...values };
      events.push(event);
      if (values.eventType === "level_completed") writeTransactions.event = options.transaction;
      return event;
    }],
    [sequelize, "transaction", async (optionsOrCallback, maybeCallback) => {
      const callback = typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback;
      return callback({
        id: `transaction-${++transactionSequence}`,
        LOCK: { UPDATE: "UPDATE" },
        ...(typeof optionsOrCallback === "object" ? { parent: optionsOrCallback.transaction } : {}),
      });
    }],
    [XpTransaction, "findOne", async () => null],
    [XpTransaction, "findAll", async () => xpLedgers],
    [XpTransaction, "create", async (value, options = {}) => {
      writeTransactions.xp = options.transaction;
      const ledger = { id: xpLedgers.length + 1, ...value };
      xpLedgers.push(ledger);
      return ledger;
    }],
  ], async () => {
    const first = await apiRequest("/api/progress/level/tutorial-level-1", {
      method: "PUT",
      token: authToken(1, "student"),
      body: {
        progressPercent: 100,
        isCompleted: true,
        sourceCode: "int steps = 3;",
        activityId: "completion_action_123",
      },
    });
    const writesAfterFirst = {
      progress: progressSaveCount,
      analytics: events.length,
      xp: xpLedgers.length,
      totalXp: user.xpTotal,
    };
    progressRow.finalScore = 99;
    const contradictoryReplay = await apiRequest("/api/progress/level/tutorial-level-1", {
      method: "PUT",
      token: authToken(1, "student"),
      body: {
        progressPercent: 100,
        isCompleted: true,
        sourceCode: "int steps = 3;",
        activityId: "completion_action_conflict",
      },
    });
    assert.equal(contradictoryReplay.response.status, 409);
    assert.deepEqual(contradictoryReplay.payload, {
      code: "COMPLETION_INTEGRITY_ERROR",
      message: "Completion record could not be verified",
    });
    assert.deepEqual({
      progress: progressSaveCount,
      analytics: events.length,
      xp: xpLedgers.length,
      totalXp: user.xpTotal,
    }, writesAfterFirst);
    progressRow.finalScore = 100;
    const demotion = await apiRequest("/api/progress/level/tutorial-level-1", {
      method: "PUT",
      token: authToken(1, "student"),
      body: {
        progressPercent: 0,
        isCompleted: false,
      },
    });
    const replay = await apiRequest("/api/progress/level/tutorial-level-1", {
      method: "PUT",
      token: authToken(1, "student"),
      body: {
        progressPercent: 100,
        isCompleted: true,
        sourceCode: "int steps = 3;",
        activityId: "completion_action_456",
      },
    });

    assert.equal(first.response.status, 200);
    assert.equal(demotion.response.status, 200);
    assert.equal(replay.response.status, 200);
    assert.equal(replay.payload.xpAward.awarded, false);
    assert.equal(replay.payload.xpAward.amount, 0);
    assert.equal(replay.payload.xpAward.originalAmount, 35);
    assert.deepEqual(replay.payload.completionDeductions, {
      policyVersion: "game-interruption-deduction/v1",
      classroomId: 9,
      levelKey: "tutorial-level-1",
      eventCount: 0,
      score: { base: 100, deducted: 0, final: 100 },
      xp: { gross: 35, deducted: 0, net: 35 },
    });
    assert.equal(events.length, 1);
    assert.deepEqual({
      classroomId: events[0].classroomId,
      eventType: events[0].eventType,
      attemptNumber: events[0].attemptNumber,
      score: events[0].score,
    }, {
      classroomId: 9,
      eventType: "level_completed",
      attemptNumber: 1,
      score: 100,
    });
    assert.equal(events[0].occurredAt.getTime(), progressRow.completedAt.getTime());
    assert.equal(progressRow.isCompleted, true);
    assert.equal(progressRow.progressPercent, 100);
    assert.equal(progressRow.finalScore, 100);
    assert.ok(writeTransactions.progress, "completion progress must be transactional");
    assert.equal(writeTransactions.event, writeTransactions.progress);
    assert.equal(writeTransactions.xp.parent, writeTransactions.progress);
    assert.equal(writeTransactions.user, writeTransactions.progress);
  });
});

test("completed Arrays work remains immutable while required PRE blocks same-lesson replay and new work", async () => {
  const user = activeUser({ xpTotal: 125 });
  const membership = { id: 1, classroomId: 9, studentId: 1, status: "active" };
  const completedAt = new Date("2026-09-20T00:00:00Z");
  const xpAwardedAt = new Date("2026-09-20T00:00:01Z");
  let progressSaveCount = 0;
  const rows = DEFAULT_LEVEL_PROGRESS.map((level, index) => ({
    ...level,
    id: index + 1,
    userId: 1,
    progressPercent: level.levelKey.startsWith("tutorial-") ? 100 : 0,
    isCompleted: level.levelKey.startsWith("tutorial-"),
    completedAt: level.levelKey.startsWith("tutorial-") ? completedAt : null,
    attemptCount: 0,
    timeSpentSeconds: 0,
    finalScore: null,
    startedAt: null,
    activeSessionId: null,
    hintUsed: false,
    xpAwarded: 0,
    xpAwardedAt: null,
    save: async () => { progressSaveCount += 1; },
  }));
  const completedArrays = rows.find((row) => row.levelKey === "arrays-level-1");
  Object.assign(completedArrays, {
    progressPercent: 100,
    isCompleted: true,
    completedAt,
    attemptCount: 2,
    timeSpentSeconds: 73,
    finalScore: 91,
    startedAt: new Date("2026-09-19T00:00:00Z"),
    xpAwarded: 25,
    xpAwardedAt,
  });
  const requiredPre = {
    id: 81,
    classroomId: 9,
    lessonKey: "arrays",
    type: "PRE",
    isPublished: true,
    isRequired: true,
    maxAttempts: 1,
    requirePassingForCompletion: false,
  };
  const before = {
    progressPercent: completedArrays.progressPercent,
    isCompleted: completedArrays.isCompleted,
    completedAt: completedArrays.completedAt,
    attemptCount: completedArrays.attemptCount,
    timeSpentSeconds: completedArrays.timeSpentSeconds,
    finalScore: completedArrays.finalScore,
    xpAwarded: completedArrays.xpAwarded,
    xpAwardedAt: completedArrays.xpAwardedAt,
    xpTotal: user.xpTotal,
  };
  let assessmentAttemptCreates = 0;

  await withStubs([
    ...completionInterruptionStubs(),
    [User, "findByPk", async () => user],
    [User, "findAll", async () => []],
    [ClassroomMembership, "findOne", async () => membership],
    [ClassroomMembership, "findAll", async () => []],
    [UserProgress, "findAll", async () => rows],
    [UserProgress, "bulkCreate", async () => assert.fail("all default rows already exist")],
    [UserProgress, "findOne", async ({ where }) => (
      rows.find((row) => row.levelKey === where.levelKey) ?? null
    )],
    [LevelContentOverride, "findAll", async () => []],
    [LessonAssessment, "findAll", async () => [{ ...requiredPre, attemptGrants: [] }]],
    [AssessmentAttempt, "findAll", async () => []],
    [AssessmentAttemptGrant, "findAll", async () => {
      assert.fail("progression loading must not issue a standalone grant query");
    }],
    [AssessmentAttempt, "create", async () => {
      assessmentAttemptCreates += 1;
      return null;
    }],
    [LearningAnalyticsEvent, "create", async () => (
      assert.fail("completed replay must not create a completion event")
    )],
    [sequelize, "transaction", async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } })],
    [XpTransaction, "findOne", async () => assert.fail("completed replay must not inspect XP awards")],
    [XpTransaction, "create", async () => assert.fail("completed replay must not award XP")],
  ], async () => {
    const startReplay = await apiRequest("/api/progress/level/arrays-level-1/start", {
      method: "POST",
      token: authToken(1, "student"),
      body: { sessionId: "arrays_replay_session_123" },
    });
    const completionReplay = await apiRequest("/api/progress/level/arrays-level-1", {
      method: "PUT",
      token: authToken(1, "student"),
      body: {
        progressPercent: 100,
        isCompleted: true,
        sourceCode: "int[] values = { 1, 2, 3 };",
        activityId: "arrays_replay_completion_123",
      },
    });
    const laterArrays = await apiRequest("/api/progress/level/arrays-level-2/start", {
      method: "POST",
      token: authToken(1, "student"),
      body: { sessionId: "arrays_later_session_123" },
    });
    const laterLesson = await apiRequest("/api/progress/level/functions-level-1/start", {
      method: "POST",
      token: authToken(1, "student"),
      body: { sessionId: "functions_session_123" },
    });

    const expectedPreRestriction = {
      code: "PRE_ASSESSMENT_REQUIRED",
      effectiveDueAt: null,
      message: "Complete the required pre-test before opening this lesson.",
      lessonKey: "arrays",
      assessmentRequired: true,
      assessmentType: "PRE",
      assessmentId: 81,
      assessmentAction: "TAKE_PRE",
    };
    for (const result of [startReplay, completionReplay, laterArrays]) {
      assert.equal(result.response.status, 403);
      assert.deepEqual(result.payload, expectedPreRestriction);
    }
    assert.equal(laterLesson.response.status, 403);
    assert.equal(laterLesson.payload.code, "LESSON_PREREQUISITE_REQUIRED");
    assert.equal(laterLesson.payload.lessonKey, "functions");
    assert.equal(laterLesson.payload.prerequisiteLessonKey, "arrays");
    assert.equal(laterLesson.payload.nextAction, "COMPLETE_PREREQUISITE_LESSON");
  });

  assert.deepEqual({
    progressPercent: completedArrays.progressPercent,
    isCompleted: completedArrays.isCompleted,
    completedAt: completedArrays.completedAt,
    attemptCount: completedArrays.attemptCount,
    timeSpentSeconds: completedArrays.timeSpentSeconds,
    finalScore: completedArrays.finalScore,
    xpAwarded: completedArrays.xpAwarded,
    xpAwardedAt: completedArrays.xpAwardedAt,
    xpTotal: user.xpTotal,
  }, before);
  assert.equal(progressSaveCount, 0);
  assert.equal(assessmentAttemptCreates, 0);
});

test("grant-authorized POST practice rechecks every gameplay path without academic mutations", async () => {
  const user = activeUser({ xpTotal: 125 });
  const membership = { id: 1, classroomId: 9, studentId: 1, status: "active" };
  const completedAt = new Date("2026-09-20T00:00:00Z");
  let progressSaveCount = 0;
  const rows = DEFAULT_LEVEL_PROGRESS.map((level, index) => ({
    ...level,
    id: index + 1,
    userId: 1,
    progressPercent: /^(tutorial|arrays)-/.test(level.levelKey) ? 100 : 0,
    isCompleted: /^(tutorial|arrays)-/.test(level.levelKey),
    completedAt: /^(tutorial|arrays)-/.test(level.levelKey) ? completedAt : null,
    attemptCount: 2,
    timeSpentSeconds: 73,
    finalScore: 91,
    startedAt: new Date("2026-09-19T00:00:00Z"),
    activeSessionId: null,
    hintUsed: false,
    detailedHintUnlocked: false,
    xpAwarded: 25,
    xpAwardedAt: new Date("2026-09-20T00:00:01Z"),
    save: async () => { progressSaveCount += 1; },
  }));
  const target = rows.find((row) => row.levelKey === "arrays-level-1");
  const requiredPost = {
    id: 92, classroomId: 9, lessonKey: "arrays", type: "POST",
    isPublished: true, isRequired: true, maxAttempts: 2,
    requirePassingForCompletion: true,
  };
  const attempts = [
    {
      id: 201, classroomId: 9, studentId: 1, assessmentId: 92,
      status: "SUBMITTED", submittedAt: "2026-09-21T00:00:00Z",
      attemptNumber: 1, percentage: 40, passed: false,
    },
    {
      id: 202, classroomId: 9, studentId: 1, assessmentId: 92,
      status: "SUBMITTED", submittedAt: "2026-09-22T00:00:00Z",
      attemptNumber: 2, percentage: 50, passed: false,
    },
  ];
  const grant = {
    id: 301, classroomId: 9, studentId: 1, assessmentId: 92,
    consumedByAttemptId: null,
  };
  const before = {
    progressPercent: target.progressPercent,
    isCompleted: target.isCompleted,
    completedAt: target.completedAt,
    attemptCount: target.attemptCount,
    timeSpentSeconds: target.timeSpentSeconds,
    finalScore: target.finalScore,
    xpAwarded: target.xpAwarded,
    xpAwardedAt: target.xpAwardedAt,
    xpTotal: user.xpTotal,
  };

  await withStubs([
    ...completionInterruptionStubs(),
    [User, "findByPk", async () => user],
    [User, "findAll", async () => []],
    [ClassroomMembership, "findOne", async () => membership],
    [ClassroomMembership, "findAll", async () => []],
    [UserProgress, "findAll", async () => rows],
    [UserProgress, "bulkCreate", async () => assert.fail("all default rows already exist")],
    [UserProgress, "findOne", async ({ where }) => (
      rows.find((row) => row.levelKey === where.levelKey) ?? null
    )],
    [LevelContentOverride, "findAll", async () => []],
    [LessonAssessment, "findAll", async () => [{ ...requiredPost, attemptGrants: [grant] }]],
    [AssessmentAttempt, "findAll", async () => attempts],
    [AssessmentAttemptGrant, "findAll", async () => {
      assert.fail("progression loading must not issue a standalone grant query");
    }],
    [LearningAnalyticsEvent, "findOne", async () => null],
    [LearningAnalyticsEvent, "create", async () => (
      assert.fail("practice must not create an academic event")
    )],
    [XpTransaction, "findOne", async () => assert.fail("practice must not inspect XP awards")],
    [XpTransaction, "create", async () => assert.fail("practice must not award XP")],
    [sequelize, "transaction", async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } })],
  ], async () => {
    const token = authToken(1, "student");
    const path = "/api/progress/level/arrays-level-1";
    const openResults = [
      await apiRequest(`${path}/content?classroomId=9`, { token }),
      await apiRequest(`${path}/start?classroomId=9`, {
        method: "POST", token, body: { sessionId: "remediation_practice_start_123" },
      }),
      await apiRequest(`${path}/attempt?classroomId=9`, {
        method: "POST", token, body: { sourceCode: "", activityId: "remediation_attempt_123" },
      }),
      await apiRequest(`${path}?classroomId=9`, {
        method: "PUT", token, body: { progressPercent: 100, isCompleted: true },
      }),
    ];
    assert.deepEqual(openResults.map((result) => result.response.status), [200, 200, 200, 200]);
    assert.equal(openResults[1].payload.ephemeral, true);
    assert.equal(openResults[2].payload.replay, true);
    assert.equal(openResults[2].payload.attemptRecorded, false);

    for (const suffix of ["hint-use", "detailed-hint-purchase"]) {
      const result = await apiRequest(`${path}/${suffix}?classroomId=9`, {
        method: "POST", token, body: {},
      });
      assert.equal(result.response.status, 409, suffix);
      assert.equal(result.payload.code, "LEVEL_ALREADY_COMPLETED", suffix);
    }

    grant.consumedByAttemptId = 203;
    attempts.push({
      id: 203, classroomId: 9, studentId: 1, assessmentId: 92,
      status: "SUBMITTED", submittedAt: "2026-09-23T00:00:00Z",
      attemptNumber: 3, percentage: 45, passed: false,
    });
    const closedRequests = [
      [`${path}/content?classroomId=9`, {}],
      [`${path}/start?classroomId=9`, { method: "POST", body: { sessionId: "closed_start_123" } }],
      [`${path}/attempt?classroomId=9`, { method: "POST", body: { sourceCode: "", activityId: "closed_attempt_123" } }],
      [`${path}?classroomId=9`, { method: "PUT", body: { progressPercent: 100, isCompleted: true } }],
      [`${path}/hint-use?classroomId=9`, { method: "POST", body: {} }],
      [`${path}/detailed-hint-purchase?classroomId=9`, { method: "POST", body: {} }],
    ];
    for (const [requestPath, options] of closedRequests) {
      const result = await apiRequest(requestPath, { ...options, token });
      assert.equal(result.response.status, 403, requestPath);
      assert.equal(result.payload.code, "POST_ASSESSMENT_REQUIRED", requestPath);
    }
  });

  assert.deepEqual({
    progressPercent: target.progressPercent,
    isCompleted: target.isCompleted,
    completedAt: target.completedAt,
    attemptCount: target.attemptCount,
    timeSpentSeconds: target.timeSpentSeconds,
    finalScore: target.finalScore,
    xpAwarded: target.xpAwarded,
    xpAwardedAt: target.xpAwardedAt,
    xpTotal: user.xpTotal,
  }, before);
  assert.equal(progressSaveCount, 0);
  assert.equal(grant.consumedByAttemptId, 203, "practice does not consume or relink the grant");
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
  const events = [];

  await withStubs([
    [LessonAssessment, "findAll", async () => []],
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
    [LearningAnalyticsEvent, "findOne", async ({ where }) => (
      events.find((event) => event.dedupeKey === where.dedupeKey) ?? null
    )],
    [LearningAnalyticsEvent, "create", async (values) => {
      events.push({ ...values });
      return values;
    }],
    [sequelize, "transaction", async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } })],
    [XpTransaction, "create", async (values) => values],
    [HintFeedback, "upsert", async (values) => [{ ...values }, true]],
  ], async () => {
    const wrongSource = `using System;
class Program {
  static void WalkToPortal(int distanceInSteps) {}
  static void Main(string[] args) {
    int steps = 0;
    WalkToPortal(steps);
  }
}`;
    for (let expected = 1; expected <= 3; expected += 1) {
      const { response, payload } = await apiRequest(
        "/api/progress/level/tutorial-level-1/attempt",
        {
          method: "POST",
          token: authToken(1, "student"),
          body: { sourceCode: wrongSource, activityId: `hint_attempt_${expected}` },
        },
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
    const hintRetryResponse = await apiRequest(
      "/api/progress/level/tutorial-level-1/hint-use",
      { method: "POST", token: authToken(1, "student"), body: {} },
    );
    assert.equal(hintRetryResponse.response.status, 200);
    assert.equal(events.filter((event) => (
      event.eventType === "hint_used" && event.hintType === "basic"
    )).length, 1);

    const purchaseResponse = await apiRequest(
      "/api/progress/level/tutorial-level-1/detailed-hint-purchase",
      { method: "POST", token: authToken(1, "student"), body: { xpCost: 1 } },
    );
    assert.equal(purchaseResponse.response.status, 200);
    assert.equal(purchaseResponse.payload.purchased, true);
    assert.equal(purchaseResponse.payload.detailedHintXpCost, 30);
    assert.equal(purchaseResponse.payload.currentXp, 10);
    assert.ok(purchaseResponse.payload.personalizedHint.includes("steps"));
    assert.equal(purchaseResponse.payload.hintStage, "personalized");

    const retryResponse = await apiRequest(
      "/api/progress/level/tutorial-level-1/detailed-hint-purchase",
      { method: "POST", token: authToken(1, "student"), body: {} },
    );
    assert.equal(retryResponse.response.status, 200);
    assert.equal(retryResponse.payload.purchased, false);
    assert.equal(retryResponse.payload.currentXp, 10);

    const changedMistakeSource = `using System;
class Program {
  static void WalkToPortal(int distanceInSteps) {}
  static void Main(string[] args) {
    string steps = "three";
    WalkToPortal(steps);
  }
}`;
    const continuedFailure = await apiRequest(
      "/api/progress/level/tutorial-level-1/attempt",
      {
        method: "POST",
        token: authToken(1, "student"),
        body: { sourceCode: changedMistakeSource, activityId: "hint_attempt_changed" },
      },
    );
    assert.equal(continuedFailure.payload.hintStage, "stronger");
    assert.equal(continuedFailure.payload.currentXp, 10);
    assert.notEqual(continuedFailure.payload.failureCode, purchaseResponse.payload.failureCode);
    assert.notEqual(continuedFailure.payload.personalizedHint, purchaseResponse.payload.personalizedHint);

    const feedbackResponse = await apiRequest(
      "/api/progress/level/tutorial-level-1/hint-feedback",
      { method: "POST", token: authToken(1, "student"), body: { helpful: true } },
    );
    assert.equal(feedbackResponse.response.status, 200);
    assert.equal(feedbackResponse.payload.hintStage, "stronger");
    assert.equal(feedbackResponse.payload.helpful, true);
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
    [LessonAssessment, "findAll", async () => []],
    [User, "findByPk", async () => user],
    [ClassroomMembership, "findOne", async () => membership],
    [UserProgress, "findAll", async () => [progressRow]],
    [UserProgress, "bulkCreate", async () => []],
    [UserProgress, "findOne", async () => progressRow],
    [LevelContentOverride, "findAll", async () => [setting]],
    [LearningAnalyticsEvent, "findOne", async () => null],
    [LearningAnalyticsEvent, "create", async (values) => values],
    [sequelize, "transaction", async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } })],
  ], async () => {
    for (const threshold of [1, 5]) {
      setting.hintUnlockThreshold = threshold;
      progressRow.attemptCount = 0;

      for (let expected = 1; expected <= threshold; expected += 1) {
        const attempt = await apiRequest(
          "/api/progress/level/tutorial-level-1/attempt",
          {
            method: "POST",
            token: authToken(1, "student"),
            body: { activityId: `threshold_${threshold}_attempt_${expected}` },
          },
        );
        assert.equal(attempt.response.status, 200);
        assert.equal(attempt.payload.hintUnlocked, expected === threshold);
        assert.equal(attempt.payload.attemptsRemaining, threshold - expected);
        assert.equal(attempt.payload.basicHint === null, expected < threshold);
      }

      const refreshed = await apiRequest(
        "/api/progress/level/tutorial-level-1/start",
        {
          method: "POST",
          token: authToken(1, "student"),
          body: { sessionId: `refresh_threshold_${threshold}` },
        },
      );
      assert.equal(refreshed.response.status, 200);
      assert.equal(refreshed.payload.hintUnlockThreshold, threshold);
      assert.equal(refreshed.payload.hintUnlocked, true);
      assert.ok(refreshed.payload.basicHint.includes("portal method"));
      assert.equal(refreshed.payload.detailedHint, null);
    }

    progressRow.attemptCount = 5;
    progressRow.detailedHintUnlocked = true;
    progressRow.detailedHintXpCost = 15;
    const ownedHint = await apiRequest(
      "/api/progress/level/tutorial-level-1/start",
      {
        method: "POST",
        token: authToken(1, "student"),
        body: { sessionId: "return_to_owned_hint" },
      },
    );
    assert.equal(ownedHint.response.status, 200);
    assert.equal(ownedHint.payload.detailedHintUnlocked, true);
    assert.equal(ownedHint.payload.detailedHintXpCost, 15);
    const ownedRetry = await apiRequest(
      "/api/progress/level/tutorial-level-1/detailed-hint-purchase",
      { method: "POST", token: authToken(1, "student"), body: {} },
    );
    assert.equal(ownedRetry.response.status, 200);
    assert.equal(ownedRetry.payload.purchased, false);
    assert.equal(ownedRetry.payload.currentXp, 40);
    assert.equal(ownedRetry.payload.detailedHintXpCost, 15);
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
    [LessonAssessment, "findAll", async () => []],
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
      {
        method: "POST",
        token: authToken(1, "student"),
        body: { sessionId: "disabled_hint_refresh_123" },
      },
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

test("completed-level replay cannot mutate or record either hint tier", async () => {
  const user = activeUser({ xpTotal: 40 });
  const progressRow = {
    userId: 1,
    levelKey: "tutorial-level-1",
    attemptCount: 5,
    isCompleted: true,
    hintUsed: false,
    detailedHintUnlocked: false,
    startedAt: new Date(),
    save: async () => assert.fail("completed replay must not save hint state"),
  };
  const membership = { id: 1, classroomId: 9, studentId: 1, status: "active" };
  const setting = {
    levelKey: "tutorial-level-1",
    hintsEnabled: true,
    hintUnlockThreshold: 3,
    isEnabled: true,
    displayOrder: 1,
  };
  const events = [];
  const xpTransactions = [];

  await withStubs([
    [LessonAssessment, "findAll", async () => []],
    [User, "findByPk", async () => user],
    [ClassroomMembership, "findOne", async () => membership],
    [UserProgress, "findAll", async () => [progressRow]],
    [UserProgress, "bulkCreate", async () => []],
    [UserProgress, "findOne", async () => progressRow],
    [LevelContentOverride, "findAll", async () => [setting]],
    [LearningAnalyticsEvent, "create", async (values) => { events.push(values); return values; }],
    [XpTransaction, "create", async (values) => { xpTransactions.push(values); return values; }],
    [sequelize, "transaction", async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } })],
  ], async () => {
    const basic = await apiRequest(
      "/api/progress/level/tutorial-level-1/hint-use",
      { method: "POST", token: authToken(1, "student"), body: {} },
    );
    assert.equal(basic.response.status, 409);
    assert.equal(basic.payload.code, "LEVEL_ALREADY_COMPLETED");

    const detailed = await apiRequest(
      "/api/progress/level/tutorial-level-1/detailed-hint-purchase",
      { method: "POST", token: authToken(1, "student"), body: {} },
    );
    assert.equal(detailed.response.status, 409);
    assert.equal(detailed.payload.code, "LEVEL_ALREADY_COMPLETED");
  });

  assert.equal(progressRow.hintUsed, false);
  assert.equal(progressRow.detailedHintUnlocked, false);
  assert.equal(user.xpTotal, 40);
  assert.deepEqual(events, []);
  assert.deepEqual(xpTransactions, []);
});

test("detailed hint authorization and event attribution reuse one gameplay membership", async () => {
  const user = activeUser({ xpTotal: 40 });
  const progressRow = {
    userId: 1,
    levelKey: "tutorial-level-1",
    attemptCount: 3,
    isCompleted: false,
    hintUsed: false,
    detailedHintUnlocked: false,
    save: async () => undefined,
  };
  const memberships = [
    { id: 1, classroomId: 9, studentId: 1, status: "active" },
    { id: 2, classroomId: 10, studentId: 1, status: "active" },
  ];
  const events = [];
  const settingsClassroomIds = [];
  let gameplayMembershipReads = 0;

  await withStubs([
    [LessonAssessment, "findAll", async () => []],
    [User, "findByPk", async () => user],
    [ClassroomMembership, "findOne", async (options) => {
      if (options?.attributes?.length === 1 && options.attributes[0] === "id") {
        return { id: 99 };
      }
      const membership = memberships[Math.min(gameplayMembershipReads, memberships.length - 1)];
      gameplayMembershipReads += 1;
      return membership;
    }],
    [UserProgress, "findAll", async () => [progressRow]],
    [UserProgress, "bulkCreate", async () => []],
    [UserProgress, "findOne", async () => progressRow],
    [LevelContentOverride, "findAll", async ({ where }) => {
      settingsClassroomIds.push(where.classroomId);
      return [{
        levelKey: "tutorial-level-1",
        hintsEnabled: true,
        hintUnlockThreshold: 3,
        isEnabled: true,
        displayOrder: 1,
      }];
    }],
    [LearningAnalyticsEvent, "create", async (values) => { events.push(values); return values; }],
    [XpTransaction, "create", async (values) => values],
    [sequelize, "transaction", async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } })],
  ], async () => {
    const detailed = await apiRequest(
      "/api/progress/level/tutorial-level-1/detailed-hint-purchase",
      { method: "POST", token: authToken(1, "student"), body: {} },
    );
    assert.equal(detailed.response.status, 200);
  });

  assert.equal(gameplayMembershipReads, 1);
  assert.ok(settingsClassroomIds.every((classroomId) => Number(classroomId) === 9));
  assert.equal(events.length, 1);
  assert.equal(events[0].classroomId, 9);
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

test("teacher analytics CSV routes enforce teacher-owned classroom and student scope", async () => {
  const teacher = activeUser({ id: 4, role: "teacher" });
  const classroom = {
    id: 41,
    teacherId: 4,
    isActive: true,
    className: "CSV Class",
    section: "A",
  };

  await withStubs([
    [User, "findByPk", async () => teacher],
    [Classroom, "findAll", async () => [classroom]],
    [ClassroomMembership, "findAll", async () => []],
    [LevelContentOverride, "findAll", async () => []],
    [ClassroomLessonPlacement, "findAll", async () => []],
    [ClassroomLesson, "findAll", async () => []],
    [LearningAnalyticsEvent, "findAll", async () => []],
    [LearningAnalyticsEvent, "min", async () => null],
  ], async () => {
    for (const exportPath of ["students", "lessons"]) {
      const response = await fetch(
        `${baseUrl}/api/teacher/analytics/export/${exportPath}.csv?classroomId=41`,
        { headers: { Authorization: `Bearer ${authToken(4, "teacher")}` } },
      );
      const bytes = new Uint8Array(await response.arrayBuffer());
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type"), /^text\/csv/);
      assert.match(response.headers.get("content-disposition"), /attachment; filename="sharprunner-/);
      assert.deepEqual([...bytes.slice(0, 3)], [0xEF, 0xBB, 0xBF]);
    }

    const unauthorizedClassroom = await apiRequest(
      "/api/teacher/analytics/export/students.csv?classroomId=999",
      { token: authToken(4, "teacher") },
    );
    assert.equal(unauthorizedClassroom.response.status, 403);

    const unauthorizedStudent = await apiRequest(
      "/api/teacher/analytics/export/students.csv?classroomId=41&studentId=999",
      { token: authToken(4, "teacher") },
    );
    assert.equal(unauthorizedStudent.response.status, 403);

    const malformedStudentFilter = await apiRequest(
      "/api/teacher/analytics/export/students.csv?classroomId=41&studentId=1abc",
      { token: authToken(4, "teacher") },
    );
    assert.equal(malformedStudentFilter.response.status, 400);

    const malformedStudentDetail = await apiRequest(
      "/api/teacher/analytics/students/1abc?classroomId=41",
      { token: authToken(4, "teacher") },
    );
    assert.equal(malformedStudentDetail.response.status, 400);

    const duplicateDateFilter = await apiRequest(
      "/api/teacher/analytics?classroomId=41&datePreset=7d&datePreset=30d",
      { token: authToken(4, "teacher") },
    );
    assert.equal(duplicateDateFilter.response.status, 400);

    const duplicateLessonFilter = await apiRequest(
      "/api/teacher/analytics/export/lessons.csv?classroomId=41&lessonId=curriculum%3Atutorial&lessonId=curriculum%3Aarrays",
      { token: authToken(4, "teacher") },
    );
    assert.equal(duplicateLessonFilter.response.status, 400);
  });
});

test("legacy built-in catalogue exposes only allowlisted navigation metadata", async () => {
  const teacher = activeUser({ id: 701, role: "teacher" });

  await withStubs([[User, "findByPk", async () => teacher]], async () => {
    const { response, payload } = await apiRequest("/api/lesson-content", {
      token: authToken(teacher.id, "teacher"),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(
      Object.keys(payload).sort(),
      ["classroomLessons", "lessonCount", "lessons", "updatedAt", "version"],
    );
    assert.equal(payload.lessonCount, 5);
    assert.deepEqual(payload.classroomLessons, []);
    assert.deepEqual(
      payload.lessons.map((lesson) => lesson.lessonKey),
      ["tutorial", "arrays", "functions", "functions-with-arrays", "final"],
    );
    assert.deepEqual(
      payload.lessons.map((lesson) => lesson.displayOrder),
      [0, 1, 2, 3, 4],
    );

    const allowedLessonKeys = [
      "description",
      "displayOrder",
      "lessonKey",
      "lessonTitle",
      "theme",
    ];
    for (const lesson of payload.lessons) {
      assert.deepEqual(Object.keys(lesson).sort(), allowedLessonKeys);
      for (const value of Object.values(lesson)) {
        assert.equal(value !== null && typeof value === "object", false);
      }
      assert.equal(typeof lesson.lessonKey, "string");
      assert.equal(typeof lesson.lessonTitle, "string");
      assert.equal(typeof lesson.theme, "string");
      assert.equal(typeof lesson.description, "string");
    }
  });
});

test("legacy per-key built-in detail route is absent for unauthenticated callers", async () => {
  const { response, payload } = await apiRequest("/api/lesson-content/arrays");

  assert.equal(response.status, 404);
  assert.deepEqual(payload, { message: "API route not found" });
});

test("legacy per-key built-in detail route is absent for authenticated callers", async () => {
  const student = activeUser({ id: 702, role: "student" });

  await withStubs([[User, "findByPk", async () => student]], async () => {
    const { response, payload } = await apiRequest("/api/lesson-content/arrays", {
      token: authToken(student.id, "student"),
    });

    assert.equal(response.status, 404);
    assert.deepEqual(payload, { message: "API route not found" });
  });
});

test("catalogue hardening preserves the student classroomLessons projection", async () => {
  const student = activeUser({ id: 703, role: "student" });
  const classroomLesson = {
    id: 901,
    title: "Teacher-authored arrays extension",
    description: "A separate classroom lesson",
    contentType: "lesson",
    moduleId: null,
    externalUrl: null,
    dueAt: null,
    allowSubmissions: false,
    assignedStudentIds: [],
    createdAt: "2026-09-28T00:00:00.000Z",
    attachments: [{ id: 902, originalName: "notes.pdf", mimeType: "application/pdf", sizeBytes: 512 }],
    toJSON() {
      const { toJSON, ...payload } = this;
      return payload;
    },
  };

  await withStubs([
    [User, "findByPk", async () => student],
    [ClassroomMembership, "findOne", async () => ({ classroomId: 90, studentId: student.id, status: "active" })],
    [ClassroomLesson, "findAll", async () => [classroomLesson]],
    [ClassroomLessonPlacement, "findAll", async () => []],
  ], async () => {
    const { response, payload } = await apiRequest("/api/lesson-content", {
      token: authToken(student.id, "student"),
    });

    assert.equal(response.status, 200);
    const { toJSON, ...expectedLesson } = classroomLesson;
    assert.deepEqual(payload.classroomLessons, [expectedLesson]);
  });
});

test("student lesson discovery excludes archived reusable placements", async () => {
  const student = activeUser({ id: 7031, role: "student" });
  await withStubs([
    [User, "findByPk", async () => student],
    [ClassroomMembership, "findOne", async () => ({ classroomId: 90, studentId: student.id, status: "active" })],
    [ClassroomLesson, "findAll", async () => []],
    [ClassroomLessonPlacement, "findAll", async ({ where }) => {
      assert.equal(where.classroomId, 90);
      assert.equal(where.archivedAt, null);
      return [];
    }],
  ], async () => {
    const { response } = await apiRequest("/api/lesson-content", {
      token: authToken(student.id, "student"),
    });
    assert.equal(response.status, 200);
  });
});

test("placement discovery is identity-only, reports a safe PRE gate, and records no access", async () => {
  const student = activeUser({ id: 70311, role: "student" });
  const lesson = {
    id: 9031,
    title: "Gated arrays reading",
    description: "Instructional description must stay hidden",
    contentType: "lesson",
    externalUrl: "https://example.test/instructions",
    isPublished: true,
    publishAt: null,
    archivedAt: null,
    assignedStudentIds: [],
    contentVersion: 3,
    attachments: [{ id: 1, originalName: "answers.pdf", mimeType: "application/pdf", sizeBytes: 42 }],
    toJSON() { const { toJSON, ...value } = this; return value; },
  };
  const placement = {
    id: 9032,
    lessonId: lesson.id,
    classroomId: 90,
    moduleId: null,
    archivedAt: null,
    lesson,
  };
  await withStubs([
    [User, "findByPk", async () => student],
    [ClassroomMembership, "findOne", async () => ({ classroomId: 90, studentId: student.id, status: "active" })],
    [ClassroomLesson, "findAll", async () => []],
    [ClassroomLesson, "findByPk", async () => lesson],
    [ClassroomLessonPlacement, "findAll", async () => [placement]],
    [ClassroomLessonPlacement, "findOne", async () => placement],
    [Classroom, "findOne", async () => ({ id: 90, isActive: true })],
    [LessonAssessment, "findOne", async () => ({
      id: 77,
      classroomId: 90,
      targetKind: "CLASSROOM_LESSON_PLACEMENT",
      classroomLessonPlacementId: placement.id,
      type: "PRE",
      isRequired: true,
      isPublished: true,
      targetLessonVersion: 3,
      accessGateEstablishedAt: new Date("2026-10-18T00:00:00Z"),
    })],
    [AssessmentAttempt, "findOne", async () => null],
    [ClassroomLessonContentAccess, "findOne", async () => null],
    [ClassroomLessonContentAccess, "findOrCreate", async () => assert.fail("listing must not record content access")],
    [sequelize, "transaction", async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } })],
  ], async () => {
    const { response, payload } = await apiRequest("/api/lesson-content", {
      token: authToken(student.id, "student"),
    });
    assert.equal(response.status, 200);
    assert.equal(payload.classroomLessons.length, 1);
    const item = payload.classroomLessons[0];
    assert.equal(item.id, lesson.id);
    assert.equal(item.placementId, placement.id);
    assert.equal(item.title, lesson.title);
    assert.equal(item.description, null);
    assert.equal(item.externalUrl, null);
    assert.deepEqual(item.attachments, []);
    assert.equal(item.contentAvailable, false);
    assert.deepEqual(item.assessmentGate, {
      code: "CUSTOM_PRE_REQUIRED",
      assessmentId: 77,
      assessmentType: "PRE",
      required: true,
      classroomId: 90,
      classroomLessonPlacementId: placement.id,
    });
  });
});

test("required custom PRE blocks reader disclosure without recording access", async () => {
  const student = activeUser({ id: 70312, role: "student" });
  const lesson = {
    id: 9033,
    classroomId: null,
    teacherId: 704,
    title: "Blocked lesson",
    description: "Hidden reading",
    contentType: "lesson",
    contentVersion: 2,
    isPublished: true,
    publishAt: null,
    archivedAt: null,
    assignedStudentIds: [],
    attachments: [],
  };
  const placement = { id: 9034, classroomId: 90, lessonId: lesson.id, moduleId: null, archivedAt: null, lesson };
  await withStubs([
    [User, "findByPk", async () => student],
    [ClassroomLesson, "findByPk", async () => lesson],
    [ClassroomMembership, "findAll", async () => [{ classroomId: 90 }]],
    [ClassroomMembership, "findOne", async () => ({ classroomId: 90, studentId: student.id, status: "active" })],
    [ClassroomLessonPlacement, "findOne", async () => placement],
    [Classroom, "findOne", async () => ({ id: 90, isActive: true })],
    [LessonAssessment, "findOne", async () => ({
      id: 78,
      classroomId: 90,
      targetKind: "CLASSROOM_LESSON_PLACEMENT",
      classroomLessonPlacementId: placement.id,
      type: "PRE",
      isRequired: true,
      isPublished: true,
      targetLessonVersion: 2,
      accessGateEstablishedAt: new Date("2026-10-18T00:00:00Z"),
    })],
    [AssessmentAttempt, "findOne", async () => null],
    [ClassroomLessonContentAccess, "findOne", async () => null],
    [ClassroomLessonContentAccess, "findOrCreate", async () => assert.fail("denied reader must not record access")],
    [ClassroomLessonProgress, "findOrCreate", async () => assert.fail("denied reader must not record progress")],
    [sequelize, "transaction", async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } })],
  ], async () => {
    const { response, payload } = await apiRequest(
      `/api/lesson-content/classroom-lessons/${lesson.id}?classroomId=90`,
      { token: authToken(student.id, "student") },
    );
    assert.equal(response.status, 403);
    assert.equal(payload.code, "CUSTOM_PRE_REQUIRED");
    assert.equal(payload.gate.assessmentId, 78);
    assert.equal(JSON.stringify(payload).includes("Hidden reading"), false);

    const completion = await apiRequest(
      `/api/lesson-content/classroom-lessons/${lesson.id}/completion`,
      {
        method: "PUT",
        token: authToken(student.id, "student"),
        body: { classroomId: 90, completed: true },
      },
    );
    assert.equal(completion.response.status, 403);
    assert.equal(completion.payload.code, "CUSTOM_PRE_REQUIRED");
  });
});

test("reader records exact revision access and returns acknowledgement context", async () => {
  const student = activeUser({ id: 7032, role: "student" });
  const lesson = {
    id: 904,
    classroomId: null,
    teacherId: 704,
    title: "Shared arrays lesson",
    contentType: "lesson",
    contentVersion: 5,
    isPublished: true,
    publishAt: null,
    archivedAt: null,
    assignedStudentIds: [],
    attachments: [],
    toJSON() { return { ...this, toJSON: undefined }; },
  };
  const placement = { id: 905, classroomId: 90, lessonId: lesson.id, moduleId: null, archivedAt: null, lesson };
  const completedAt = new Date("2026-10-18T03:00:00.000Z");
  let accessDefaults;
  await withStubs([
    [User, "findByPk", async () => student],
    [ClassroomLesson, "findByPk", async () => lesson],
    [ClassroomMembership, "findAll", async () => [{ classroomId: 90 }]],
    [ClassroomMembership, "findOne", async () => ({ classroomId: 90, studentId: student.id, status: "active" })],
    [ClassroomLessonPlacement, "findOne", async () => placement],
    [Classroom, "findOne", async () => ({ id: 90, isActive: true })],
    [LessonAssessment, "findOne", async () => null],
    [Classroom, "findByPk", async () => ({ id: 90, className: "DSA", section: "3E" })],
    [ClassroomLessonProgress, "findOrCreate", async () => [{ viewedAt: new Date(), completedAt: null }, false]],
    [ClassroomLessonContentAccess, "findOrCreate", async ({ defaults }) => {
      accessDefaults = defaults;
      return [{ id: 906 }, true];
    }],
    [ClassroomLessonReadingCompletion, "findOne", async ({ where }) => {
      assert.deepEqual(where, {
        classroomLessonPlacementId: placement.id,
        classroomId: placement.classroomId,
        lessonId: lesson.id,
        studentId: student.id,
        lessonVersion: lesson.contentVersion,
      });
      return { completedAt };
    }],
    [ClassroomLessonSubmission, "findOne", async () => null],
    [sequelize, "transaction", async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } })],
  ], async () => {
    const { response, payload } = await apiRequest(
      `/api/lesson-content/classroom-lessons/${lesson.id}?classroomId=90`,
      { token: authToken(student.id, "student") },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(payload.readingAcknowledgement, {
      placementId: 905,
      lessonVersion: 5,
      completedAt: completedAt.toISOString(),
    });
    assert.equal(accessDefaults.classroomId, 90);
    assert.equal(accessDefaults.lessonId, lesson.id);
  });
});

test("reading acknowledgement route uses exact placement identity without changing legacy completion", async () => {
  const student = activeUser({ id: 7033, role: "student" });
  const lesson = {
    id: 907,
    contentType: "lesson",
    contentVersion: 2,
    isPublished: true,
    publishAt: null,
    archivedAt: null,
    assignedStudentIds: [],
  };
  const placement = { id: 908, classroomId: 91, lessonId: lesson.id, archivedAt: null, lesson };
  let legacyCompletionTouched = false;
  await withStubs([
    [User, "findByPk", async () => student],
    [ClassroomLesson, "findByPk", async () => lesson],
    [ClassroomLessonPlacement, "findOne", async ({ where }) => {
      assert.equal(where.id, placement.id);
      assert.equal(where.lessonId, lesson.id);
      assert.equal(where.classroomId, 91);
      return placement;
    }],
    [Classroom, "findOne", async () => ({ id: 91, isActive: true })],
    [ClassroomMembership, "findOne", async () => ({ classroomId: 91, studentId: student.id, status: "active" })],
    [LessonAssessment, "findOne", async () => null],
    [ClassroomLessonContentAccess, "findOne", async () => ({ id: 909, lessonVersion: 2 })],
    [ClassroomLessonReadingCompletion, "findOrCreate", async () => [{ id: 910, lessonVersion: 2, completedAt: new Date() }, true]],
    [ClassroomLessonProgress, "findOrCreate", async () => { legacyCompletionTouched = true; return []; }],
    [sequelize, "transaction", async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } })],
  ], async () => {
    const { response, payload } = await apiRequest(
      `/api/lesson-content/classroom-lessons/${lesson.id}/placements/${placement.id}/reading-acknowledgement`,
      {
        method: "POST",
        token: authToken(student.id, "student"),
        body: { classroomId: 91, lessonVersion: 2 },
      },
    );
    assert.equal(response.status, 201);
    assert.equal(payload.readingCompletion.lessonVersion, 2);
    assert.equal(legacyCompletionTouched, false);
  });
});

test("reading acknowledgement enforces the same required PRE gate as content delivery", async () => {
  const student = activeUser({ id: 70331, role: "student" });
  const lesson = {
    id: 9071,
    contentType: "lesson",
    contentVersion: 2,
    isPublished: true,
    publishAt: null,
    archivedAt: null,
    assignedStudentIds: [],
  };
  const placement = { id: 9081, classroomId: 91, lessonId: lesson.id, archivedAt: null, lesson };
  let completionWrites = 0;
  await withStubs([
    [User, "findByPk", async () => student],
    [ClassroomLesson, "findByPk", async () => lesson],
    [ClassroomLessonPlacement, "findOne", async () => placement],
    [Classroom, "findOne", async () => ({ id: 91, isActive: true })],
    [ClassroomMembership, "findOne", async () => ({ classroomId: 91, studentId: student.id, status: "active" })],
    [LessonAssessment, "findOne", async () => ({
      id: 781,
      classroomId: 91,
      targetKind: "CLASSROOM_LESSON_PLACEMENT",
      classroomLessonPlacementId: placement.id,
      type: "PRE",
      isRequired: true,
      isPublished: true,
      targetLessonVersion: 2,
      accessGateEstablishedAt: new Date("2026-10-18T00:00:00Z"),
    })],
    [AssessmentAttempt, "findOne", async () => null],
    [ClassroomLessonContentAccess, "findOne", async ({ where }) => (
      where.accessedAt ? null : { id: 9091, lessonVersion: 2 }
    )],
    [ClassroomLessonReadingCompletion, "findOrCreate", async () => {
      completionWrites += 1;
      return [{ id: 9101 }, true];
    }],
    [sequelize, "transaction", async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } })],
  ], async () => {
    const { response, payload } = await apiRequest(
      `/api/lesson-content/classroom-lessons/${lesson.id}/placements/${placement.id}/reading-acknowledgement`,
      {
        method: "POST",
        token: authToken(student.id, "student"),
        body: { classroomId: 91, lessonVersion: 2 },
      },
    );
    assert.equal(response.status, 403);
    assert.equal(payload.code, "CUSTOM_PRE_REQUIRED");
    assert.equal(completionWrites, 0);
  });
});

test("student file delivery records access for the requested exact placement revision", async () => {
  const student = activeUser({ id: 7034, role: "student" });
  const lesson = {
    id: 911,
    classroomId: null,
    contentType: "lesson",
    contentVersion: 6,
    isPublished: true,
    publishAt: null,
    archivedAt: null,
    assignedStudentIds: [],
  };
  const placement = { id: 912, classroomId: 92, lessonId: lesson.id, archivedAt: null, lesson };
  let recordedWhere;
  await withStubs([
    [User, "findByPk", async () => student],
    [ClassroomLessonAttachment, "findByPk", async () => ({
      id: 913,
      originalName: "arrays.txt",
      storedName: "arrays.txt",
      mimeType: "text/plain",
      storageProvider: "database",
      storageKey: null,
      sha256: "arrays-hash",
      scanStatus: "clean",
      updatedAt: new Date("2026-10-23T00:00:00Z"),
      lesson,
    })],
    [ClassroomLessonAttachment, "findOne", async () => ({ id: 913, data: Buffer.from("arrays") })],
    [ClassroomMembership, "findAll", async () => [{ classroomId: 92 }, { classroomId: 93 }]],
    [ClassroomMembership, "findOne", async () => ({ classroomId: 92, studentId: student.id, status: "active" })],
    [ClassroomLesson, "findByPk", async () => lesson],
    [ClassroomLessonPlacement, "findOne", async ({ where }) => {
      assert.equal(where.classroomId?.[Object.getOwnPropertySymbols(where.classroomId)[0]]?.[0] ?? where.classroomId, 92);
      return placement;
    }],
    [Classroom, "findOne", async () => ({ id: 92, isActive: true })],
    [LessonAssessment, "findOne", async () => null],
    [ClassroomLessonContentAccess, "findOrCreate", async ({ where }) => {
      recordedWhere = where;
      return [{ id: 914 }, true];
    }],
    [sequelize, "transaction", async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } })],
  ], async () => {
    const delivered = await fetch(`${baseUrl}/api/lesson-content/classroom-files/913?classroomId=92`, {
      headers: { Authorization: `Bearer ${authToken(student.id, "student")}` },
    });
    assert.equal(delivered.status, 200);
    assert.equal(await delivered.text(), "arrays");
    assert.deepEqual(recordedWhere, {
      classroomLessonPlacementId: 912,
      studentId: student.id,
      lessonVersion: 6,
    });

    recordedWhere = null;
    const ambiguous = await fetch(`${baseUrl}/api/lesson-content/classroom-files/913`, {
      headers: { Authorization: `Bearer ${authToken(student.id, "student")}` },
    });
    assert.equal(ambiguous.status, 403);
    assert.equal(recordedWhere, null);
  });
});

test("failed file materialization does not record content-access evidence", async () => {
  const student = activeUser({ id: 70342, role: "student" });
  const lesson = {
    id: 9112,
    classroomId: null,
    contentType: "lesson",
    contentVersion: 6,
    isPublished: true,
    publishAt: null,
    archivedAt: null,
    assignedStudentIds: [],
  };
  const placement = { id: 9122, classroomId: 92, lessonId: lesson.id, archivedAt: null, lesson };
  let accessWrites = 0;
  await withStubs([
    [User, "findByPk", async () => student],
    [ClassroomLessonAttachment, "findByPk", async () => ({
      id: 9132,
      originalName: "missing.txt",
      storedName: "definitely-missing-lesson-file.txt",
      mimeType: "text/plain",
      data: null,
      storageProvider: "database",
      storageKey: null,
      sha256: "missing-hash",
      scanStatus: "clean",
      updatedAt: new Date("2026-10-23T00:00:00Z"),
      lesson,
    })],
    [ClassroomLessonAttachment, "findOne", async () => ({ id: 9132, data: null })],
    [ClassroomMembership, "findAll", async () => [{ classroomId: 92 }]],
    [ClassroomMembership, "findOne", async () => ({ classroomId: 92, studentId: student.id, status: "active" })],
    [ClassroomLesson, "findByPk", async () => lesson],
    [ClassroomLessonPlacement, "findOne", async () => placement],
    [Classroom, "findOne", async () => ({ id: 92, isActive: true })],
    [LessonAssessment, "findOne", async () => null],
    [ClassroomLessonContentAccess, "findOrCreate", async () => {
      accessWrites += 1;
      return [{ id: 9142 }, true];
    }],
    [lessonStorage, "readFile", async () => null],
    [sequelize, "transaction", async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } })],
  ], async () => {
    const { response } = await apiRequest(
      "/api/lesson-content/classroom-files/9132?classroomId=92",
      { token: authToken(student.id, "student") },
    );
    assert.equal(response.status, 404);
    assert.equal(accessWrites, 0);
  });
});

test("file delivery rejects a revision change after materialization without recording access", async () => {
  const student = activeUser({ id: 70343, role: "student" });
  const loadedLesson = {
    id: 9113,
    classroomId: null,
    contentType: "lesson",
    contentVersion: 6,
    isPublished: true,
    publishAt: null,
    archivedAt: null,
    assignedStudentIds: [],
  };
  const changedLesson = { ...loadedLesson, contentVersion: 7 };
  const placement = { id: 9123, classroomId: 92, lessonId: loadedLesson.id, archivedAt: null, lesson: loadedLesson };
  let lessonLoads = 0;
  let accessWrites = 0;
  await withStubs([
    [User, "findByPk", async () => student],
    [ClassroomLessonAttachment, "findByPk", async () => ({
      id: 9133,
      originalName: "arrays.txt",
      storedName: "arrays.txt",
      mimeType: "text/plain",
      storageProvider: "database",
      storageKey: null,
      sha256: "revision-six-hash",
      scanStatus: "clean",
      updatedAt: new Date("2026-10-23T00:00:00Z"),
      lesson: loadedLesson,
    })],
    [ClassroomLessonAttachment, "findOne", async () => ({ id: 9133, data: Buffer.from("revision six") })],
    [ClassroomMembership, "findAll", async () => [{ classroomId: 92 }]],
    [ClassroomMembership, "findOne", async () => ({ classroomId: 92, studentId: student.id, status: "active" })],
    [ClassroomLesson, "findByPk", async () => (++lessonLoads === 1 ? loadedLesson : changedLesson)],
    [ClassroomLessonPlacement, "findOne", async () => placement],
    [Classroom, "findOne", async () => ({ id: 92, isActive: true })],
    [LessonAssessment, "findOne", async () => null],
    [ClassroomLessonContentAccess, "findOrCreate", async () => {
      accessWrites += 1;
      return [{ id: 9143 }, true];
    }],
    [lessonStorage, "readFile", async () => Buffer.from("revision six")],
    [sequelize, "transaction", async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } })],
  ], async () => {
    const response = await fetch(`${baseUrl}/api/lesson-content/classroom-files/9133?classroomId=92`, {
      headers: { Authorization: `Bearer ${authToken(student.id, "student")}` },
    });
    assert.equal(response.status, 409);
    const payload = await response.json();
    assert.equal(payload.code, "STALE_LESSON_REVISION");
    assert.equal(accessWrites, 0);
  });
});

test("required custom PRE blocks direct attachment, topic-image, and preview delivery", async () => {
  const student = activeUser({ id: 70341, role: "student" });
  const lesson = {
    id: 9111,
    classroomId: null,
    contentType: "lesson",
    contentVersion: 6,
    isPublished: true,
    publishAt: null,
    archivedAt: null,
    assignedStudentIds: [],
  };
  const placement = { id: 9121, classroomId: 92, lessonId: lesson.id, archivedAt: null, lesson };
  let fileReads = 0;
  await withStubs([
    [User, "findByPk", async () => student],
    [ClassroomLessonAttachment, "findByPk", async (id) => ({
      id,
      originalName: Number(id) === 9141 ? "topic-image.png" : "lesson-notes.docx",
      storedName: Number(id) === 9141 ? "topic-image.png" : "lesson-notes.docx",
      mimeType: Number(id) === 9141 ? "image/png" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      data: Buffer.from("hidden"),
      lesson,
    })],
    [ClassroomMembership, "findAll", async () => [{ classroomId: 92 }]],
    [ClassroomMembership, "findOne", async () => ({ classroomId: 92, studentId: student.id, status: "active" })],
    [ClassroomLesson, "findByPk", async () => lesson],
    [ClassroomLessonPlacement, "findOne", async () => placement],
    [Classroom, "findOne", async () => ({ id: 92, isActive: true })],
    [LessonAssessment, "findOne", async () => ({
      id: 79,
      classroomId: 92,
      targetKind: "CLASSROOM_LESSON_PLACEMENT",
      classroomLessonPlacementId: placement.id,
      type: "PRE",
      isRequired: true,
      isPublished: true,
      targetLessonVersion: 6,
      accessGateEstablishedAt: new Date("2026-10-18T00:00:00Z"),
    })],
    [AssessmentAttempt, "findOne", async () => null],
    [ClassroomLessonContentAccess, "findOne", async () => null],
    [ClassroomLessonContentAccess, "findOrCreate", async () => assert.fail("denied files must not record access")],
    [lessonStorage, "readFile", async () => { fileReads += 1; return Buffer.from("hidden"); }],
    [sequelize, "transaction", async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } })],
  ], async () => {
    for (const route of [
      "/api/lesson-content/classroom-files/9141?classroomId=92",
      "/api/lesson-content/classroom-files/9142?classroomId=92",
      "/api/lesson-content/classroom-files/9142/preview?classroomId=92",
    ]) {
      const { response, payload } = await apiRequest(route, { token: authToken(student.id, "student") });
      assert.equal(response.status, 403, route);
      assert.equal(payload.code, "CUSTOM_PRE_REQUIRED", route);
      assert.equal(payload.gate.assessmentId, 79, route);
    }
    assert.equal(fileReads, 0);
  });
});

test("authorized unavailable lesson attachments and topic images return a neutral response without reading bytes", async () => {
  const admin = activeUser({ id: 70401, role: "admin" });
  const foreignTeacher = activeUser({ id: 70406, role: "teacher" });
  let fileReads = 0;
  let byteLookups = 0;
  await withStubs([
    [User, "findByPk", async (id) => Number(id) === admin.id ? admin : foreignTeacher],
    [ClassroomLessonAttachment, "findByPk", async (id, options) => {
      assert.equal(options.attributes.includes("data"), false);
      assert.equal(options.include[0].attributes.includes("data"), false);
      return {
        id: Number(id),
        classroomId: 92,
        originalName: Number(id) === 9201 ? "lesson-notes.txt" : "topic-image.png",
        storedName: Number(id) === 9201 ? "lesson-notes.txt" : "topic-image.png",
        mimeType: Number(id) === 9201 ? "text/plain" : "image/png",
        storageProvider: "database",
        storageKey: null,
        sha256: "blocked-hash",
        scanStatus: Number(id) === 9201 ? "not_configured" : null,
        updatedAt: new Date("2026-10-23T00:00:00Z"),
        lesson: { id: 9200, teacherId: 704, isPublished: false, archivedAt: null },
      };
    }],
    [ClassroomLessonAttachment, "findOne", async () => { byteLookups += 1; return { id: 9201, data: Buffer.from("hidden") }; }],
    [Classroom, "findOne", async () => null],
    [lessonStorage, "readFile", async () => { fileReads += 1; return Buffer.from("hidden"); }],
  ], async () => {
    for (const fileId of [9201, 9202]) {
      const { response, payload } = await apiRequest(
        `/api/lesson-content/classroom-files/${fileId}`,
        { token: authToken(admin.id, "admin") },
      );
      assert.equal(response.status, 404);
      assert.deepEqual(payload, { message: "File unavailable", code: "FILE_UNAVAILABLE" });
    }

    const deniedTeacher = await apiRequest(
      "/api/lesson-content/classroom-files/9201",
      { token: authToken(foreignTeacher.id, "teacher") },
    );
    assert.equal(deniedTeacher.response.status, 403);
    assert.deepEqual(deniedTeacher.payload, { message: "Access denied" });
    assert.equal(byteLookups, 0);
    assert.equal(fileReads, 0);
  });
});

test("signature_checked lesson delivery is allowed only when full scanning is not required", async () => {
  const admin = activeUser({ id: 70402, role: "admin" });
  const previousRequirement = process.env.REQUIRE_FILE_SCANNING;
  let fileReads = 0;
  await withStubs([
    [User, "findByPk", async () => admin],
    [ClassroomLessonAttachment, "findByPk", async () => ({
      id: 9211,
      classroomId: 92,
      originalName: "lesson-notes.txt",
      storedName: "lesson-notes.txt",
      mimeType: "text/plain",
      storageProvider: "supabase",
      storageKey: "lessons/lesson-notes.txt",
      sha256: "signature-hash",
      scanStatus: "signature_checked",
      updatedAt: new Date("2026-10-23T00:00:00Z"),
      lesson: { id: 9210, teacherId: 704, isPublished: false, archivedAt: null },
    })],
    [ClassroomLessonAttachment, "findOne", async () => ({ id: 9211 })],
    [lessonStorage, "readFile", async () => { fileReads += 1; return Buffer.from("available"); }],
  ], async () => {
    try {
      process.env.REQUIRE_FILE_SCANNING = "false";
      const allowed = await fetch(`${baseUrl}/api/lesson-content/classroom-files/9211`, {
        headers: { Authorization: `Bearer ${authToken(admin.id, "admin")}` },
      });
      assert.equal(allowed.status, 200);
      assert.equal(await allowed.text(), "available");

      process.env.REQUIRE_FILE_SCANNING = "true";
      const blocked = await apiRequest(
        "/api/lesson-content/classroom-files/9211",
        { token: authToken(admin.id, "admin") },
      );
      assert.equal(blocked.response.status, 404);
      assert.deepEqual(blocked.payload, { message: "File unavailable", code: "FILE_UNAVAILABLE" });
      assert.equal(fileReads, 1);
    } finally {
      if (previousRequirement === undefined) delete process.env.REQUIRE_FILE_SCANNING;
      else process.env.REQUIRE_FILE_SCANNING = previousRequirement;
    }
  });
});

test("Office preview enforces attachment availability before storage reads or conversion", async () => {
  const admin = activeUser({ id: 70403, role: "admin" });
  let scanStatus = "future_status";
  let fileReads = 0;
  let conversions = 0;
  let byteLookups = 0;
  await withStubs([
    [User, "findByPk", async () => admin],
    [ClassroomLessonAttachment, "findByPk", async (_id, options) => {
      assert.equal(options.attributes.includes("data"), false);
      assert.equal(options.include[0].attributes.includes("data"), false);
      return {
        id: 9221,
        classroomId: 92,
        originalName: "lesson-notes.docx",
        storedName: "lesson-notes.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        storageProvider: "supabase",
        storageKey: "lessons/lesson-notes.docx",
        sha256: "office-hash",
        scanStatus,
        updatedAt: new Date("2026-10-23T00:00:00Z"),
        lesson: { id: 9220, teacherId: 704, isPublished: false, archivedAt: null },
      };
    }],
    [ClassroomLessonAttachment, "findOne", async () => { byteLookups += 1; return { id: 9221 }; }],
    [lessonStorage, "readFile", async () => { fileReads += 1; return Buffer.from("office bytes"); }],
    [officePreviewService, "convertOfficeToPdf", async () => { conversions += 1; return Buffer.from("pdf bytes"); }],
  ], async () => {
    const blocked = await apiRequest(
      "/api/lesson-content/classroom-files/9221/preview",
      { token: authToken(admin.id, "admin") },
    );
    assert.equal(blocked.response.status, 404);
    assert.deepEqual(blocked.payload, { message: "File unavailable", code: "FILE_UNAVAILABLE" });
    assert.equal(byteLookups, 0);
    assert.equal(fileReads, 0);
    assert.equal(conversions, 0);

    scanStatus = "clean";
    const allowed = await fetch(`${baseUrl}/api/lesson-content/classroom-files/9221/preview`, {
      headers: { Authorization: `Bearer ${authToken(admin.id, "admin")}` },
    });
    assert.equal(allowed.status, 200);
    assert.equal(await allowed.text(), "pdf bytes");
    assert.equal(byteLookups, 1);
    assert.equal(fileReads, 1);
    assert.equal(conversions, 1);
  });
});

test("submission attachment authorization precedes availability and allowed files retain delivery behavior", async () => {
  let scanStatus = "not_configured";
  let fileReads = 0;
  let byteLookups = 0;
  await withStubs([
    [User, "findByPk", async (id) => activeUser({ id: Number(id), role: "student" })],
    [ClassroomLessonSubmissionAttachment, "findByPk", async (_id, options) => {
      assert.equal(options.attributes.includes("data"), false);
      assert.equal(options.include[0].attributes.includes("data"), false);
      return {
        id: 9231,
        classroomId: 92,
        lessonId: 9230,
        submissionId: 9232,
        studentId: 70404,
        originalName: "submission.txt",
        mimeType: "text/plain",
        storageProvider: "supabase",
        storageKey: "submissions/submission.txt",
        sha256: "submission-hash",
        scanStatus,
        updatedAt: new Date("2026-10-23T00:00:00Z"),
        submission: { id: 9232 },
      };
    }],
    [ClassroomLessonSubmissionAttachment, "findOne", async () => { byteLookups += 1; return { id: 9231 }; }],
    [lessonStorage, "readFile", async () => { fileReads += 1; return Buffer.from("submitted work"); }],
  ], async () => {
    const blockedOwner = await apiRequest(
      "/api/lesson-content/submission-files/9231",
      { token: authToken(70404, "student") },
    );
    assert.equal(blockedOwner.response.status, 404);
    assert.deepEqual(blockedOwner.payload, { message: "File unavailable", code: "FILE_UNAVAILABLE" });

    const deniedForeignStudent = await apiRequest(
      "/api/lesson-content/submission-files/9231",
      { token: authToken(70405, "student") },
    );
    assert.equal(deniedForeignStudent.response.status, 403);
    assert.deepEqual(deniedForeignStudent.payload, { message: "Access denied" });
    assert.equal(byteLookups, 0);
    assert.equal(fileReads, 0);

    scanStatus = "clean";
    const allowedOwner = await fetch(`${baseUrl}/api/lesson-content/submission-files/9231`, {
      headers: { Authorization: `Bearer ${authToken(70404, "student")}` },
    });
    assert.equal(allowedOwner.status, 200);
    assert.equal(await allowedOwner.text(), "submitted work");
    assert.equal(byteLookups, 1);
    assert.equal(fileReads, 1);
  });
});

test("authorized database attachment reads are identity-constrained across normal, preview, and submission delivery", async () => {
  const admin = activeUser({ id: 70407, role: "admin" });
  const checkedIds = [];
  let conversions = 0;
  let storageReads = 0;
  const lesson = { id: 9240, teacherId: 704, isPublished: false, archivedAt: null };
  const lessonMetadata = (id, originalName, mimeType) => ({
    id,
    classroomId: 92,
    originalName,
    storedName: `stored-${id}`,
    mimeType,
    sizeBytes: 12,
    storageProvider: "database",
    storageKey: null,
    sha256: `hash-${id}`,
    scanStatus: "clean",
    updatedAt: new Date("2026-10-23T01:00:00Z"),
    lesson,
  });
  const submissionMetadata = {
    id: 9243,
    classroomId: 92,
    lessonId: 9240,
    submissionId: 9244,
    studentId: 70408,
    originalName: "submission.txt",
    mimeType: "text/plain",
    sizeBytes: 15,
    storageProvider: "database",
    storageKey: null,
    sha256: "hash-9243",
    scanStatus: "clean",
    updatedAt: new Date("2026-10-23T01:00:00Z"),
    submission: { id: 9244 },
  };

  await withStubs([
    [User, "findByPk", async () => admin],
    [ClassroomLessonAttachment, "findByPk", async (id, options) => {
      assert.equal(options.attributes.includes("data"), false);
      assert.equal(options.include[0].attributes.includes("data"), false);
      return Number(id) === 9241
        ? lessonMetadata(9241, "lesson.txt", "text/plain")
        : lessonMetadata(9242, "lesson.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    }],
    [ClassroomLessonAttachment, "findOne", async (options) => {
      assert.deepEqual(options.attributes, ["id", "data"]);
      assert.equal(options.where.storageProvider, "database");
      assert.equal(options.where.storageKey, null);
      assert.equal(options.where.scanStatus, "clean");
      assert.equal(options.where.sha256, `hash-${options.where.id}`);
      assert.deepEqual(options.where.updatedAt, new Date("2026-10-23T01:00:00Z"));
      checkedIds.push(options.where.id);
      return { id: options.where.id, data: Buffer.from(options.where.id === 9242 ? "office bytes" : "lesson bytes") };
    }],
    [ClassroomLessonSubmissionAttachment, "findByPk", async (_id, options) => {
      assert.equal(options.attributes.includes("data"), false);
      assert.equal(options.include[0].attributes.includes("data"), false);
      return submissionMetadata;
    }],
    [ClassroomLessonSubmissionAttachment, "findOne", async (options) => {
      assert.deepEqual(options.attributes, ["id", "data"]);
      assert.equal(options.where.id, 9243);
      assert.equal(options.where.sha256, "hash-9243");
      checkedIds.push(options.where.id);
      return { id: 9243, data: Buffer.from("submission bytes") };
    }],
    [lessonStorage, "readFile", async () => { storageReads += 1; return Buffer.from("wrong source"); }],
    [officePreviewService, "convertOfficeToPdf", async (data) => {
      conversions += 1;
      assert.equal(data.toString(), "office bytes");
      return Buffer.from("preview bytes");
    }],
  ], async () => {
    const normal = await fetch(`${baseUrl}/api/lesson-content/classroom-files/9241`, {
      headers: { Authorization: `Bearer ${authToken(admin.id, "admin")}` },
    });
    assert.equal(normal.status, 200);
    assert.equal(await normal.text(), "lesson bytes");

    const preview = await fetch(`${baseUrl}/api/lesson-content/classroom-files/9242/preview`, {
      headers: { Authorization: `Bearer ${authToken(admin.id, "admin")}` },
    });
    assert.equal(preview.status, 200);
    assert.equal(await preview.text(), "preview bytes");

    const submission = await fetch(`${baseUrl}/api/lesson-content/submission-files/9243`, {
      headers: { Authorization: `Bearer ${authToken(admin.id, "admin")}` },
    });
    assert.equal(submission.status, 200);
    assert.equal(await submission.text(), "submission bytes");

    assert.deepEqual(checkedIds, [9241, 9242, 9243]);
    assert.equal(storageReads, 0);
    assert.equal(conversions, 1);
  });
});

test("attachment replacement between metadata and byte lookup is rejected on every delivery path", async () => {
  const admin = activeUser({ id: 70409, role: "admin" });
  let conversions = 0;
  let storageReads = 0;
  const lesson = { id: 9250, teacherId: 704, isPublished: false, archivedAt: null };
  const metadata = (id, originalName, mimeType) => ({
    id,
    classroomId: 92,
    originalName,
    storedName: `old-${id}`,
    mimeType,
    sizeBytes: 12,
    storageProvider: "database",
    storageKey: null,
    sha256: `old-hash-${id}`,
    scanStatus: "clean",
    updatedAt: new Date("2026-10-23T02:00:00Z"),
    lesson,
  });

  await withStubs([
    [User, "findByPk", async () => admin],
    [ClassroomLessonAttachment, "findByPk", async (id) => metadata(
      Number(id),
      Number(id) === 9252 ? "old.docx" : "old.txt",
      Number(id) === 9252 ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "text/plain",
    )],
    [ClassroomLessonAttachment, "findOne", async (options) => {
      assert.match(options.where.sha256, /^old-hash-/);
      return null;
    }],
    [ClassroomLessonSubmissionAttachment, "findByPk", async () => ({
      ...metadata(9253, "old-submission.txt", "text/plain"),
      lessonId: 9250,
      submissionId: 9254,
      studentId: 70410,
      submission: { id: 9254 },
    })],
    [ClassroomLessonSubmissionAttachment, "findOne", async () => null],
    [lessonStorage, "readFile", async () => { storageReads += 1; return Buffer.from("new bytes"); }],
    [officePreviewService, "convertOfficeToPdf", async () => { conversions += 1; return Buffer.from("new preview"); }],
  ], async () => {
    const normal = await apiRequest("/api/lesson-content/classroom-files/9251", { token: authToken(admin.id, "admin") });
    assert.equal(normal.response.status, 404);
    assert.deepEqual(normal.payload, { message: "File not found" });

    const preview = await apiRequest("/api/lesson-content/classroom-files/9252/preview", { token: authToken(admin.id, "admin") });
    assert.equal(preview.response.status, 404);
    assert.deepEqual(preview.payload, { message: "Preview not found" });

    const submission = await apiRequest("/api/lesson-content/submission-files/9253", { token: authToken(admin.id, "admin") });
    assert.equal(submission.response.status, 404);
    assert.deepEqual(submission.payload, { message: "File not found" });
    assert.equal(storageReads, 0);
    assert.equal(conversions, 0);
  });
});

test("authorized legacy lesson files still use the filesystem fallback after a checked database lookup", async () => {
  const admin = activeUser({ id: 70411, role: "admin" });
  let storageReads = 0;
  let legacyReads = 0;
  await withStubs([
    [User, "findByPk", async () => admin],
    [ClassroomLessonAttachment, "findByPk", async () => ({
      id: 9261,
      classroomId: 92,
      originalName: "legacy.txt",
      storedName: "legacy-stored.txt",
      mimeType: "text/plain",
      sizeBytes: 12,
      storageProvider: "database",
      storageKey: null,
      sha256: "legacy-hash",
      scanStatus: "clean",
      updatedAt: new Date("2026-10-23T03:00:00Z"),
      lesson: { id: 9260, teacherId: 704, isPublished: false, archivedAt: null },
    })],
    [ClassroomLessonAttachment, "findOne", async () => ({ id: 9261, data: null })],
    [lessonStorage, "readFile", async () => { storageReads += 1; return null; }],
    [fs.promises, "readFile", async (filePath) => {
      legacyReads += 1;
      assert.equal(filePath.endsWith("legacy-stored.txt"), true);
      return Buffer.from("legacy bytes");
    }],
  ], async () => {
    const response = await fetch(`${baseUrl}/api/lesson-content/classroom-files/9261`, {
      headers: { Authorization: `Bearer ${authToken(admin.id, "admin")}` },
    });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "legacy bytes");
    assert.equal(storageReads, 0);
    assert.equal(legacyReads, 1);
  });
});

test("custom GRADING result and submit recovery validate exact target identity", async () => {
  const student = activeUser({ id: 70351, role: "student" });
  const lesson = {
    id: 9151,
    contentType: "lesson",
    contentVersion: 6,
    isPublished: true,
    publishAt: null,
    archivedAt: null,
    assignedStudentIds: [],
  };
  const placement = {
    id: 9152,
    classroomId: 92,
    lessonId: lesson.id,
    archivedAt: null,
    lesson,
  };
  const assessment = {
    id: 9153,
    classroomId: 92,
    targetKind: "CLASSROOM_LESSON_PLACEMENT",
    classroomLessonPlacementId: placement.id,
    targetLessonVersion: 6,
    type: "POST",
    title: "Lesson check",
    instructions: "Choose one answer.",
    isRequired: true,
    isPublished: true,
    maxAttempts: 1,
    showScoreAfterSubmission: true,
    passingPercentage: 75,
    requirePassingForCompletion: true,
    gradeCalculation: "HIGHEST",
    answerReviewPolicy: "AFTER_SUBMISSION",
    version: 1,
    questions: [{
      id: 9161,
      questionText: "Which answer is correct?",
      questionType: "MULTIPLE_CHOICE",
      displayOrder: 0,
      points: 1,
      choices: [
        { id: 9162, choiceText: "A", displayOrder: 0, isCorrect: true },
        { id: 9163, choiceText: "B", displayOrder: 1, isCorrect: false },
      ],
    }],
  };
  const attempt = {
    id: 9154,
    assessmentId: assessment.id,
    classroomId: 92,
    studentId: student.id,
    status: "GRADING",
    assessmentVersion: 1,
    submissionKey: "grading_key_9154",
    gradingLeaseToken: "grading-lease-token-that-is-long-enough",
    gradingLeaseExpiresAt: new Date("2099-01-01T00:00:00.000Z"),
  };
  await withStubs([
    [User, "findByPk", async () => student],
    [ClassroomMembership, "findOne", async () => ({ classroomId: 92, studentId: student.id, status: "active" })],
    [AssessmentAttempt, "findByPk", async () => attempt],
    [LessonAssessment, "findByPk", async () => assessment],
    [ClassroomLesson, "findByPk", async (id) => Number(id) === lesson.id ? lesson : null],
    [ClassroomLessonPlacement, "findOne", async ({ where }) => (
      Number(where.id) === placement.id && Number(where.classroomId) === placement.classroomId
        ? placement
        : null
    )],
    [Classroom, "findOne", async () => ({ id: 92, isActive: true })],
    [sequelize, "transaction", async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } })],
  ], async () => {
    const generic = await apiRequest(`/api/assessments/attempts/${attempt.id}/result`, {
      token: authToken(student.id, "student"),
    });
    assert.equal(generic.response.status, 403);

    const wrongPlacement = await apiRequest(
      `/api/assessments/classrooms/92/lesson-placements/9999/assessments/post/attempts/${attempt.id}/result`,
      { token: authToken(student.id, "student") },
    );
    assert.equal(wrongPlacement.response.status, 403);

    const exact = await apiRequest(
      `/api/assessments/classrooms/92/lesson-placements/${placement.id}/assessments/post/attempts/${attempt.id}/result`,
      { token: authToken(student.id, "student") },
    );
    assert.equal(exact.response.status, 200);
    assert.deepEqual(exact.payload, {
      result: { attemptId: attempt.id, status: "GRADING" },
      reviewAvailable: false,
    });

    for (const path of [
      `/api/assessments/attempts/${attempt.id}/submit`,
      `/api/assessments/classrooms/92/lesson-placements/9999/assessments/post/attempts/${attempt.id}/submit`,
    ]) {
      const denied = await apiRequest(path, {
        method: "POST",
        token: authToken(student.id, "student"),
        body: {},
        headers: { "Idempotency-Key": attempt.submissionKey },
      });
      assert.equal(denied.response.status, 404, path);
    }

    const exactSubmit = await apiRequest(
      `/api/assessments/classrooms/92/lesson-placements/${placement.id}/assessments/post/attempts/${attempt.id}/submit`,
      {
        method: "POST",
        token: authToken(student.id, "student"),
        body: {},
        headers: { "Idempotency-Key": attempt.submissionKey },
      },
    );
    assert.equal(exactSubmit.response.status, 202);
    assert.deepEqual(exactSubmit.payload, {
      result: { attemptId: attempt.id, status: "GRADING" },
      reviewAvailable: false,
    });
  });
});

test("teacher-created lesson detail keeps its route shape and authorization", async () => {
  const teacher = activeUser({ id: 704, role: "teacher" });
  const lesson = {
    id: 903,
    classroomId: null,
    teacherId: teacher.id,
    lessonNumber: 1,
    title: "Teacher-created lesson",
    description: "Not part of the built-in catalogue",
    contentType: "lesson",
    moduleId: null,
    externalUrl: null,
    dueAt: null,
    isPublished: true,
    publishAt: null,
    archivedAt: null,
    allowSubmissions: false,
    maxFileSizeMb: 5,
    assignedStudentIds: [],
    attachments: [],
    toJSON() {
      const { toJSON, ...payload } = this;
      return payload;
    },
  };

  const unauthenticated = await apiRequest(`/api/lesson-content/classroom-lessons/${lesson.id}`);
  assert.equal(unauthenticated.response.status, 401);

  await withStubs([
    [User, "findByPk", async () => teacher],
    [ClassroomLesson, "findByPk", async () => lesson],
  ], async () => {
    const { response, payload } = await apiRequest(
      `/api/lesson-content/classroom-lessons/${lesson.id}`,
      { token: authToken(teacher.id, "teacher") },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(payload).sort(), [
      "context",
      "lesson",
      "progress",
      "submission",
      "uploadPolicy",
    ]);
    assert.equal(payload.lesson.id, lesson.id);
    assert.equal(payload.lesson.title, lesson.title);
    assert.deepEqual(payload.context, { classroom: null, module: null });
    assert.equal(payload.progress, null);
    assert.equal(payload.submission, null);
  });
});

test("teacher lesson library is role-protected and returns reusable lesson metadata", async () => {
  const teacher = activeUser({ id: 71, role: "teacher" });
  const student = activeUser({ id: 72, role: "student" });
  await withStubs([
    [User, "findByPk", async (id) => Number(id) === teacher.id ? teacher : student],
    [ClassroomLesson, "findAll", async () => [{
      id: 91,
      teacherId: teacher.id,
      classroomId: null,
      title: "Loops in C#",
      description: "Iteration fundamentals",
      contentType: "lesson",
      isPublished: false,
      publishAt: null,
      archivedAt: null,
      placements: [{ id: 1, classroomId: 4 }],
      toJSON() { return { ...this, toJSON: undefined }; },
    }]],
    [Classroom, "findAll", async () => [{ id: 4, className: "C# 101", section: "A", isActive: true }]],
  ], async () => {
    const teacherResult = await apiRequest("/api/teacher/lesson-library", { token: authToken(teacher.id, "teacher") });
    assert.equal(teacherResult.response.status, 200);
    assert.equal(teacherResult.payload.lessons[0].title, "Loops in C#");
    assert.equal(teacherResult.payload.lessons[0].status, "draft");
    assert.equal(teacherResult.payload.lessons[0].usageCount, 1);

    const studentResult = await apiRequest("/api/teacher/lesson-library", { token: authToken(student.id, "student") });
    assert.equal(studentResult.response.status, 403);
  });
});

test("lesson-library detail returns minimal owner and direct-classroom context without changing authorization", async () => {
  const teacher = activeUser({ id: 707, role: "teacher" });
  const foreignTeacher = activeUser({ id: 708, role: "teacher" });
  const admin = activeUser({ id: 709, role: "admin" });
  const owner = {
    id: teacher.id,
    firstName: "Ada",
    lastName: "Owner",
    username: "ada.owner",
    email: "private@example.test",
    password: "not-for-serialization",
  };
  const classroom = {
    id: 81,
    className: "C# Foundations",
    section: "A",
    schoolYear: "2026-2027",
    isActive: true,
    classCode: "SECRET-CODE",
  };
  const lessons = new Map([
    [901, { id: 901, teacherId: teacher.id, classroomId: classroom.id, contentType: "lesson", title: "Direct lesson", isPublished: true, publishAt: null, archivedAt: null, owner, classroom, placements: [], topics: [], attachments: [] }],
    [902, { id: 902, teacherId: teacher.id, classroomId: null, contentType: "lesson", title: "Reusable lesson", isPublished: false, publishAt: null, archivedAt: null, owner, classroom: null, placements: [{ id: 1 }, { id: 2 }], topics: [], attachments: [] }],
    [903, { id: 903, teacherId: teacher.id, classroomId: classroom.id, contentType: "lesson", title: "Archived classroom lesson", isPublished: true, publishAt: null, archivedAt: null, owner, classroom: { ...classroom, isActive: false }, placements: [], topics: [], attachments: [] }],
    [904, { id: 904, teacherId: teacher.id, classroomId: 999, contentType: "lesson", title: "Missing context", isPublished: true, publishAt: null, archivedAt: null, owner: null, classroom: null, placements: [], topics: [], attachments: [] }],
  ]);
  for (const lesson of lessons.values()) {
    lesson.toJSON = function toJSON() {
      const { toJSON: _toJSON, ...payload } = this;
      return payload;
    };
  }

  await withStubs([
    [User, "findByPk", async (id) => [teacher, foreignTeacher, admin].find((user) => user.id === Number(id))],
    [ClassroomLesson, "findOne", async ({ where, include }) => {
      const ownerInclude = include?.find((item) => item.as === "owner");
      const classroomInclude = include?.find((item) => item.as === "classroom");
      assert.deepEqual(ownerInclude?.attributes, ["id", "firstName", "lastName", "username"]);
      assert.deepEqual(classroomInclude?.attributes, ["id", "className", "section", "schoolYear", "isActive"]);
      const lesson = lessons.get(Number(where.id));
      if (!lesson || (where.teacherId != null && Number(where.teacherId) !== lesson.teacherId)) return null;
      return lesson;
    }],
  ], async () => {
    const direct = await apiRequest("/api/teacher/lesson-library/901", { token: authToken(teacher.id, "teacher") });
    assert.equal(direct.response.status, 200);
    assert.deepEqual(direct.payload.lesson.owner, { id: teacher.id, firstName: "Ada", lastName: "Owner", username: "ada.owner" });
    assert.deepEqual(direct.payload.lesson.classroom, { id: 81, className: "C# Foundations", section: "A", schoolYear: "2026-2027", isActive: true });
    assert.equal(direct.payload.lesson.usageCount, 0);
    assert.equal(Object.hasOwn(direct.payload.lesson.owner, "email"), false);
    assert.equal(Object.hasOwn(direct.payload.lesson.classroom, "classCode"), false);

    const reusable = await apiRequest("/api/teacher/lesson-library/902", { token: authToken(admin.id, "admin") });
    assert.equal(reusable.response.status, 200);
    assert.equal(reusable.payload.lesson.classroom, null);
    assert.equal(reusable.payload.lesson.usageCount, 2);

    const inactive = await apiRequest("/api/teacher/lesson-library/903", { token: authToken(teacher.id, "teacher") });
    assert.equal(inactive.payload.lesson.classroom.isActive, false);

    const missing = await apiRequest("/api/teacher/lesson-library/904", { token: authToken(admin.id, "admin") });
    assert.equal(missing.payload.lesson.owner, null);
    assert.equal(missing.payload.lesson.classroom, null);

    const denied = await apiRequest("/api/teacher/lesson-library/901", { token: authToken(foreignTeacher.id, "teacher") });
    assert.equal(denied.response.status, 404);
  });
});

test("lesson-library detail derives attachment and topic-image availability without storage access", async () => {
  const teacher = activeUser({ id: 710, role: "teacher" });
  const foreignTeacher = activeUser({ id: 711, role: "teacher" });
  const admin = activeUser({ id: 712, role: "admin" });
  const statuses = ["clean", "signature_checked", "not_configured", null, "unsafe", "future_status"];
  const expectedOptional = [true, true, false, false, false, false];
  const expectedRequired = [true, false, false, false, false, false];
  const lesson = {
    id: 910,
    teacherId: teacher.id,
    classroomId: null,
    contentType: "lesson",
    title: "Availability lesson",
    isPublished: false,
    publishAt: null,
    archivedAt: null,
    placements: [],
    attachments: statuses.map((scanStatus, index) => ({
      id: 1000 + index,
      originalName: `resource-${index}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 100 + index,
      displayOrder: index,
      scanStatus,
    })),
    topics: [{
      id: 920,
      title: "Topic",
      displayOrder: 0,
      content: { blocks: [] },
      images: statuses.map((scanStatus, index) => ({
        id: 2000 + index,
        originalName: `image-${index}.png`,
        mimeType: "image/png",
        sizeBytes: 200 + index,
        displayOrder: index,
        placement: "content",
        altText: `Image ${index}`,
        caption: null,
        scanStatus,
      })),
    }],
    toJSON() {
      const { toJSON, ...payload } = this;
      return payload;
    },
  };
  let storageReads = 0;
  let attachmentWrites = 0;
  const previousRequirement = process.env.REQUIRE_FILE_SCANNING;

  try {
    await withStubs([
      [User, "findByPk", async (id) => [teacher, foreignTeacher, admin].find((user) => user.id === Number(id))],
      [ClassroomLesson, "findOne", async ({ where, include }) => {
        const topicImages = include?.find((item) => item.as === "topics")?.include?.[0];
        assert.ok(topicImages.attributes.includes("scanStatus"));
        if (where.teacherId != null && Number(where.teacherId) !== teacher.id) return null;
        return lesson;
      }],
      [lessonStorage, "readFile", async () => { storageReads += 1; return null; }],
      [ClassroomLessonAttachment, "create", async () => { attachmentWrites += 1; }],
      [ClassroomLessonAttachment, "update", async () => { attachmentWrites += 1; }],
      [ClassroomLessonAttachment, "destroy", async () => { attachmentWrites += 1; }],
    ], async () => {
      process.env.REQUIRE_FILE_SCANNING = "false";
      const optional = await apiRequest(`/api/teacher/lesson-library/${lesson.id}`, {
        token: authToken(teacher.id, "teacher"),
      });
      assert.equal(optional.response.status, 200);
      assert.deepEqual(optional.payload.lesson.attachments.map((file) => file.available), expectedOptional);
      assert.deepEqual(optional.payload.lesson.topics[0].images.map((file) => file.available), expectedOptional);
      assert.equal(optional.payload.lesson.attachments[0].scanStatus, "clean", "existing attachment fields remain intact");
      for (const image of optional.payload.lesson.topics[0].images) {
        assert.equal(Object.hasOwn(image, "scanStatus"), false, "topic-image scan status remains internal");
      }

      process.env.REQUIRE_FILE_SCANNING = "true";
      const required = await apiRequest(`/api/teacher/lesson-library/${lesson.id}`, {
        token: authToken(teacher.id, "teacher"),
      });
      assert.equal(required.response.status, 200);
      assert.deepEqual(required.payload.lesson.attachments.map((file) => file.available), expectedRequired);
      assert.deepEqual(required.payload.lesson.topics[0].images.map((file) => file.available), expectedRequired);

      const adminResult = await apiRequest(`/api/teacher/lesson-library/${lesson.id}`, {
        token: authToken(admin.id, "admin"),
      });
      assert.equal(adminResult.response.status, 200);

      const foreignResult = await apiRequest(`/api/teacher/lesson-library/${lesson.id}`, {
        token: authToken(foreignTeacher.id, "teacher"),
      });
      assert.equal(foreignResult.response.status, 404);
      assert.equal(storageReads, 0);
      assert.equal(attachmentWrites, 0);
    });
  } finally {
    if (previousRequirement === undefined) delete process.env.REQUIRE_FILE_SCANNING;
    else process.env.REQUIRE_FILE_SCANNING = previousRequirement;
  }
});

test("topic-image upload availability matches the lesson-library detail response", async () => {
  const teacher = activeUser({ id: 713, role: "teacher" });
  const lesson = {
    id: 911,
    teacherId: teacher.id,
    classroomId: null,
    contentType: "lesson",
    title: "Image upload lesson",
    isPublished: false,
    publishAt: null,
    archivedAt: null,
    version: 2,
    contentVersion: 1,
    placements: [],
    attachments: [],
    topics: [],
    async save() {},
    toJSON() {
      const { save, toJSON, ...payload } = this;
      return payload;
    },
  };
  const topic = { id: 921, lessonId: lesson.id, title: "Images", displayOrder: 0, content: { blocks: [] }, images: [] };
  lesson.topics = [topic];
  const previousRequirement = process.env.REQUIRE_FILE_SCANNING;
  const previousClamAvBin = process.env.CLAMAV_BIN;
  delete process.env.CLAMAV_BIN;
  process.env.REQUIRE_FILE_SCANNING = "false";

  try {
    await withStubs([
      [User, "findByPk", async () => teacher],
      [ClassroomLesson, "findOne", async () => lesson],
      [LessonTopic, "findOne", async () => topic],
      [sequelize, "transaction", async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } })],
      [customLessonLifecycle, "lockContentRevisionForEdit", async () => lesson],
      [ClassroomLessonAttachment, "count", async () => 0],
      [lessonStorage, "uploadFile", async () => ({
        data: Buffer.from("stored"),
        storageProvider: "database",
        storageKey: null,
        sha256: "a".repeat(64),
        scanStatus: "signature_checked",
      })],
      [lessonStorage, "readFile", async () => assert.fail("serialization must not read storage")],
      [ClassroomLessonAttachment, "create", async (values) => {
        const image = { id: 3001, ...values };
        topic.images.push(image);
        return image;
      }],
    ], async () => {
      const form = new FormData();
      form.append("files", new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" }), "topic.png");
      const uploadResponse = await fetch(
        `${baseUrl}/api/teacher/lesson-library/${lesson.id}/topics/${topic.id}/images`,
        { method: "POST", headers: { Authorization: `Bearer ${authToken(teacher.id, "teacher")}` }, body: form },
      );
      const uploadPayload = await uploadResponse.json();
      assert.equal(uploadResponse.status, 201);
      assert.equal(uploadPayload.images[0].available, true);
      assert.equal(Object.hasOwn(uploadPayload.images[0], "scanStatus"), false);

      const detail = await apiRequest(`/api/teacher/lesson-library/${lesson.id}`, {
        token: authToken(teacher.id, "teacher"),
      });
      assert.equal(detail.response.status, 200);
      assert.deepEqual(detail.payload.lesson.topics[0].images[0], uploadPayload.images[0]);
    });
  } finally {
    if (previousRequirement === undefined) delete process.env.REQUIRE_FILE_SCANNING;
    else process.env.REQUIRE_FILE_SCANNING = previousRequirement;
    if (previousClamAvBin === undefined) delete process.env.CLAMAV_BIN;
    else process.env.CLAMAV_BIN = previousClamAvBin;
  }
});

test("teacher lesson endpoints reject foreign lessons and mismatched nested topics", async () => {
  const teacher = activeUser({ id: 73, role: "teacher" });
  const ownedLesson = { id: 101, teacherId: teacher.id, contentType: "lesson", version: 2 };
  await withStubs([
    [User, "findByPk", async () => teacher],
    [ClassroomLesson, "findOne", async ({ where }) => Number(where.id) === ownedLesson.id && Number(where.teacherId) === teacher.id ? ownedLesson : null],
    [LessonTopic, "findOne", async ({ where }) => Number(where.id) === 999 && Number(where.lessonId) === ownedLesson.id ? null : assert.fail("nested topic lookup was not scoped to its lesson")],
  ], async () => {
    const foreign = await apiRequest("/api/teacher/lesson-library/202", { token: authToken(teacher.id, "teacher") });
    assert.equal(foreign.response.status, 404);

    const mismatchedTopic = await apiRequest(`/api/teacher/lesson-library/${ownedLesson.id}/topics/999/duplicate`, {
      method: "POST",
      token: authToken(teacher.id, "teacher"),
      body: {},
    });
    assert.equal(mismatchedTopic.response.status, 404);
  });
});

test("lesson updates report version conflicts instead of overwriting newer content", async () => {
  const teacher = activeUser({ id: 74, role: "teacher" });
  await withStubs([
    [User, "findByPk", async () => teacher],
    [ClassroomLesson, "findOne", async () => ({ id: 102, teacherId: teacher.id, contentType: "lesson", version: 4 })],
  ], async () => {
    const { response, payload } = await apiRequest("/api/teacher/lesson-library/102", {
      method: "PUT",
      token: authToken(teacher.id, "teacher"),
      body: { title: "Stale title", version: 3, status: "draft", topics: [] },
    });
    assert.equal(response.status, 409);
    assert.equal(payload.currentVersion, 4);
  });
});

test("lesson updates recheck the version under a row lock before saving", async () => {
  const teacher = activeUser({ id: 741, role: "teacher" });
  let lookupCount = 0;
  await withStubs([
    [User, "findByPk", async () => teacher],
    [ClassroomLesson, "findOne", async () => {
      lookupCount += 1;
      return { id: 103, teacherId: teacher.id, contentType: "lesson", version: lookupCount === 1 ? 3 : 4 };
    }],
    [sequelize, "transaction", async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } })],
    [LessonTopic, "findAll", async () => assert.fail("topics must not be changed after the locked version check fails")],
  ], async () => {
    const { response, payload } = await apiRequest("/api/teacher/lesson-library/103", {
      method: "PUT",
      token: authToken(teacher.id, "teacher"),
      body: { title: "Concurrent title", version: 3, status: "draft", topics: [] },
    });
    assert.equal(response.status, 409);
    assert.equal(payload.currentVersion, 4);
    assert.equal(lookupCount, 2);
  });
});

test("shared lesson content edits are blocked by assessment attempts across placements", async () => {
  const teacher = activeUser({ id: 742, role: "teacher" });
  const lesson = {
    id: 104,
    teacherId: teacher.id,
    contentType: "lesson",
    title: "Arrays",
    description: "Original content",
    externalUrl: null,
    version: 3,
    contentVersion: 2,
  };
  await withStubs([
    [User, "findByPk", async () => teacher],
    [ClassroomLesson, "findOne", async () => lesson],
    [sequelize, "transaction", async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } })],
    [LessonTopic, "findAll", async () => []],
    [ClassroomLessonPlacement, "findAll", async () => [{ id: 501 }]],
    [LessonAssessment, "findAll", async () => [{ id: 601, isPublished: false, publishedAt: null }]],
    [AssessmentAttempt, "count", async () => 1],
  ], async () => {
    const { response, payload } = await apiRequest("/api/teacher/lesson-library/104", {
      method: "PUT",
      token: authToken(teacher.id, "teacher"),
      body: { title: "Arrays", description: "Changed content", version: 3, status: "draft", topics: [] },
    });
    assert.equal(response.status, 409);
    assert.equal(payload.code, "LESSON_CONTENT_LOCKED_BY_ASSESSMENT_HISTORY");
    assert.equal(lesson.version, 3);
    assert.equal(lesson.contentVersion, 2);
  });
});

test("safe lesson metadata edits advance editor version without invalidating content evidence", async () => {
  const teacher = activeUser({ id: 743, role: "teacher" });
  const lesson = {
    id: 105,
    teacherId: teacher.id,
    classroomId: null,
    contentType: "lesson",
    title: "Arrays",
    description: "Stable content",
    externalUrl: null,
    lessonNumber: 2,
    isPublished: false,
    publishAt: null,
    version: 3,
    contentVersion: 2,
    placements: [],
    topics: [],
    attachments: [],
    async save() {},
    toJSON() { return { ...this, save: undefined, toJSON: undefined }; },
  };
  await withStubs([
    [User, "findByPk", async () => teacher],
    [ClassroomLesson, "findOne", async () => lesson],
    [sequelize, "transaction", async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } })],
    [LessonTopic, "findAll", async () => []],
    [LessonTopic, "destroy", async () => assert.fail("metadata edit must not remove topics")],
    [ClassroomLessonVersion, "create", async () => ({ id: 1 })],
    [ClassroomLessonPlacement, "findAll", async () => assert.fail("metadata edit must not inspect assessment placements")],
  ], async () => {
    const { response } = await apiRequest("/api/teacher/lesson-library/105", {
      method: "PUT",
      token: authToken(teacher.id, "teacher"),
      body: { title: "Arrays reference", description: "Stable content", lessonNumber: 3, version: 3, status: "draft", topics: [] },
    });
    assert.equal(response.status, 200);
    assert.equal(lesson.version, 4);
    assert.equal(lesson.contentVersion, 2);
  });
});

test("student lesson routes block drafts, future schedules, archives, and arbitrary classroom ids", async () => {
  const student = activeUser({ id: 75, role: "student" });
  const lessons = new Map([
    [201, { id: 201, contentType: "lesson", isPublished: false, publishAt: null, archivedAt: null, assignedStudentIds: [] }],
    [202, { id: 202, contentType: "lesson", isPublished: true, publishAt: new Date(Date.now() + 60_000), archivedAt: null, assignedStudentIds: [] }],
    [203, { id: 203, contentType: "lesson", isPublished: true, publishAt: null, archivedAt: new Date(), assignedStudentIds: [] }],
    [204, { id: 204, contentType: "lesson", isPublished: true, publishAt: null, archivedAt: null, assignedStudentIds: [] }],
  ]);
  await withStubs([
    [User, "findByPk", async () => student],
    [ClassroomLesson, "findByPk", async (id) => lessons.get(Number(id)) || null],
    [ClassroomMembership, "findAll", async () => []],
  ], async () => {
    for (const lessonId of [201, 202, 203]) {
      const result = await apiRequest(`/api/lesson-content/classroom-lessons/${lessonId}`, { token: authToken(student.id, "student") });
      assert.equal(result.response.status, 404);
    }
    const arbitrary = await apiRequest("/api/lesson-content/classroom-lessons/204", { token: authToken(student.id, "student") });
    assert.equal(arbitrary.response.status, 403);

    const archivedCompletion = await apiRequest("/api/lesson-content/classroom-lessons/203/completion", {
      method: "PUT",
      token: authToken(student.id, "student"),
      body: { completed: true },
    });
    assert.equal(archivedCompletion.response.status, 404);
  });
});

test("archived lesson files cannot be opened through the office preview route", async () => {
  const student = activeUser({ id: 76, role: "student" });
  await withStubs([
    [User, "findByPk", async () => student],
    [ClassroomLessonAttachment, "findByPk", async () => ({
      id: 301,
      originalName: "archived-lesson.docx",
      lesson: { id: 203, isPublished: true, publishAt: null, archivedAt: new Date(), assignedStudentIds: [] },
    })],
  ], async () => {
    const result = await apiRequest("/api/lesson-content/classroom-files/301/preview", { token: authToken(student.id, "student") });
    assert.equal(result.response.status, 403);
  });
});

test("reusing a lesson preserves its identity and safely updates its module placement", async () => {
  const teacher = activeUser({ id: 81, role: "teacher" });
  const source = { id: 91, teacherId: teacher.id, title: "Shared loops", contentType: "lesson", topics: [], attachments: [] };
  const placement = { lessonId: source.id, classroomId: 12, moduleId: null, saveCalled: false, async save() { this.saveCalled = true; } };

  let placementDefaults;
  await withStubs([
    [User, "findByPk", async () => teacher],
    [ClassroomLesson, "findOne", async ({ where }) => Number(where.id) === source.id ? source : { id: 44, classroomId: 12, contentType: "module" }],
    [Classroom, "findOne", async () => ({ id: 12, teacherId: teacher.id })],
    [ClassroomLessonPlacement, "count", async () => 1],
    [ClassroomLessonPlacement, "findOrCreate", async ({ defaults }) => {
      placementDefaults = defaults;
      return [placement, false];
    }],
    [ClassroomLessonPlacement, "findOne", async () => placement],
    [sequelize, "transaction", async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } })],
  ], async () => {
    const { response, payload } = await apiRequest(`/api/teacher/lesson-library/${source.id}/placements`, {
      method: "POST",
      token: authToken(teacher.id, "teacher"),
      body: { classroomId: 12, moduleId: 44, mode: "reuse" },
    });
    assert.equal(response.status, 200);
    assert.equal(payload.lessonId, source.id);
    assert.equal(placement.moduleId, 44);
    assert.equal(placement.saveCalled, true);
    assert.ok(placementDefaults.accessPolicyEstablishedAt instanceof Date);
    assert.match(payload.message, /moved to the selected module/i);
  });
});

test("reusing an archived placement restores its original identity", async () => {
  const teacher = activeUser({ id: 811, role: "teacher" });
  const source = { id: 911, teacherId: teacher.id, title: "Shared functions", contentType: "lesson", topics: [], attachments: [] };
  const placement = {
    id: 712,
    lessonId: source.id,
    classroomId: 112,
    moduleId: null,
    archivedAt: new Date("2026-10-01T00:00:00Z"),
    accessPolicyEstablishedAt: new Date("2026-09-15T00:00:00Z"),
    async save() {},
  };
  await withStubs([
    [User, "findByPk", async () => teacher],
    [ClassroomLesson, "findOne", async () => source],
    [Classroom, "findOne", async () => ({ id: 112, teacherId: teacher.id })],
    [ClassroomLessonPlacement, "count", async () => 1],
    [ClassroomLessonPlacement, "findOrCreate", async () => [placement, false]],
    [ClassroomLessonPlacement, "findOne", async () => placement],
    [sequelize, "transaction", async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } })],
  ], async () => {
    const { response, payload } = await apiRequest(`/api/teacher/lesson-library/${source.id}/placements`, {
      method: "POST",
      token: authToken(teacher.id, "teacher"),
      body: { classroomId: 112, mode: "reuse" },
    });
    assert.equal(response.status, 200);
    assert.equal(payload.placement.id, 712);
    assert.equal(placement.archivedAt, null);
    assert.deepEqual(placement.accessPolicyEstablishedAt, new Date("2026-09-15T00:00:00Z"));
    assert.match(payload.message, /restored/i);
  });
});

test("removing a placement with reading history archives it instead of deleting it", async () => {
  const teacher = activeUser({ id: 812, role: "teacher" });
  const lesson = { id: 912, teacherId: teacher.id, contentType: "lesson" };
  const placement = {
    id: 713,
    lessonId: lesson.id,
    classroomId: 113,
    archivedAt: null,
    destroyCalled: false,
    async save() {},
    async destroy() { this.destroyCalled = true; },
  };
  await withStubs([
    [User, "findByPk", async () => teacher],
    [ClassroomLesson, "findOne", async () => lesson],
    [ClassroomLesson, "findByPk", async () => lesson],
    [Classroom, "findOne", async () => ({ id: 113, teacherId: teacher.id })],
    [ClassroomLessonPlacement, "findOne", async () => placement],
    [LessonAssessment, "count", async () => 0],
    [ClassroomLessonContentAccess, "count", async () => 1],
    [ClassroomLessonReadingCompletion, "count", async () => 0],
    [ClassroomLessonProgress, "count", async () => 0],
    [ClassroomLessonSubmission, "count", async () => 0],
    [sequelize, "transaction", async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } })],
  ], async () => {
    const { response, payload } = await apiRequest(
      `/api/teacher/lesson-library/${lesson.id}/placements/113`,
      { method: "DELETE", token: authToken(teacher.id, "teacher") },
    );
    assert.equal(response.status, 200);
    assert.equal(payload.archived, true);
    assert.ok(placement.archivedAt instanceof Date);
    assert.equal(placement.destroyCalled, false);
  });
});

test("copy placement creates an independent draft with copied topics", async () => {
  const teacher = activeUser({ id: 82, role: "teacher" });
  const source = {
    id: 92,
    teacherId: teacher.id,
    lessonNumber: 3,
    title: "Original arrays",
    description: "Shared source",
    contentType: "lesson",
    externalUrl: null,
    topics: [{ id: 7, title: "Array basics", displayOrder: 0, content: { format: "markdown", body: "Intro", codeBlocks: [], practiceBlocks: [] } }],
    attachments: [],
  };
  let createdLesson;
  let createdTopic;
  let createdPlacement;

  await withStubs([
    [User, "findByPk", async () => teacher],
    [ClassroomLesson, "findOne", async () => source],
    [Classroom, "findOne", async () => ({ id: 13, teacherId: teacher.id })],
    [sequelize, "transaction", async (callback) => callback({ id: "test-transaction" })],
    [ClassroomLesson, "create", async (values) => { createdLesson = { id: 501, ...values }; return createdLesson; }],
    [LessonTopic, "create", async (values) => { createdTopic = { id: 601, ...values }; return createdTopic; }],
    [ClassroomLessonVersion, "create", async (values) => values],
    [ClassroomLessonPlacement, "count", async () => 2],
    [ClassroomLessonPlacement, "create", async (values) => { createdPlacement = { id: 701, ...values }; return createdPlacement; }],
    [ClassroomLessonPlacement, "findOne", async () => createdPlacement],
  ], async () => {
    const { response, payload } = await apiRequest(`/api/teacher/lesson-library/${source.id}/placements`, {
      method: "POST",
      token: authToken(teacher.id, "teacher"),
      body: { classroomId: 13, mode: "copy" },
    });
    assert.equal(response.status, 201);
    assert.notEqual(payload.lessonId, source.id);
    assert.equal(payload.lessonId, createdLesson.id);
    assert.equal(createdLesson.isPublished, false);
    assert.equal(createdTopic.lessonId, createdLesson.id);
    assert.deepEqual(createdTopic.content, source.topics[0].content);
    assert.notStrictEqual(createdTopic.content, source.topics[0].content);
    createdTopic.content.body = "Changed only in the copy";
    assert.equal(source.topics[0].content.body, "Intro");
    assert.equal(createdPlacement.lessonId, createdLesson.id);
    assert.equal(createdPlacement.classroomId, 13);
    assert.ok(createdPlacement.accessPolicyEstablishedAt instanceof Date);
  });
});

test("lesson placement rejects a module from another classroom", async () => {
  const teacher = activeUser({ id: 83, role: "teacher" });
  const source = { id: 93, teacherId: teacher.id, contentType: "lesson", topics: [], attachments: [] };
  await withStubs([
    [User, "findByPk", async () => teacher],
    [ClassroomLesson, "findOne", async ({ where }) => {
      if (Number(where.id) === source.id) return source;
      assert.equal(Number(where.id), 45);
      assert.equal(Number(where.classroomId), 14);
      assert.equal(where.contentType, "module");
      return null;
    }],
    [Classroom, "findOne", async () => ({ id: 14, teacherId: teacher.id })],
  ], async () => {
    const { response, payload } = await apiRequest(`/api/teacher/lesson-library/${source.id}/placements`, {
      method: "POST",
      token: authToken(teacher.id, "teacher"),
      body: { classroomId: 14, moduleId: 45, mode: "reuse" },
    });
    assert.equal(response.status, 400);
    assert.match(payload.message, /does not belong to this classroom/i);
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

test("teacher membership PATCH reactivates pending rejected and removed rows under the shared lock", async () => {
  const teacher = activeUser({ id: 4, role: "teacher" });
  const classroom = { id: 25, teacherId: 4, isActive: true, maxStudents: 5 };

  for (const sourceStatus of ["pending", "rejected", "removed"]) {
    const joinedAt = sourceStatus === "pending" ? null : new Date("2026-09-01T08:00:00.000Z");
    const membership = {
      classroomId: 25,
      studentId: 7,
      status: sourceStatus,
      joinedAt,
      updatedAt: new Date("2026-10-01T08:00:00.000Z"),
      save: async function save(options) {
        assert.equal(options.transaction.id, "membership-reactivation");
      },
    };
    const transaction = { id: "membership-reactivation", LOCK: { UPDATE: "UPDATE" } };
    let classroomReads = 0;

    await withStubs([
      [User, "findByPk", async () => teacher],
      [sequelize, "transaction", async (callback) => callback(transaction)],
      [Classroom, "findByPk", async (id, options) => {
        classroomReads += 1;
        assert.equal(Number(id), 25);
        if (options) {
          assert.equal(options.transaction, transaction);
          assert.equal(options.lock, "UPDATE");
        }
        return classroom;
      }],
      [ClassroomMembership, "findOne", async (options) => {
        assert.deepEqual(options.where, { classroomId: 25, studentId: 7 });
        assert.equal(options.transaction, transaction);
        assert.equal(options.lock, "UPDATE");
        return membership;
      }],
      [ClassroomMembership, "count", async (options) => {
        assert.deepEqual(options.where, { classroomId: 25, status: "active" });
        assert.equal(options.transaction, transaction);
        return 1;
      }],
    ], async () => {
      const { response, payload } = await apiRequest("/api/teacher/classrooms/25/students/7", {
        method: "PATCH", token: authToken(4, "teacher"), body: { status: "active" },
      });
      assert.equal(response.status, 200);
      assert.equal(payload.message, "Student membership reactivated");
      assert.deepEqual(payload.membership, { classroomId: 25, studentId: 7, status: "active" });
      assert.equal(classroomReads, 2);
      assert.equal(membership.status, "active");
      if (joinedAt) assert.equal(membership.joinedAt, joinedAt);
      else assert.ok(membership.joinedAt instanceof Date);
    });
  }
});

test("teacher membership PATCH rejects reactivation at capacity without changing membership state", async () => {
  const teacher = activeUser({ id: 4, role: "teacher" });
  const classroom = { id: 25, teacherId: 4, isActive: true, maxStudents: 1 };
  const joinedAt = new Date("2026-09-01T08:00:00.000Z");
  const membership = {
    classroomId: 25, studentId: 7, status: "removed", joinedAt,
    save: async () => assert.fail("capacity rejection must not save"),
  };
  const transaction = { LOCK: { UPDATE: "UPDATE" } };

  await withStubs([
    [User, "findByPk", async () => teacher],
    [sequelize, "transaction", async (callback) => callback(transaction)],
    [Classroom, "findByPk", async () => classroom],
    [ClassroomMembership, "findOne", async () => membership],
    [ClassroomMembership, "count", async () => 1],
  ], async () => {
    const { response, payload } = await apiRequest("/api/teacher/classrooms/25/students/7", {
      method: "PATCH", token: authToken(4, "teacher"), body: { status: "active" },
    });
    assert.equal(response.status, 409);
    assert.equal(payload.message, "This classroom is already full");
    assert.equal(membership.status, "removed");
    assert.equal(membership.joinedAt, joinedAt);
  });
});

test("teacher membership PATCH keeps an active membership unchanged at capacity", async () => {
  const teacher = activeUser({ id: 4, role: "teacher" });
  const classroom = { id: 25, teacherId: 4, isActive: true, maxStudents: 1 };
  const joinedAt = new Date("2026-09-01T08:00:00.000Z");
  const updatedAt = new Date("2026-10-01T08:00:00.000Z");
  const membership = {
    classroomId: 25, studentId: 7, status: "active", joinedAt, updatedAt,
    save: async () => assert.fail("active no-op must not save"),
  };
  const transaction = { LOCK: { UPDATE: "UPDATE" } };
  let countCalls = 0;

  await withStubs([
    [User, "findByPk", async () => teacher],
    [sequelize, "transaction", async (callback) => callback(transaction)],
    [Classroom, "findByPk", async () => classroom],
    [ClassroomMembership, "findOne", async () => membership],
    [ClassroomMembership, "count", async () => { countCalls += 1; return 1; }],
  ], async () => {
    const { response } = await apiRequest("/api/teacher/classrooms/25/students/7", {
      method: "PATCH", token: authToken(4, "teacher"), body: { status: "active" },
    });
    assert.equal(response.status, 200);
    assert.equal(countCalls, 0);
    assert.equal(membership.joinedAt, joinedAt);
    assert.equal(membership.updatedAt, updatedAt);
  });
});

test("teacher membership PATCH rejects inactive classrooms before reading membership state", async () => {
  const teacher = activeUser({ id: 4, role: "teacher" });
  const classroom = { id: 25, teacherId: 4, isActive: false, maxStudents: 5 };
  const transaction = { LOCK: { UPDATE: "UPDATE" } };
  let membershipReads = 0;

  await withStubs([
    [User, "findByPk", async () => teacher],
    [sequelize, "transaction", async (callback) => callback(transaction)],
    [Classroom, "findByPk", async () => classroom],
    [ClassroomMembership, "findOne", async () => { membershipReads += 1; return null; }],
  ], async () => {
    const { response, payload } = await apiRequest("/api/teacher/classrooms/25/students/7", {
      method: "PATCH", token: authToken(4, "teacher"), body: { status: "active" },
    });
    assert.equal(response.status, 409);
    assert.equal(payload.message, "Classroom is inactive");
    assert.equal(membershipReads, 0);
  });
});

test("teacher membership PATCH preserves exact identity and missing-membership errors", async () => {
  const teacher = activeUser({ id: 4, role: "teacher" });
  const classroom = { id: 25, teacherId: 4, isActive: true, maxStudents: 5 };
  const transaction = { LOCK: { UPDATE: "UPDATE" } };

  await withStubs([
    [User, "findByPk", async () => teacher],
    [sequelize, "transaction", async (callback) => callback(transaction)],
    [Classroom, "findByPk", async () => classroom],
    [ClassroomMembership, "findOne", async (options) => {
      assert.deepEqual(options.where, { classroomId: 25, studentId: 999 });
      return null;
    }],
  ], async () => {
    const { response, payload } = await apiRequest("/api/teacher/classrooms/25/students/999", {
      method: "PATCH", token: authToken(4, "teacher"), body: { status: "active" },
    });
    assert.equal(response.status, 404);
    assert.equal(payload.message, "Classroom membership not found");
  });
});

test("teacher membership PATCH rechecks ownership under the classroom lock", async () => {
  const teacher = activeUser({ id: 4, role: "teacher" });
  const initiallyOwned = { id: 25, teacherId: 4, isActive: true, maxStudents: 5 };
  const lockedForeign = { ...initiallyOwned, teacherId: 99 };
  const transaction = { LOCK: { UPDATE: "UPDATE" } };
  let classroomReads = 0;
  let membershipReads = 0;

  await withStubs([
    [User, "findByPk", async () => teacher],
    [sequelize, "transaction", async (callback) => callback(transaction)],
    [Classroom, "findByPk", async () => {
      classroomReads += 1;
      return classroomReads === 1 ? initiallyOwned : lockedForeign;
    }],
    [ClassroomMembership, "findOne", async () => { membershipReads += 1; return null; }],
  ], async () => {
    const { response, payload } = await apiRequest("/api/teacher/classrooms/25/students/7", {
      method: "PATCH", token: authToken(4, "teacher"), body: { status: "active" },
    });
    assert.equal(response.status, 403);
    assert.equal(payload.message, "You are not allowed to update this classroom");
    assert.equal(membershipReads, 0);
  });
});

test("owner lists only pending classroom join requests with bounded deterministic pagination", async () => {
  const teacher = activeUser({ id: 4, role: "teacher" });
  const classroom = { id: 25, teacherId: 4, isActive: true };
  const rows = [{
    id: 81,
    classroomId: 25,
    studentId: 7,
    status: "pending",
    createdAt: new Date("2026-10-01T00:00:00Z"),
    joinedAt: new Date("2026-10-01T00:00:00Z"),
    student: {
      id: 7,
      firstName: "Ada",
      lastName: "Lovelace",
      username: "ada",
      email: "private@example.com",
      password: "private",
    },
  }];

  await withStubs([
    [User, "findByPk", async () => teacher],
    [Classroom, "findByPk", async () => classroom],
    [ClassroomMembership, "findAndCountAll", async (options) => {
      assert.deepEqual(options.where, { classroomId: 25, status: "pending" });
      assert.deepEqual(options.attributes, ["id", "classroomId", "studentId", "status"]);
      assert.deepEqual(options.order, [["id", "ASC"]]);
      assert.equal(options.limit, 2);
      assert.equal(options.offset, 2);
      assert.equal(options.include[0].as, "student");
      assert.deepEqual(options.include[0].attributes, ["id", "firstName", "lastName", "username"]);
      return { count: 5, rows };
    }],
  ], async () => {
    const { response, payload } = await apiRequest(
      "/api/teacher/classrooms/25/join-requests?page=2&limit=2",
      { token: authToken(4, "teacher") },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(payload, {
      total: 5,
      page: 2,
      limit: 2,
      totalPages: 3,
      requests: [{
        id: 81,
        classroomId: 25,
        studentId: 7,
        status: "pending",
        student: { id: 7, firstName: "Ada", lastName: "Lovelace", username: "ada" },
      }],
    });
  });
});

test("join-request listing denies unauthenticated students foreign teachers and foreign admins", async () => {
  const users = new Map([
    [1, activeUser({ id: 1, role: "student" })],
    [5, activeUser({ id: 5, role: "teacher" })],
    [7, activeUser({ id: 7, role: "admin" })],
  ]);
  let requestReads = 0;

  await withStubs([
    [User, "findByPk", async (id) => users.get(Number(id))],
    [Classroom, "findByPk", async () => ({ id: 25, teacherId: 4, isActive: true })],
    [ClassroomMembership, "findAndCountAll", async () => { requestReads += 1; return { count: 0, rows: [] }; }],
  ], async () => {
    const unauthenticated = await apiRequest("/api/teacher/classrooms/25/join-requests");
    assert.equal(unauthenticated.response.status, 401);

    const student = await apiRequest("/api/teacher/classrooms/25/join-requests", {
      token: authToken(1, "student"),
    });
    assert.equal(student.response.status, 403);

    for (const [id, role] of [[5, "teacher"], [7, "admin"]]) {
      const foreign = await apiRequest("/api/teacher/classrooms/25/join-requests", {
        token: authToken(id, role),
      });
      assert.equal(foreign.response.status, 403);
    }
    assert.equal(requestReads, 0);
  });
});

test("join-request listing strictly validates IDs page and limit", async () => {
  const teacher = activeUser({ id: 4, role: "teacher" });
  let classroomReads = 0;
  let requestReads = 0;

  await withStubs([
    [User, "findByPk", async () => teacher],
    [Classroom, "findByPk", async () => { classroomReads += 1; return { id: 25, teacherId: 4 }; }],
    [ClassroomMembership, "findAndCountAll", async () => { requestReads += 1; return { count: 0, rows: [] }; }],
  ], async () => {
    for (const path of [
      "/api/teacher/classrooms/0/join-requests",
      "/api/teacher/classrooms/-1/join-requests",
      "/api/teacher/classrooms/1.5/join-requests",
      "/api/teacher/classrooms/9007199254740992/join-requests",
      "/api/teacher/classrooms/25/join-requests?page=0",
      "/api/teacher/classrooms/25/join-requests?page=1.5",
      "/api/teacher/classrooms/25/join-requests?page=abc",
      "/api/teacher/classrooms/25/join-requests?page=9007199254740991&limit=100",
      "/api/teacher/classrooms/25/join-requests?limit=0",
      "/api/teacher/classrooms/25/join-requests?limit=101",
      "/api/teacher/classrooms/25/join-requests?limit=1.5",
    ]) {
      const { response } = await apiRequest(path, { token: authToken(4, "teacher") });
      assert.equal(response.status, 400, path);
    }
    assert.equal(classroomReads, 0);
    assert.equal(requestReads, 0);
  });
});

test("owner approves and rejects exact join requests through the decision service", async () => {
  const teacher = activeUser({ id: 4, role: "teacher" });
  const classroom = { id: 25, teacherId: 4, isActive: true };
  const calls = [];

  await withStubs([
    [User, "findByPk", async () => teacher],
    [Classroom, "findByPk", async () => classroom],
    [classroomMembershipDecisionService, "decidePendingMembership", async (input) => {
      calls.push(input);
      return {
        changed: true,
        decision: input.decision,
        membership: {
          id: 81,
          classroomId: input.classroomId,
          studentId: input.studentId,
          status: input.decision === "approve" ? "active" : "rejected",
          joinedAt: input.decision === "approve" ? new Date("2026-10-22T08:00:00Z") : null,
          updatedAt: new Date("2026-10-22T08:00:00Z"),
          student: { email: "must-not-leak@example.com" },
          dataValues: { secret: true },
        },
      };
    }],
  ], async () => {
    for (const decision of ["approve", "reject"]) {
      const { response, payload } = await apiRequest(
        "/api/teacher/classrooms/25/join-requests/7",
        { method: "PATCH", token: authToken(4, "teacher"), body: { decision } },
      );
      assert.equal(response.status, 200);
      assert.equal(payload.changed, true);
      assert.equal(payload.decision, decision);
      assert.equal(payload.membership.status, decision === "approve" ? "active" : "rejected");
      assert.deepEqual(Object.keys(payload.membership).sort(), [
        "classroomId", "id", "joinedAt", "status", "studentId", "updatedAt",
      ]);
    }
  });
  assert.deepEqual(calls, [
    { classroomId: 25, studentId: 7, teacherId: 4, decision: "approve" },
    { classroomId: 25, studentId: 7, teacherId: 4, decision: "reject" },
  ]);
});

test("join-request decisions deny foreign owners before calling the decision service", async () => {
  const users = new Map([
    [5, activeUser({ id: 5, role: "teacher" })],
    [7, activeUser({ id: 7, role: "admin" })],
  ]);
  let decisionCalls = 0;

  await withStubs([
    [User, "findByPk", async (id) => users.get(Number(id))],
    [Classroom, "findByPk", async () => ({ id: 25, teacherId: 4, isActive: true })],
    [classroomMembershipDecisionService, "decidePendingMembership", async () => { decisionCalls += 1; }],
  ], async () => {
    for (const [id, role] of [[5, "teacher"], [7, "admin"]]) {
      const { response } = await apiRequest("/api/teacher/classrooms/25/join-requests/7", {
        method: "PATCH", token: authToken(id, role), body: { decision: "approve" },
      });
      assert.equal(response.status, 403);
    }
    assert.equal(decisionCalls, 0);
  });
});

test("join-request decisions strictly validate IDs and preserve the service validation error", async () => {
  const teacher = activeUser({ id: 4, role: "teacher" });
  let classroomReads = 0;

  await withStubs([
    [User, "findByPk", async () => teacher],
    [Classroom, "findByPk", async () => { classroomReads += 1; return { id: 25, teacherId: 4 }; }],
  ], async () => {
    for (const path of [
      "/api/teacher/classrooms/0/join-requests/7",
      "/api/teacher/classrooms/25/join-requests/0",
      "/api/teacher/classrooms/25/join-requests/1.5",
      "/api/teacher/classrooms/25/join-requests/9007199254740992",
    ]) {
      const { response, payload } = await apiRequest(path, {
        method: "PATCH", token: authToken(4, "teacher"), body: { decision: "approve" },
      });
      assert.equal(response.status, 400);
      assert.equal(payload.code, "INVALID_CLASSROOM_MEMBERSHIP_DECISION");
    }
    assert.equal(classroomReads, 0);

    const invalidDecision = await apiRequest("/api/teacher/classrooms/25/join-requests/7", {
      method: "PATCH", token: authToken(4, "teacher"), body: { decision: "activate" },
    });
    assert.equal(invalidDecision.response.status, 400);
    assert.equal(invalidDecision.payload.code, "INVALID_CLASSROOM_MEMBERSHIP_DECISION");
    assert.equal(invalidDecision.payload.message, "Invalid classroom membership decision");
  });
});

test("join-request decision responses preserve idempotency and map established service errors", async () => {
  const teacher = activeUser({ id: 4, role: "teacher" });
  const classroom = { id: 25, teacherId: 4, isActive: true };
  const approvedAt = new Date("2026-10-20T08:00:00Z");
  const errors = [
    ["approve", 409, "CLASSROOM_MEMBERSHIP_DECISION_CONFLICT", "Classroom membership request has already been decided"],
    ["approve", 409, "CLASSROOM_CAPACITY_REACHED", "This classroom is already full"],
    ["approve", 409, "CLASSROOM_INACTIVE", "Classroom is inactive"],
    ["reject", 404, "CLASSROOM_MEMBERSHIP_REQUEST_NOT_FOUND", "Classroom membership request not found"],
  ];
  let behavior = "repeat";

  await withStubs([
    [User, "findByPk", async () => teacher],
    [Classroom, "findByPk", async () => classroom],
    [classroomMembershipDecisionService, "decidePendingMembership", async ({ decision }) => {
      if (behavior === "repeat") {
        return {
          changed: false,
          decision,
          membership: {
            id: 81, classroomId: 25, studentId: 7, status: "active",
            joinedAt: approvedAt, updatedAt: approvedAt,
          },
        };
      }
      const [, status, code, message] = errors[Number(behavior)];
      throw new classroomMembershipDecisionService.ClassroomMembershipDecisionError(status, code, message);
    }],
  ], async () => {
    const repeated = await apiRequest("/api/teacher/classrooms/25/join-requests/7", {
      method: "PATCH", token: authToken(4, "teacher"), body: { decision: "approve" },
    });
    assert.equal(repeated.response.status, 200);
    assert.equal(repeated.payload.changed, false);
    assert.equal(repeated.payload.membership.joinedAt, approvedAt.toISOString());
    assert.equal(repeated.payload.membership.updatedAt, approvedAt.toISOString());

    for (let index = 0; index < errors.length; index += 1) {
      behavior = String(index);
      const [decision, status, code, message] = errors[index];
      const result = await apiRequest("/api/teacher/classrooms/25/join-requests/7", {
        method: "PATCH", token: authToken(4, "teacher"), body: { decision },
      });
      assert.equal(result.response.status, status);
      assert.deepEqual(result.payload, { message, code });
    }
  });
});

test("teacher classwork API no longer creates modules or assignments", async () => {
  const teacher = activeUser({ id: 84, role: "teacher" });
  let createCalls = 0;
  await withStubs([
    [User, "findByPk", async () => teacher],
    [Classroom, "findByPk", async () => ({ id: 26, teacherId: teacher.id })],
    [ClassroomLesson, "create", async () => { createCalls += 1; }],
  ], async () => {
    for (const contentType of ["module", "assignment"]) {
      const { response, payload } = await apiRequest("/api/teacher/classrooms/26/lessons", {
        method: "POST",
        token: authToken(teacher.id, "teacher"),
        body: { title: `Blocked ${contentType}`, contentType },
      });
      assert.equal(response.status, 400);
      assert.match(payload.message, /can no longer be created/i);
    }
  });
  assert.equal(createCalls, 0);
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
    [sequelize, "transaction", transactionStub],
    [PublicTestimonialSubmission, "findAll", async () => []],
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

test("admin status deactivation suspends testimonials and reactivation preserves suspension", async () => {
  const admin = activeUser({ id: 17, username: "admin-seventeen", role: "admin" });
  const target = activeUser({ id: 18, username: "student-eighteen" });
  const submission = {
    id: 188,
    publicationSuspendedAt: null,
    publicationSuspensionReason: null,
    async update(values) { Object.assign(this, values); return this; },
  };
  let testimonialLocks = 0;

  await withStubs([
    [sequelize, "transaction", transactionStub],
    [PublicTestimonialSubmission, "findAll", async () => {
      testimonialLocks += 1;
      return [submission];
    }],
    [User, "findByPk", async (id, options) => {
      if (id === admin.id) return options?.attributes?.length === 1 ? { username: admin.username } : admin;
      return target;
    }],
    [AdminActivityLog, "create", async (values) => values],
  ], async () => {
    const deactivated = await apiRequest("/api/admin/users/18/status", {
      method: "PATCH",
      token: authToken(admin.id, "admin"),
      body: { status: "inactive" },
    });
    assert.equal(deactivated.response.status, 200);
    assert.equal(target.status, "inactive");
    assert.ok(submission.publicationSuspendedAt instanceof Date);
    assert.equal(submission.publicationSuspensionReason, "account_deactivated");
    const suspendedAt = submission.publicationSuspendedAt;

    const reactivated = await apiRequest("/api/admin/users/18/status", {
      method: "PATCH",
      token: authToken(admin.id, "admin"),
      body: { status: "active" },
    });
    assert.equal(reactivated.response.status, 200);
    assert.equal(target.status, "active");
    assert.equal(submission.publicationSuspendedAt, suspendedAt);
    assert.equal(testimonialLocks, 1);
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
      assert.equal(options.include, undefined);
      assert.equal(options.distinct, undefined);
      assert.deepEqual(options.order, [["createdAt", "DESC"], ["id", "DESC"]]);
      assert.equal(options.where.role, undefined);
      assert.equal(options.where.status[Op.ne], "archived");
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

test("admin classroom student filtering requires admin access, a valid classroom id, and the student role", async () => {
  const admin = activeUser({ id: 7, username: "admin", role: "admin" });
  const student = activeUser({ id: 9, username: "student-nine", role: "student" });
  let userQueryCalls = 0;
  let classroomLookupCalls = 0;

  await withStubs([
    [User, "findByPk", async (id) => id === admin.id ? admin : student],
    [User, "findAndCountAll", async () => {
      userQueryCalls += 1;
      return { count: 0, rows: [] };
    }],
    [Classroom, "findByPk", async () => {
      classroomLookupCalls += 1;
      return { id: 25, isActive: false };
    }],
  ], async () => {
    const unauthenticated = await apiRequest("/api/admin/users?role=student&classroomId=25");
    assert.equal(unauthenticated.response.status, 401);

    const unauthorized = await apiRequest("/api/admin/users?role=student&classroomId=25", {
      token: authToken(student.id, "student"),
    });
    assert.equal(unauthorized.response.status, 403);

    for (const classroomId of ["0", "-1", "1.5", "abc", "9007199254740992"]) {
      const result = await apiRequest(`/api/admin/users?role=student&classroomId=${classroomId}`, {
        token: authToken(admin.id, "admin"),
      });
      assert.equal(result.response.status, 400);
      assert.equal(result.payload.message, "Invalid classroom id");
    }

    for (const query of ["classroomId=25", "role=teacher&classroomId=25", "role=admin&classroomId=25"]) {
      const result = await apiRequest(`/api/admin/users?${query}`, {
        token: authToken(admin.id, "admin"),
      });
      assert.equal(result.response.status, 400);
      assert.equal(result.payload.message, "Invalid role filter");
    }
  });

  assert.equal(userQueryCalls, 0);
  assert.equal(classroomLookupCalls, 0);
});

test("admin classroom student filtering applies active membership scope before pagination", async () => {
  const admin = activeUser({ id: 7, username: "admin", role: "admin" });
  const matchingUsers = [
    activeUser({ id: 31, firstName: "Ada", username: "ada-one", status: "inactive" }),
    activeUser({ id: 30, firstName: "Ada", username: "ada-two", status: "inactive" }),
  ];
  let capturedOptions;

  await withStubs([
    [User, "findByPk", async () => admin],
    [Classroom, "findByPk", async (id, options) => {
      assert.equal(id, 25);
      assert.deepEqual(options.attributes, ["id"]);
      return { id: 25, isActive: false };
    }],
    [User, "findAndCountAll", async (options) => {
      capturedOptions = options;
      return { count: 3, rows: matchingUsers };
    }],
  ], async () => {
    const { response, payload } = await apiRequest(
      "/api/admin/users?role=student&classroomId=25&search=ada&status=inactive&page=2&limit=2",
      { token: authToken(admin.id, "admin") },
    );

    assert.equal(response.status, 200);
    assert.equal(payload.total, 3);
    assert.equal(payload.page, 2);
    assert.equal(payload.totalPages, 2);
    assert.deepEqual(payload.users.map((user) => user.id), [31, 30]);
  });

  assert.equal(capturedOptions.where.role, "student");
  assert.equal(capturedOptions.where.status, "inactive");
  assert.equal(capturedOptions.where[Op.or].length, 4);
  assert.equal(capturedOptions.limit, 2);
  assert.equal(capturedOptions.offset, 2);
  assert.equal(capturedOptions.distinct, true);
  assert.equal(capturedOptions.col, "id");
  assert.deepEqual(capturedOptions.order, [["createdAt", "DESC"], ["id", "DESC"]]);
  assert.equal(capturedOptions.include.length, 1);
  assert.equal(capturedOptions.include[0].model, ClassroomMembership);
  assert.equal(capturedOptions.include[0].as, "classroomMemberships");
  assert.equal(capturedOptions.include[0].required, true);
  assert.deepEqual(capturedOptions.include[0].attributes, []);
  assert.deepEqual(capturedOptions.include[0].where, { classroomId: 25, status: "active" });
});

test("admin classroom student filtering returns not found and shares its scope with CSV export", async () => {
  const admin = activeUser({ id: 7, username: "admin", role: "admin" });
  let listOptions;
  let exportOptions;

  await withStubs([
    [User, "findByPk", async () => admin],
    [Classroom, "findByPk", async (id) => id === 25 ? { id: 25, isActive: false } : null],
    [User, "findAndCountAll", async (options) => {
      listOptions = options;
      return { count: 1, rows: [activeUser({ id: 44, firstName: "CSV", lastName: "Student" })] };
    }],
    [User, "findAll", async (options) => {
      exportOptions = options;
      return [activeUser({ id: 44, firstName: "CSV", lastName: "Student" })];
    }],
  ], async () => {
    const missing = await apiRequest("/api/admin/users?role=student&classroomId=999", {
      token: authToken(admin.id, "admin"),
    });
    assert.equal(missing.response.status, 404);
    assert.equal(missing.payload.message, "Classroom not found");

    const list = await apiRequest("/api/admin/users?role=student&classroomId=25&search=csv&status=active", {
      token: authToken(admin.id, "admin"),
    });
    assert.equal(list.response.status, 200);

    const exportResponse = await fetch(
      `${baseUrl}/api/admin/users/export.csv?role=student&classroomId=25&search=csv&status=active`,
      { headers: { Authorization: `Bearer ${authToken(admin.id, "admin")}` } },
    );
    const csv = await exportResponse.text();
    assert.equal(exportResponse.status, 200);
    assert.match(exportResponse.headers.get("content-type"), /^text\/csv/);
    assert.match(csv, /CSV Student/);
  });

  for (const options of [listOptions, exportOptions]) {
    assert.equal(options.where.role, "student");
    assert.equal(options.where.status, "active");
    assert.equal(options.where[Op.or].length, 4);
    assert.deepEqual(options.order, [["createdAt", "DESC"], ["id", "DESC"]]);
    assert.deepEqual(options.include[0].where, { classroomId: 25, status: "active" });
    assert.equal(options.include[0].required, true);
  }
});

test("admin content list derives publication states and serializes authoritative owners minimally", async () => {
  const admin = activeUser({ id: 7, username: "admin", role: "admin" });
  const owner = {
    id: 81,
    firstName: "Ada",
    lastName: "Owner",
    username: "ada.owner",
    email: "private@example.test",
    password: "not-for-serialization",
  };
  const rows = [
    {
      id: 104, title: "Archived", contentType: "lesson", classroomId: 25,
      isPublished: true, publishAt: null, archivedAt: new Date("2026-10-01T00:00:00Z"),
      createdAt: new Date("2026-10-04T00:00:00Z"), owner,
      classroom: { id: 25, className: "Foundations", isActive: false, teacher: { id: 99, firstName: "Wrong", lastName: "Teacher", email: "wrong@example.test" } },
    },
    {
      id: 103, title: "Published", contentType: "module", classroomId: 25,
      isPublished: true, publishAt: null, archivedAt: null,
      createdAt: new Date("2026-10-03T00:00:00Z"), owner,
      classroom: { id: 25, className: "Foundations", isActive: true, teacher: { id: 99, firstName: "Wrong", lastName: "Teacher", email: "wrong@example.test" } },
    },
    {
      id: 102, title: "Scheduled reusable", contentType: "lesson", classroomId: null,
      isPublished: true, publishAt: new Date("2099-12-01T09:30:00Z"), archivedAt: null,
      createdAt: new Date("2026-10-02T00:00:00Z"), owner, classroom: null,
    },
    {
      id: 101, title: "Draft without owner", contentType: "assignment", classroomId: 25,
      isPublished: false, publishAt: null, archivedAt: null,
      createdAt: new Date("2026-10-01T00:00:00Z"), owner: null,
      classroom: { id: 25, className: "Foundations", isActive: true, teacher: null },
    },
  ].map((row) => ({ ...row, toJSON() { const { toJSON, ...value } = this; return value; } }));
  let capturedOptions;

  await withStubs([
    [User, "findByPk", async (id) => Number(id) === admin.id ? admin : activeUser({ id: Number(id), role: "student" })],
    [ClassroomLesson, "findAndCountAll", async (options) => {
      capturedOptions = options;
      return { count: rows.length, rows };
    }],
  ], async () => {
    const denied = await apiRequest("/api/admin/content", { token: authToken(8, "student") });
    assert.equal(denied.response.status, 403);

    const { response, payload } = await apiRequest(
      "/api/admin/content?type=lesson&published=true&search=owner&page=2&limit=2",
      { token: authToken(admin.id, "admin") },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(payload.content.map((item) => item.status), ["archived", "published", "scheduled", "draft"]);
    assert.deepEqual(payload.content[2].owner, {
      id: owner.id,
      firstName: owner.firstName,
      lastName: owner.lastName,
      username: owner.username,
    });
    assert.equal(payload.content[2].classroom, null);
    assert.equal(payload.content[3].owner, null);
    assert.equal(Object.hasOwn(payload.content[0].owner, "email"), false);
    assert.equal(Object.hasOwn(payload.content[0].owner, "password"), false);
    assert.equal(payload.content[0].archivedAt, "2026-10-01T00:00:00.000Z");
    assert.deepEqual({ total: payload.total, page: payload.page, limit: payload.limit, totalPages: payload.totalPages }, {
      total: 4, page: 2, limit: 2, totalPages: 2,
    });
  });

  assert.equal(capturedOptions.where.contentType, "lesson");
  assert.equal(capturedOptions.where.isPublished, true);
  assert.equal(capturedOptions.where[Op.or].length, 6);
  assert.equal(capturedOptions.limit, 2);
  assert.equal(capturedOptions.offset, 2);
  assert.equal(capturedOptions.distinct, true);
  assert.deepEqual(capturedOptions.order, [["createdAt", "DESC"], ["id", "DESC"]]);
  assert.ok(capturedOptions.attributes.includes("archivedAt"));
  const ownerInclude = capturedOptions.include.find((item) => item.as === "owner");
  assert.deepEqual(ownerInclude.attributes, ["id", "firstName", "lastName", "username"]);
});

test("admin content search uses the optional authoritative owner and composes before pagination", async () => {
  const admin = activeUser({ id: 7, username: "admin", role: "admin" });
  const owner = {
    id: 81,
    firstName: "Ada",
    lastName: "Owner",
    username: "ada.owner",
    email: "ada@example.test",
  };
  const rows = [
    {
      id: 201,
      title: "Reusable lesson",
      contentType: "lesson",
      isPublished: true,
      publishAt: null,
      archivedAt: null,
      owner,
      classroom: null,
    },
    {
      id: 202,
      title: "Direct lesson",
      contentType: "lesson",
      isPublished: true,
      publishAt: null,
      archivedAt: null,
      owner,
      classroom: {
        id: 25,
        className: "Foundations",
        isActive: true,
        teacher: { id: 99, firstName: "Different", lastName: "Teacher", email: "different@example.test" },
      },
    },
    {
      id: 203,
      title: "Ownerless title match",
      contentType: "lesson",
      isPublished: true,
      publishAt: null,
      archivedAt: null,
      owner: null,
      classroom: { id: 26, className: "Searchable classroom", isActive: true, teacher: null },
    },
  ].map((row) => ({ ...row, toJSON() { const { toJSON, ...value } = this; return value; } }));
  let capturedOptions;

  await withStubs([
    [User, "findByPk", async () => admin],
    [ClassroomLesson, "findAndCountAll", async (options) => {
      capturedOptions = options;
      return { count: 8, rows };
    }],
  ], async () => {
    const { response, payload } = await apiRequest(
      "/api/admin/content?search=AdA%40Example.Test&type=lesson&status=published&page=2&limit=3",
      { token: authToken(admin.id, "admin") },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(
      { total: payload.total, page: payload.page, limit: payload.limit, totalPages: payload.totalPages },
      { total: 8, page: 2, limit: 3, totalPages: 3 },
    );
    assert.deepEqual(payload.content[0].owner, {
      id: owner.id,
      firstName: owner.firstName,
      lastName: owner.lastName,
      username: owner.username,
    });
    assert.equal(Object.hasOwn(payload.content[0].owner, "email"), false);
    assert.equal(payload.content[2].owner, null);
  });

  assert.equal(capturedOptions.where.contentType, "lesson");
  assert.equal(capturedOptions.where.archivedAt, null);
  assert.equal(capturedOptions.where.isPublished, true);
  assert.equal(capturedOptions.limit, 3);
  assert.equal(capturedOptions.offset, 3);
  assert.equal(capturedOptions.distinct, true);
  assert.deepEqual(capturedOptions.order, [["createdAt", "DESC"], ["id", "DESC"]]);

  const searchConditions = capturedOptions.where[Op.or];
  assert.deepEqual(searchConditions.map((condition) => condition.attribute.args[0].col), [
    "ClassroomLessons.title",
    "classroom.className",
    "owner.firstName",
    "owner.lastName",
    "owner.username",
    "owner.email",
  ]);
  for (const condition of searchConditions) {
    assert.equal(condition.attribute.fn, "lower");
    assert.equal(condition.logic[Op.like], "%ada@example.test%");
  }
  assert.equal(searchConditions.some((condition) => condition.attribute.args[0].col === "classroom->teacher.email"), false);

  const ownerInclude = capturedOptions.include.find((item) => item.as === "owner");
  assert.equal(ownerInclude.required, false, "owner-less records remain eligible for title and classroom matches");
  assert.deepEqual(ownerInclude.attributes, ["id", "firstName", "lastName", "username"]);
});

test("admin content status filters match displayed publication states before pagination", async () => {
  const admin = activeUser({ id: 7, username: "admin", role: "admin" });
  const queries = [];
  await withStubs([
    [User, "findByPk", async () => admin],
    [ClassroomLesson, "findAndCountAll", async (options) => {
      queries.push(options);
      return { count: 41, rows: [] };
    }],
  ], async () => {
    for (const status of ["archived", "draft", "scheduled", "published"]) {
      const { response, payload } = await apiRequest(
        `/api/admin/content?status=${status}&search=scope&page=3&limit=10`,
        { token: authToken(admin.id, "admin") },
      );
      assert.equal(response.status, 200, status);
      assert.deepEqual({ total: payload.total, page: payload.page, limit: payload.limit, totalPages: payload.totalPages }, {
        total: 41, page: 3, limit: 10, totalPages: 5,
      });
    }
  });

  assert.equal(queries.length, 4);
  for (const options of queries) {
    assert.equal(options.limit, 10);
    assert.equal(options.offset, 20);
    assert.equal(options.where[Op.or].length, 6, "search remains composed with status filtering");
  }

  assert.equal(queries[0].where.archivedAt[Op.ne], null);
  assert.deepEqual({ archivedAt: queries[1].where.archivedAt, isPublished: queries[1].where.isPublished }, {
    archivedAt: null, isPublished: false,
  });
  assert.equal(queries[2].where.archivedAt, null);
  assert.equal(queries[2].where.isPublished, true);
  const scheduledBoundary = queries[2].where.publishAt[Op.gt];
  assert.ok(scheduledBoundary instanceof Date);
  assert.equal(derivePublicationStatus({ isPublished: true, publishAt: scheduledBoundary }, scheduledBoundary), "published");
  assert.equal(derivePublicationStatus({ isPublished: true, publishAt: new Date(scheduledBoundary.getTime() + 1) }, scheduledBoundary), "scheduled");

  assert.equal(queries[3].where.archivedAt, null);
  assert.equal(queries[3].where.isPublished, true);
  const publishedAlternatives = queries[3].where[Op.and][0][Op.or];
  assert.deepEqual(publishedAlternatives[0], { publishAt: null });
  const publishedBoundary = publishedAlternatives[1].publishAt[Op.lte];
  assert.ok(publishedBoundary instanceof Date);
  assert.equal(derivePublicationStatus({ isPublished: true, publishAt: publishedBoundary }, publishedBoundary), "published");
});

test("admin content status validation conflicts cleanly and legacy published filters remain compatible", async () => {
  const admin = activeUser({ id: 7, username: "admin", role: "admin" });
  const queries = [];
  await withStubs([
    [User, "findByPk", async () => admin],
    [ClassroomLesson, "findAndCountAll", async (options) => {
      queries.push(options);
      return { count: 0, rows: [] };
    }],
  ], async () => {
    const invalid = await apiRequest("/api/admin/content?status=unknown", { token: authToken(admin.id, "admin") });
    assert.equal(invalid.response.status, 400);
    assert.equal(invalid.payload.message, "Invalid content status");

    const conflict = await apiRequest("/api/admin/content?status=draft&published=false", { token: authToken(admin.id, "admin") });
    assert.equal(conflict.response.status, 400);
    assert.equal(conflict.payload.message, "Choose either status or published, not both");

    for (const published of ["true", "false"]) {
      const legacy = await apiRequest(`/api/admin/content?published=${published}`, { token: authToken(admin.id, "admin") });
      assert.equal(legacy.response.status, 200);
    }
  });

  assert.equal(queries.length, 2, "invalid and conflicting filters do not query content");
  assert.equal(queries[0].where.isPublished, true);
  assert.equal(queries[1].where.isPublished, false);
  assert.equal(Object.hasOwn(queries[0].where, "archivedAt"), false, "legacy filter keeps archived compatibility");
});

test("admin built-in lesson catalogue and detail expose canonical read-only contracts without student access services", async () => {
  const admin = activeUser({ id: 7, username: "admin", role: "admin" });
  let membershipCalls = 0;
  let progressionCalls = 0;
  await withStubs([
    [User, "findByPk", async () => admin],
    [studentClassService, "requireExactActiveMembership", async () => { membershipCalls += 1; throw new Error("student membership must not run"); }],
    [lessonProgressionService, "assertModuleAccessAllowed", async () => { progressionCalls += 1; throw new Error("student progression must not run"); }],
  ], async () => {
    const catalogueResult = await apiRequest("/api/admin/built-in-lessons", { token: authToken(admin.id, "admin") });
    assert.equal(catalogueResult.response.status, 200);
    assert.deepEqual(Object.keys(catalogueResult.payload), ["schemaVersion", "contentRevision", "lessons", "mode"]);
    assert.equal(catalogueResult.payload.mode, "read-only");
    assert.deepEqual(catalogueResult.payload.lessons.map((lesson) => lesson.lessonKey), [
      "tutorial", "arrays", "functions", "functions-with-arrays", "final",
    ]);
    assert.deepEqual(catalogueResult.payload.lessons.map((lesson) => lesson.displayOrder), [1, 2, 3, 4, 5]);
    assert.deepEqual(catalogueResult.payload.lessons.map((lesson) => lesson.sectionCount), [9, 11, 11, 10, 10]);
    for (const lesson of catalogueResult.payload.lessons) {
      assert.deepEqual(Object.keys(lesson), [
        "lessonKey", "title", "eyebrow", "description", "displayOrder", "sectionCount",
      ]);
    }

    const detailResult = await apiRequest("/api/admin/built-in-lessons/arrays", { token: authToken(admin.id, "admin") });
    assert.equal(detailResult.response.status, 200);
    assert.deepEqual(Object.keys(detailResult.payload), ["schemaVersion", "contentRevision", "lesson", "mode"]);
    assert.equal(detailResult.payload.mode, "read-only");
    assert.equal(detailResult.payload.lesson.title, "Arrays");
    assert.equal(
      catalogueResult.payload.lessons.find((lesson) => lesson.lessonKey === "arrays").title,
      detailResult.payload.lesson.title,
    );
    assert.deepEqual(
      { ...detailResult.payload, mode: undefined },
      { ...builtInLessonContentService.serializeBuiltInLesson(builtInLessonContentService.getBuiltInLessonContent("arrays")), mode: undefined },
    );
    const blocks = detailResult.payload.lesson.sections.flatMap((section) => section.blocks);
    const practice = blocks.find((block) => block.type === "practice");
    const check = blocks.find((block) => block.type === "check");
    assert.equal(typeof practice.solution, "string");
    assert.equal(typeof practice.expectedOutput, "string");
    assert.equal(Number.isSafeInteger(check.answer), true);
    assert.equal(typeof check.feedback, "string");
  });

  assert.equal(membershipCalls, 0);
  assert.equal(progressionCalls, 0);
});

test("admin built-in lesson routes enforce admin authorization and distinguish malformed from unsupported keys", async () => {
  await withStubs([
    [User, "findByPk", async (id) => activeUser({
      id: Number(id),
      role: Number(id) === 7 ? "admin" : Number(id) === 8 ? "student" : "teacher",
    })],
  ], async () => {
    const unauthenticated = await apiRequest("/api/admin/built-in-lessons");
    assert.equal(unauthenticated.response.status, 401);

    for (const [id, role] of [[8, "student"], [9, "teacher"]]) {
      const denied = await apiRequest("/api/admin/built-in-lessons", { token: authToken(id, role) });
      assert.equal(denied.response.status, 403);
      assert.deepEqual(denied.payload, { message: "You are not allowed to access this resource" });
    }

    for (const lessonKey of ["Arrays", "arrays_1", "-arrays", "arrays-"]) {
      const malformed = await apiRequest(`/api/admin/built-in-lessons/${lessonKey}`, { token: authToken(7, "admin") });
      assert.equal(malformed.response.status, 400, lessonKey);
      assert.deepEqual(malformed.payload, { code: "INVALID_LESSON_KEY", message: "Invalid lesson key" });
    }

    const unsupported = await apiRequest("/api/admin/built-in-lessons/unknown-lesson", { token: authToken(7, "admin") });
    assert.equal(unsupported.response.status, 404);
    assert.deepEqual(unsupported.payload, {
      code: "BUILT_IN_LESSON_NOT_FOUND",
      message: "Built-in lesson was not found",
    });
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

test("admin role changes are unavailable and deletion remains audited", async () => {
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
    assert.equal(changed.response.status, 404);
    assert.equal(target.role, "student");
    assert.equal(auditRows.length, 0);

    const demoted = await apiRequest("/api/admin/users/8/role", {
      method: "PATCH", token: authToken(7, "admin"), body: { role: "student" },
    });
    assert.equal(demoted.response.status, 404);
    assert.equal(target.role, "student");
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
  const submission = {
    id: 91,
    publicationSuspendedAt: null,
    publicationSuspensionReason: null,
    async update(values) { Object.assign(this, values); return this; },
  };
  await withStubs([
    [sequelize, "transaction", transactionStub],
    [PublicTestimonialSubmission, "findAll", async (options) => {
      assert.equal(options.where.authorUserId, target.id);
      assert.equal(options.where.withdrawnAt, null);
      return [submission];
    }],
    [User, "findByPk", async (id, options) => id === 7 ? (options?.attributes?.length === 1 ? { username: admin.username } : admin) : target],
    [AdminActivityLog, "create", async (values) => { auditRows.push(values); return values; }],
  ], async () => {
    const archived = await apiRequest("/api/admin/users/8/archive", { method: "POST", token: authToken(7, "admin"), body: {} });
    assert.equal(archived.response.status, 200);
    assert.equal(target.status, "archived");
    assert.equal(target.tokenVersion, 3);
    assert.ok(submission.publicationSuspendedAt instanceof Date);
    assert.equal(submission.publicationSuspensionReason, "account_deactivated");
    assert.equal(auditRows.at(-1).activity, "USER_ARCHIVED");

    const restored = await apiRequest("/api/admin/users/8/restore", { method: "POST", token: authToken(7, "admin"), body: {} });
    assert.equal(restored.response.status, 200);
    assert.equal(target.status, "active");
    assert.equal(target.tokenVersion, 4);
    assert.ok(submission.publicationSuspendedAt instanceof Date);
    assert.equal(submission.publicationSuspensionReason, "account_deactivated");
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

test("pending membership and active membership elsewhere do not authorize exact-classroom content", async () => {
  const studentId = 42;
  const memberships = [{ studentId, classroomId: 7, status: "pending" }];
  let exactChecks = 0;

  await withStubs([
    [User, "findByPk", async () => activeUser({ id: studentId, role: "student" })],
    [ClassroomMembership, "findOne", async (options) => {
      exactChecks += 1;
      assert.deepEqual(options.where, {
        studentId,
        classroomId: 7,
        status: "active",
      });
      return memberships.find((membership) => (
        membership.studentId === options.where.studentId
        && membership.classroomId === options.where.classroomId
        && membership.status === options.where.status
      )) ?? null;
    }],
  ], async () => {
    const pendingOnly = await apiRequest(
      "/api/classrooms/7/built-in-lessons/tutorial/content",
      { token: authToken(studentId, "student") },
    );
    assert.equal(pendingOnly.response.status, 403);
    assert.equal(pendingOnly.payload.code, "FORBIDDEN");

    memberships.push({ studentId, classroomId: 8, status: "active" });
    const activeElsewhere = await apiRequest(
      "/api/classrooms/7/built-in-lessons/tutorial/content",
      { token: authToken(studentId, "student") },
    );
    assert.equal(activeElsewhere.response.status, 403);
    assert.equal(activeElsewhere.payload.code, "FORBIDDEN");
    assert.equal(exactChecks, 2);
  });
});

test("protected built-in lesson content route is registered without colliding with classroom routes", async () => {
  const user = activeUser({ id: 42, role: "student" });
  let exactMembershipReads = 0;
  await withStubs([
    [User, "findByPk", async () => user],
    [ClassroomMembership, "findOne", async () => {
      exactMembershipReads += 1;
      return {
        id: 301,
        classroomId: 7,
        studentId: 42,
        status: "active",
        classroom: { id: 7, isActive: true },
      };
    }],
    [ClassroomMembership, "findAll", async () => []],
    [LessonAssessment, "findAll", async () => []],
    [AssessmentAttempt, "findAll", async () => assert.fail("tutorial must not query attempts")],
    [UserProgress, "findAll", async () => []],
    [LevelContentOverride, "findAll", async () => []],
  ], async () => {
    const authorized = await apiRequest(
      "/api/classrooms/7/built-in-lessons/tutorial/content",
      { token: authToken(42) },
    );
    assert.equal(authorized.response.status, 200);
    assert.deepEqual(Object.keys(authorized.payload), ["schemaVersion", "contentRevision", "lesson"]);
    assert.equal(authorized.payload.lesson.lessonKey, "tutorial");
    assert.equal(authorized.response.headers.get("cache-control"), "private, no-store, max-age=0");
    assert.match(authorized.response.headers.get("vary"), /Authorization/i);
    assert.equal(exactMembershipReads, 1);

    const invalidClassroom = await apiRequest(
      "/api/classrooms/0/built-in-lessons/tutorial/content",
      { token: authToken(42) },
    );
    assert.equal(invalidClassroom.response.status, 400);
    assert.equal(invalidClassroom.payload.code, "INVALID_CLASSROOM_ID");

    const invalidLesson = await apiRequest(
      "/api/classrooms/7/built-in-lessons/Arrays/content",
      { token: authToken(42) },
    );
    assert.equal(invalidLesson.response.status, 400);
    assert.equal(invalidLesson.payload.code, "INVALID_LESSON_KEY");

    const traversal = await apiRequest(
      "/api/classrooms/7/built-in-lessons/..%2Ftutorial/content",
      { token: authToken(42) },
    );
    assert.equal(traversal.response.status, 400);
    assert.equal(traversal.payload.code, "INVALID_LESSON_KEY");
    assert.equal(exactMembershipReads, 1, "invalid paths must not reach membership or content access");

    const existingClassroomRoute = await apiRequest("/api/classrooms/me", {
      token: authToken(42),
    });
    assert.equal(existingClassroomRoute.response.status, 200);
    assert.equal(existingClassroomRoute.payload.hasActiveMembership, false);
  });
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
