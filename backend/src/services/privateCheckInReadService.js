const { Op, QueryTypes } = require("sequelize");
const sequelize = require("../config/database");
const TeacherStudentCheckIn = require("../models/TeacherStudentCheckIn");
const UserNotificationView = require("../models/UserNotificationView");
const User = require("../models/User");
const Classroom = require("../models/Classroom");

const CHECK_IN_KEY_PREFIX = "check-in-";

const toPlain = (record) => (
  record && typeof record.get === "function" ? record.get({ plain: true }) : record
);

const normalizeCount = (value) => {
  const numeric = typeof value === "bigint" ? value : BigInt(String(value ?? "0"));
  if (numeric < 0n || numeric > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("Private check-in count exceeds the supported range");
  }
  return Number(numeric);
};

const validateListInput = ({ studentId, page, limit, offset }) => {
  if (![studentId, page, limit].every(Number.isSafeInteger)
    || studentId <= 0 || page <= 0 || limit <= 0 || limit > 100
    || !Number.isSafeInteger(offset) || offset < 0
    || offset !== (page - 1) * limit) {
    throw new TypeError("Invalid private check-in listing input");
  }
};

const createPrivateCheckInReadService = ({
  database = sequelize,
  models = { TeacherStudentCheckIn, UserNotificationView, User, Classroom },
} = {}) => {
  const listPrivateCheckIns = async ({ studentId, page, limit, offset }) => {
    validateListInput({ studentId, page, limit, offset });

    const [messageRows, aggregateRows] = await Promise.all([
      models.TeacherStudentCheckIn.findAll({
        where: { recipientStudentId: studentId },
        attributes: ["id", "senderRole", "message", "createdAt"],
        include: [
          {
            model: models.User,
            as: "sender",
            attributes: ["id", "firstName", "lastName", "username"],
            required: false,
          },
          {
            model: models.Classroom,
            as: "classroom",
            attributes: ["id", "className", "section", "schoolYear", "isActive"],
            required: false,
          },
        ],
        order: [["createdAt", "DESC"], ["id", "DESC"]],
        limit,
        offset,
      }),
      database.query(`
        SELECT
          COUNT(*)::bigint AS "total",
          COUNT(*) FILTER (WHERE views."id" IS NULL)::bigint AS "unreadTotal"
        FROM "TeacherStudentCheckIns" AS check_in
        LEFT JOIN "UserNotificationViews" AS views
          ON views."userId" = :studentId
          AND views."notificationKey" = CONCAT('check-in-', check_in."id"::text)
        WHERE check_in."recipientStudentId" = :studentId
      `, {
        replacements: { studentId },
        type: QueryTypes.SELECT,
      }),
    ]);

    const canonicalKeys = messageRows.map((row) => `${CHECK_IN_KEY_PREFIX}${toPlain(row).id}`);
    const viewedRows = canonicalKeys.length === 0 ? [] : await models.UserNotificationView.findAll({
      where: {
        userId: studentId,
        notificationKey: { [Op.in]: canonicalKeys },
      },
      attributes: ["notificationKey"],
    });
    const viewedKeys = new Set(viewedRows.map((row) => toPlain(row).notificationKey));
    const aggregate = aggregateRows[0] || { total: 0, unreadTotal: 0 };
    const total = normalizeCount(aggregate.total);
    const unreadTotal = normalizeCount(aggregate.unreadTotal);

    const checkIns = messageRows.map((record) => {
      const row = toPlain(record);
      const key = `${CHECK_IN_KEY_PREFIX}${row.id}`;
      const sender = row.sender ? {
        id: row.sender.id,
        firstName: row.sender.firstName,
        lastName: row.sender.lastName,
        username: row.sender.username,
      } : null;
      const classroom = row.classroom ? {
        id: row.classroom.id,
        className: row.classroom.className,
        section: row.classroom.section,
        schoolYear: row.classroom.schoolYear,
        isActive: row.classroom.isActive,
      } : null;
      return {
        id: key,
        senderRole: row.senderRole,
        sender,
        classroom,
        message: row.message,
        createdAt: row.createdAt,
        isRead: viewedKeys.has(key),
      };
    });

    return {
      checkIns,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      unreadTotal,
    };
  };

  return { listPrivateCheckIns };
};

module.exports = {
  ...createPrivateCheckInReadService(),
  createPrivateCheckInReadService,
};
