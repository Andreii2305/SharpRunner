const sequelize = require("../config/database");
const Classroom = require("../models/Classroom");
const ClassroomMembership = require("../models/ClassroomMembership");

class ClassroomEnrollmentError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "ClassroomEnrollmentError";
    this.status = status;
    this.code = code;
  }
}

const createClassroomEnrollmentService = ({
  sequelize: database = sequelize,
  models = { Classroom, ClassroomMembership },
  now = () => new Date(),
} = {}) => {
  const withLockedClassroom = (classroomId, operation) => database.transaction(async (transaction) => {
    const classroom = await models.Classroom.findByPk(classroomId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    return operation({ classroom, transaction });
  });

  const findMembershipInTransaction = ({ classroomId, studentId, transaction }) => (
    models.ClassroomMembership.findOne({
      where: { classroomId, studentId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    })
  );

  const activateMembershipInTransaction = async ({
    classroom,
    studentId,
    transaction,
    membership: suppliedMembership,
    setJoinedAtOnReactivation = true,
    setJoinedAtIfMissingOnReactivation = false,
  }) => {
    const classroomId = Number(classroom.id);
    const membership = suppliedMembership === undefined
      ? await findMembershipInTransaction({ classroomId, studentId, transaction })
      : suppliedMembership;

    if (membership?.status === "active") {
      return { changed: false, created: false, membership };
    }

    const maxStudents = Number(classroom.maxStudents);
    if (Number.isInteger(maxStudents) && maxStudents > 0) {
      const activeStudents = await models.ClassroomMembership.count({
        where: { classroomId, status: "active" },
        transaction,
      });
      if (activeStudents >= maxStudents) {
        throw new ClassroomEnrollmentError(
          409,
          "CLASSROOM_CAPACITY_REACHED",
          "This classroom is already full",
        );
      }
    }

    const activationTime = now();
    if (!membership) {
      const createdMembership = await models.ClassroomMembership.create({
        classroomId,
        studentId,
        status: "active",
        joinedAt: activationTime,
      }, { transaction });
      return { changed: true, created: true, membership: createdMembership };
    }

    membership.status = "active";
    const fields = ["status"];
    if (setJoinedAtOnReactivation) {
      membership.joinedAt = activationTime;
      fields.push("joinedAt");
    } else if (setJoinedAtIfMissingOnReactivation && membership.joinedAt == null) {
      membership.joinedAt = activationTime;
      fields.push("joinedAt");
    }
    await membership.save({ transaction, fields });
    return { changed: true, created: false, membership };
  };

  const activateClassroomMembership = ({
    classroomId,
    studentId,
    validateClassroom,
    setJoinedAtOnReactivation = true,
    setJoinedAtIfMissingOnReactivation = false,
  }) => withLockedClassroom(classroomId, async ({ classroom, transaction }) => {
    if (validateClassroom) await validateClassroom(classroom);
    return activateMembershipInTransaction({
      classroom,
      studentId,
      transaction,
      setJoinedAtOnReactivation,
      setJoinedAtIfMissingOnReactivation,
    });
  });

  return {
    withLockedClassroom,
    findMembershipInTransaction,
    activateMembershipInTransaction,
    activateClassroomMembership,
  };
};

const service = createClassroomEnrollmentService();

module.exports = {
  ClassroomEnrollmentError,
  createClassroomEnrollmentService,
  ...service,
};
