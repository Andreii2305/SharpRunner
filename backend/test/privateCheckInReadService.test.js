const assert = require("node:assert/strict");
const { describe, test } = require("node:test");
const { Op } = require("sequelize");

const {
  createPrivateCheckInReadService,
} = require("../src/services/privateCheckInReadService");

const makeCheckIn = (id, createdAt, overrides = {}) => ({
  id,
  senderRole: "teacher",
  message: `Message ${id}`,
  createdAt,
  sender: {
    id: 41,
    firstName: "Terry",
    lastName: "Teacher",
    username: "terry",
    email: "private@example.test",
  },
  classroom: {
    id: 7,
    className: "Programming 1",
    section: "A",
    schoolYear: "2026-2027",
    isActive: false,
    classCode: "SECRET",
  },
  ...overrides,
});

const createHarness = ({ rows = [], aggregate = { total: "0", unreadTotal: "0" }, viewed = [] } = {}) => {
  const calls = { messages: [], aggregate: [], views: [] };
  const TeacherStudentCheckIn = {
    async findAll(options) {
      calls.messages.push(options);
      return rows;
    },
  };
  const UserNotificationView = {
    async findAll(options) {
      calls.views.push(options);
      return viewed;
    },
  };
  const database = {
    async query(sql, options) {
      calls.aggregate.push({ sql, options });
      return [aggregate];
    },
  };
  const service = createPrivateCheckInReadService({
    database,
    models: { TeacherStudentCheckIn, UserNotificationView, User: {}, Classroom: {} },
  });
  return { service, calls };
};

describe("private check-in recipient listing service", () => {
  test("returns a bounded newest-first page with minimal optional associations and canonical read state", async () => {
    const rows = [
      makeCheckIn(12, "2026-10-25T10:00:00.000Z"),
      makeCheckIn(11, "2026-10-25T10:00:00.000Z", { senderRole: "admin" }),
      makeCheckIn(10, "2026-10-24T10:00:00.000Z", { sender: null, classroom: null }),
      makeCheckIn(9, "2026-10-23T10:00:00.000Z"),
      makeCheckIn(8, "2026-10-22T10:00:00.000Z"),
      makeCheckIn(7, "2026-10-21T10:00:00.000Z"),
    ];
    const { service, calls } = createHarness({
      rows,
      aggregate: { total: "27", unreadTotal: "19" },
      viewed: [{ notificationKey: "check-in-11" }],
    });

    const result = await service.listPrivateCheckIns({
      studentId: 51,
      page: 2,
      limit: 6,
      offset: 6,
    });

    assert.deepEqual(result, {
      checkIns: [
        {
          id: "check-in-12",
          senderRole: "teacher",
          sender: { id: 41, firstName: "Terry", lastName: "Teacher", username: "terry" },
          classroom: { id: 7, className: "Programming 1", section: "A", schoolYear: "2026-2027", isActive: false },
          message: "Message 12",
          createdAt: "2026-10-25T10:00:00.000Z",
          isRead: false,
        },
        {
          id: "check-in-11",
          senderRole: "admin",
          sender: { id: 41, firstName: "Terry", lastName: "Teacher", username: "terry" },
          classroom: { id: 7, className: "Programming 1", section: "A", schoolYear: "2026-2027", isActive: false },
          message: "Message 11",
          createdAt: "2026-10-25T10:00:00.000Z",
          isRead: true,
        },
        {
          id: "check-in-10",
          senderRole: "teacher",
          sender: null,
          classroom: null,
          message: "Message 10",
          createdAt: "2026-10-24T10:00:00.000Z",
          isRead: false,
        },
        ...rows.slice(3).map((row) => ({
          id: `check-in-${row.id}`,
          senderRole: "teacher",
          sender: { id: 41, firstName: "Terry", lastName: "Teacher", username: "terry" },
          classroom: { id: 7, className: "Programming 1", section: "A", schoolYear: "2026-2027", isActive: false },
          message: row.message,
          createdAt: row.createdAt,
          isRead: false,
        })),
      ],
      page: 2,
      limit: 6,
      total: 27,
      totalPages: 5,
      unreadTotal: 19,
    });

    assert.deepEqual(calls.messages[0].where, { recipientStudentId: 51 });
    assert.deepEqual(calls.messages[0].attributes, ["id", "senderRole", "message", "createdAt"]);
    assert.deepEqual(calls.messages[0].order, [["createdAt", "DESC"], ["id", "DESC"]]);
    assert.equal(calls.messages[0].limit, 6);
    assert.equal(calls.messages[0].offset, 6);
    assert.equal(calls.messages[0].include[0].required, false);
    assert.deepEqual(calls.messages[0].include[0].attributes, ["id", "firstName", "lastName", "username"]);
    assert.equal(calls.messages[0].include[1].required, false);
    assert.deepEqual(calls.messages[0].include[1].attributes, ["id", "className", "section", "schoolYear", "isActive"]);
    assert.equal(calls.aggregate[0].options.replacements.studentId, 51);
    assert.match(calls.aggregate[0].sql, /views\."userId" = :studentId/);
    assert.match(calls.aggregate[0].sql, /views\."notificationKey" = CONCAT\('check-in-', check_in\."id"::text\)/);
    assert.match(calls.aggregate[0].sql, /check_in\."recipientStudentId" = :studentId/);
    assert.deepEqual(calls.views[0].where.userId, 51);
    assert.deepEqual(calls.views[0].where.notificationKey[Op.in], rows.map((row) => `check-in-${row.id}`));
    assert.equal(calls.messages.length + calls.aggregate.length + calls.views.length, 3);
  });

  test("empty and out-of-range pages return numeric metadata without loading unlimited IDs", async () => {
    const { service, calls } = createHarness({ aggregate: { total: 3n, unreadTotal: 2n } });
    const result = await service.listPrivateCheckIns({ studentId: 51, page: 4, limit: 2, offset: 6 });

    assert.deepEqual(result, {
      checkIns: [], page: 4, limit: 2, total: 3, totalPages: 2, unreadTotal: 2,
    });
    assert.equal(calls.messages.length, 1);
    assert.equal(calls.aggregate.length, 1);
    assert.equal(calls.views.length, 0);
  });

  test("query count stays constant as page size grows", async () => {
    for (const size of [1, 40]) {
      const rows = Array.from({ length: size }, (_, index) => makeCheckIn(index + 1, "2026-10-25T10:00:00.000Z"));
      const { service, calls } = createHarness({ rows, aggregate: { total: String(size), unreadTotal: String(size) } });
      await service.listPrivateCheckIns({ studentId: 51, page: 1, limit: size, offset: 0 });
      assert.equal(calls.messages.length + calls.aggregate.length + calls.views.length, 3);
    }
  });
});
