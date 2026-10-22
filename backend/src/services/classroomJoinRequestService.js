const { Op } = require("sequelize");
const sequelize = require("../config/database");
const Classroom = require("../models/Classroom");
const ClassroomMembership = require("../models/ClassroomMembership");
const { createClassroomEnrollmentService } = require("./classroomEnrollmentService");

class ClassroomJoinRequestError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "ClassroomJoinRequestError";
    this.status = status;
    this.code = code;
  }
}

const normalizeClassCode = (value) => (
  typeof value === "string" ? value.trim().toUpperCase() : ""
);

const createClassroomJoinRequestService = ({
  sequelize: database = sequelize,
  models = { Classroom, ClassroomMembership },
  now = () => new Date(),
} = {}) => {
  const enrollmentService = createClassroomEnrollmentService({
    sequelize: database,
    models,
    now,
  });

  const notFound = () => new ClassroomJoinRequestError(
    404,
    "CLASSROOM_NOT_FOUND",
    "Classroom not found for this code",
  );

  const submitJoinRequest = async ({ classCode, studentId }) => {
    const normalizedCode = normalizeClassCode(classCode);
    if (!normalizedCode) throw notFound();

    const resolvedClassroom = await models.Classroom.findOne({
      where: {
        classCode: { [Op.iLike]: normalizedCode },
        isActive: true,
      },
      attributes: ["id"],
    });
    if (!resolvedClassroom) throw notFound();

    return enrollmentService.withLockedClassroom(
      resolvedClassroom.id,
      async ({ classroom, transaction }) => {
        if (
          !classroom
          || classroom.isActive !== true
          || normalizeClassCode(classroom.classCode) !== normalizedCode
        ) {
          throw notFound();
        }

        const membership = await enrollmentService.findMembershipInTransaction({
          classroomId: classroom.id,
          studentId,
          transaction,
        });

        if (membership?.status === "pending" || membership?.status === "active") {
          return { changed: false, created: false, membership, classroom };
        }

        const requestedAt = now();
        if (!membership) {
          const createdMembership = await models.ClassroomMembership.create({
            classroomId: classroom.id,
            studentId,
            status: "pending",
            joinedAt: null,
            requestedAt,
          }, { transaction });
          return {
            changed: true,
            created: true,
            membership: createdMembership,
            classroom,
          };
        }

        if (!["removed", "rejected"].includes(membership.status)) {
          throw new ClassroomJoinRequestError(
            409,
            "CLASSROOM_MEMBERSHIP_REQUEST_CONFLICT",
            "Classroom membership cannot be submitted as a join request",
          );
        }

        membership.status = "pending";
        membership.requestedAt = requestedAt;
        await membership.save({ transaction, fields: ["status", "requestedAt"] });
        return { changed: true, created: false, membership, classroom };
      },
    );
  };

  return { submitJoinRequest };
};

const service = createClassroomJoinRequestService();

module.exports = {
  ClassroomJoinRequestError,
  createClassroomJoinRequestService,
  normalizeClassCode,
  ...service,
};
