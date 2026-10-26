const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  createStudentClassroomFeedbackReadService,
} = require("../src/services/studentClassroomFeedbackReadService");

const makeHarness = ({ rows = [] } = {}) => {
  const calls = [];
  const models = {
    StudentClassroomFeedback: {
      findAndCountAll: async (options) => {
        calls.push(options);
        const matching = rows.filter((row) => row.studentId === options.where.studentId);
        const sorted = [...matching].sort((left, right) => (
          new Date(right.createdAt) - new Date(left.createdAt) || right.id - left.id
        ));
        return {
          count: String(matching.length),
          rows: sorted.slice(options.offset, options.offset + options.limit),
        };
      },
    },
    Classroom: { name: "Classroom" },
  };
  return {
    calls,
    service: createStudentClassroomFeedbackReadService({ models }),
  };
};

const list = (service, overrides = {}) => service.listStudentClassroomFeedback({
  studentId: 51,
  page: 1,
  limit: 20,
  offset: 0,
  ...overrides,
});

test("student history queries only the authenticated student and serializes current classroom fields", async () => {
  const h = makeHarness({
    rows: [{
      id: 12,
      studentId: 51,
      classroomId: 8,
      message: "Newer feedback",
      idempotencyKey: "hidden_key",
      createdAt: new Date("2026-10-25T10:00:00.000Z"),
      updatedAt: new Date("2026-10-25T10:00:00.000Z"),
      classroom: {
        id: 8,
        teacherId: 5,
        className: "Algorithms",
        section: "B",
        schoolYear: "2026-2027",
        isActive: false,
        classCode: "SECRET",
      },
    }, {
      id: 11,
      studentId: 51,
      classroomId: 7,
      message: "Same-time lower id",
      createdAt: new Date("2026-10-25T10:00:00.000Z"),
      classroom: null,
    }, {
      id: 99,
      studentId: 52,
      classroomId: 8,
      message: "Another student's feedback",
      createdAt: new Date("2026-10-26T10:00:00.000Z"),
      classroom: { id: 8, className: "Algorithms" },
    }],
  });

  const result = await list(h.service);

  assert.deepEqual(result, {
    feedback: [{
      id: 12,
      classroomId: 8,
      classroom: {
        id: 8,
        className: "Algorithms",
        section: "B",
        schoolYear: "2026-2027",
        isActive: false,
      },
      message: "Newer feedback",
      createdAt: new Date("2026-10-25T10:00:00.000Z"),
    }, {
      id: 11,
      classroomId: 7,
      classroom: null,
      message: "Same-time lower id",
      createdAt: new Date("2026-10-25T10:00:00.000Z"),
    }],
    page: 1,
    limit: 20,
    total: 2,
    totalPages: 1,
  });
  const query = h.calls[0];
  assert.deepEqual(query.where, { studentId: 51 });
  assert.deepEqual(query.attributes, ["id", "classroomId", "message", "createdAt"]);
  assert.deepEqual(query.order, [["createdAt", "DESC"], ["id", "DESC"]]);
  assert.equal(query.include[0].required, false);
  assert.deepEqual(query.include[0].attributes, [
    "id", "className", "section", "schoolYear", "isActive",
  ]);
  assert.equal("idempotencyKey" in result.feedback[0], false);
  assert.equal("studentId" in result.feedback[0], false);
  assert.equal("teacherId" in result.feedback[0].classroom, false);
  assert.equal("classCode" in result.feedback[0].classroom, false);
});

test("history remains available without membership checks and for archived or missing classrooms", async () => {
  const h = makeHarness({
    rows: [{
      id: 2,
      studentId: 51,
      classroomId: 7,
      message: "Archived history",
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      classroom: { id: 7, className: "Old class", section: "A", schoolYear: "2025", isActive: false },
    }, {
      id: 1,
      studentId: 51,
      classroomId: 6,
      message: "Missing classroom history",
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      classroom: null,
    }],
  });
  const result = await list(h.service);
  assert.equal(result.feedback.length, 2);
  assert.equal(result.feedback[0].classroom.isActive, false);
  assert.equal(result.feedback[1].classroom, null);
  assert.deepEqual(Object.keys(h.calls[0].where), ["studentId"]);
});

test("database pagination preserves authoritative totals for empty and out-of-range pages", async () => {
  const rows = Array.from({ length: 41 }, (_, index) => ({
    id: index + 1,
    studentId: 51,
    classroomId: 7,
    message: `Feedback ${index + 1}`,
    createdAt: new Date(2026, 0, index + 1),
    classroom: null,
  }));
  const h = makeHarness({ rows });
  const result = await list(h.service, { page: 4, limit: 20, offset: 60 });
  assert.deepEqual(result, {
    feedback: [], page: 4, limit: 20, total: 41, totalPages: 3,
  });
  assert.equal(h.calls[0].limit, 20);
  assert.equal(h.calls[0].offset, 60);
  assert.equal(h.calls[0].distinct, true);
});

test("invalid service pagination is rejected before querying", async () => {
  const h = makeHarness();
  for (const overrides of [
    { studentId: 0 },
    { page: 0 },
    { limit: 101 },
    { offset: 1 },
  ]) {
    await assert.rejects(list(h.service, overrides), TypeError);
  }
  assert.equal(h.calls.length, 0);
});
