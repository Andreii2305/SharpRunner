const sequelize = require("../config/database");
const Classroom = require("../models/Classroom");
const ClassroomMembership = require("../models/ClassroomMembership");
const {
  createClassroomEnrollmentService,
} = require("./classroomEnrollmentService");

const DECISIONS = new Set(["approve", "reject"]);

class ClassroomMembershipDecisionError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "ClassroomMembershipDecisionError";
    this.status = status;
    this.code = code;
  }
}

const positiveInteger = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const serializeMembership = (membership) => ({
  id: membership.id,
  classroomId: membership.classroomId,
  studentId: membership.studentId,
  status: membership.status,
  joinedAt: membership.joinedAt ?? null,
  updatedAt: membership.updatedAt ?? null,
});

const createClassroomMembershipDecisionService = ({
  sequelize: database = sequelize,
  models = { Classroom, ClassroomMembership },
  now = () => new Date(),
} = {}) => {
  const enrollmentService = createClassroomEnrollmentService({
    sequelize: database,
    models,
    now,
  });

  const decidePendingMembership = async ({
    classroomId: classroomIdInput,
    studentId: studentIdInput,
    teacherId: teacherIdInput,
    decision: decisionInput,
  }) => {
    const classroomId = positiveInteger(classroomIdInput);
    const studentId = positiveInteger(studentIdInput);
    const teacherId = positiveInteger(teacherIdInput);
    const decision = typeof decisionInput === "string"
      ? decisionInput.trim().toLowerCase()
      : "";

    if (!classroomId || !studentId || !teacherId || !DECISIONS.has(decision)) {
      throw new ClassroomMembershipDecisionError(
        400,
        "INVALID_CLASSROOM_MEMBERSHIP_DECISION",
        "Invalid classroom membership decision",
      );
    }

    return enrollmentService.withLockedClassroom(classroomId, async ({ classroom, transaction }) => {
      if (!classroom || Number(classroom.teacherId) !== teacherId) {
        throw new ClassroomMembershipDecisionError(
          403,
          "CLASSROOM_MEMBERSHIP_DECISION_FORBIDDEN",
          "Forbidden",
        );
      }
      if (classroom.isActive !== true) {
        throw new ClassroomMembershipDecisionError(
          409,
          "CLASSROOM_INACTIVE",
          "Classroom is inactive",
        );
      }

      const membership = await enrollmentService.findMembershipInTransaction({
        classroomId,
        studentId,
        transaction,
      });
      if (!membership) {
        throw new ClassroomMembershipDecisionError(
          404,
          "CLASSROOM_MEMBERSHIP_REQUEST_NOT_FOUND",
          "Classroom membership request not found",
        );
      }

      const targetStatus = decision === "approve" ? "active" : "rejected";
      if (membership.status === targetStatus) {
        return {
          changed: false,
          decision,
          membership: serializeMembership(membership),
        };
      }
      if (membership.status !== "pending") {
        throw new ClassroomMembershipDecisionError(
          409,
          "CLASSROOM_MEMBERSHIP_DECISION_CONFLICT",
          "Classroom membership request has already been decided",
        );
      }

      if (decision === "approve") {
        await enrollmentService.activateMembershipInTransaction({
          classroom,
          studentId,
          transaction,
          membership,
          setJoinedAtOnReactivation: true,
        });
      } else {
        membership.status = "rejected";
        await membership.save({ transaction, fields: ["status"] });
      }

      return {
        changed: true,
        decision,
        membership: serializeMembership(membership),
      };
    });
  };

  return { decidePendingMembership };
};

const service = createClassroomMembershipDecisionService();

module.exports = {
  ClassroomMembershipDecisionError,
  createClassroomMembershipDecisionService,
  decidePendingMembership: service.decidePendingMembership,
};
