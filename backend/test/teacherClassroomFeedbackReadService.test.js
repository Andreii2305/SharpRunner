const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  TeacherClassroomFeedbackReadError,
  createTeacherClassroomFeedbackReadService,
} = require("../src/services/teacherClassroomFeedbackReadService");

const makeHarness = ({
  classroom = {
    id: 7,
    teacherId: 5,
    className: "Algorithms",
    section: "A",
    schoolYear: "2026-2027",
    isActive: true,
  },
  rows = [],
  count = rows.length,
} = {}) => {
  const state = { classroom, rows, count };
  const calls = { classroom: [], feedback: [] };
  const models = {
    Classroom: {
      findByPk: async (id, options) => {
        calls.classroom.push({ id, options });
        return Number(id) === Number(state.classroom?.id) ? state.classroom : null;
      },
    },
    StudentClassroomFeedback: {
      findAndCountAll: async (options) => {
        calls.feedback.push(options);
        return { count: state.count, rows: state.rows };
      },
    },
    User: { name: "User" },
  };
  return {
    state,
    calls,
    service: createTeacherClassroomFeedbackReadService({ models }),
  };
};

const list = (service, overrides = {}) => service.listTeacherClassroomFeedback({
  actorId: 5,
  classroomId: 7,
  page: 1,
  limit: 20,
  offset: 0,
  ...overrides,
});

test("owning teacher receives database-paginated feedback with optional minimal student identity", async () => {
  const h = makeHarness({
    count: "3",
    rows: [{
      id: 12,
      classroomId: 7,
      studentId: 51,
      message: "More worked examples would help.",
      idempotencyKey: "private_key",
      createdAt: new Date("2026-10-25T10:00:00.000Z"),
      updatedAt: new Date("2026-10-25T10:00:00.000Z"),
      student: {
        id: 51,
        firstName: "Ada",
        lastName: "Learner",
        username: "ada",
        email: "hidden@example.test",
      },
      get({ plain }) { assert.equal(plain, true); return { ...this }; },
    }, {
      id: 11,
      classroomId: 7,
      message: "Historical feedback",
      createdAt: new Date("2026-10-24T10:00:00.000Z"),
      student: null,
    }],
  });

  const result = await list(h.service, { page: 2, limit: 2, offset: 2 });

  assert.deepEqual(result, {
    feedback: [{
      id: 12,
      classroomId: 7,
      message: "More worked examples would help.",
      createdAt: new Date("2026-10-25T10:00:00.000Z"),
      student: { id: 51, firstName: "Ada", lastName: "Learner", username: "ada" },
    }, {
      id: 11,
      classroomId: 7,
      message: "Historical feedback",
      createdAt: new Date("2026-10-24T10:00:00.000Z"),
      student: null,
    }],
    page: 2,
    limit: 2,
    total: 3,
    totalPages: 2,
  });
  assert.deepEqual(h.calls.classroom[0].options.attributes, ["id", "teacherId"]);
  const query = h.calls.feedback[0];
  assert.deepEqual(query.where, { classroomId: 7 });
  assert.deepEqual(query.attributes, ["id", "classroomId", "message", "createdAt"]);
  assert.deepEqual(query.order, [["createdAt", "DESC"], ["id", "DESC"]]);
  assert.equal(query.limit, 2);
  assert.equal(query.offset, 2);
  assert.equal(query.distinct, true);
  assert.equal(query.include[0].required, false);
  assert.deepEqual(query.include[0].attributes, ["id", "firstName", "lastName", "username"]);
});

test("ownership is resolved before feedback reads and follows current ownership", async () => {
  const h = makeHarness();
  await assert.rejects(
    list(h.service, { actorId: 6 }),
    (error) => error instanceof TeacherClassroomFeedbackReadError
      && error.status === 403 && error.code === "FORBIDDEN",
  );
  assert.equal(h.calls.feedback.length, 0);

  h.state.classroom.teacherId = 6;
  await list(h.service, { actorId: 6 });
  assert.equal(h.calls.feedback.length, 1);
  await assert.rejects(list(h.service, { actorId: 5 }), { code: "FORBIDDEN" });
  assert.equal(h.calls.feedback.length, 1);
});

test("archived classrooms and historical feedback do not require current membership or student state", async () => {
  const h = makeHarness({
    classroom: { id: 7, teacherId: 5, isActive: false },
    rows: [{
      id: 4,
      classroomId: 7,
      message: "Saved before removal",
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      student: { id: 51, firstName: "Former", lastName: "Student", username: "former" },
    }],
  });
  const result = await list(h.service);
  assert.equal(result.feedback.length, 1);
  assert.equal(result.feedback[0].student.username, "former");
  assert.deepEqual(Object.keys(h.calls), ["classroom", "feedback"]);
});

test("missing classrooms and invalid service inputs fail before feedback reads", async () => {
  const missing = makeHarness({ classroom: null });
  await assert.rejects(list(missing.service), {
    status: 404,
    code: "CLASSROOM_NOT_FOUND",
    message: "Classroom was not found",
  });
  assert.equal(missing.calls.feedback.length, 0);

  const h = makeHarness();
  for (const overrides of [
    { actorId: 0 },
    { classroomId: 1.5 },
    { page: 0 },
    { limit: 101 },
    { offset: 1 },
  ]) {
    await assert.rejects(list(h.service, overrides), TypeError);
  }
  assert.equal(h.calls.classroom.length, 0);
  assert.equal(h.calls.feedback.length, 0);
});

test("empty and out-of-range pages retain authoritative totals", async () => {
  const h = makeHarness({ rows: [], count: 41 });
  const result = await list(h.service, { page: 4, limit: 20, offset: 60 });
  assert.deepEqual(result, {
    feedback: [],
    page: 4,
    limit: 20,
    total: 41,
    totalPages: 3,
  });
});
