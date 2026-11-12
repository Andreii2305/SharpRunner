const sequelize = require("../config/database");
const defaultModels = require("../models");

const ACCOUNT_STATUSES = new Set(["active", "inactive", "pending", "archived"]);
const SUSPENSION_REASON = "account_deactivated";

class AccountStatusTransitionError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "AccountStatusTransitionError";
    this.status = status;
    this.statusCode = status;
    this.code = code;
  }
}

const fail = (status, code, message) => {
  throw new AccountStatusTransitionError(status, code, message);
};

const shouldSuspendTestimonials = (previousStatus, nextStatus) => (
  (previousStatus === "active" && nextStatus !== "active")
  || (nextStatus === "archived" && previousStatus !== "archived")
);

const createAccountStatusTransitionService = ({
  database = sequelize,
  models = defaultModels,
  now = () => new Date(),
} = {}) => {
  const transition = async ({
    userId,
    nextStatus,
    resolveNextStatus,
    validateLockedUser,
    mutateLockedUser,
    afterUserSave,
  }) => {
    if (!Number.isSafeInteger(userId) || userId <= 0
      || (typeof resolveNextStatus !== "function" && !ACCOUNT_STATUSES.has(nextStatus))) {
      fail(400, "INVALID_ACCOUNT_STATUS_TRANSITION", "Invalid account status transition");
    }

    return database.transaction(async (transaction) => {
      const user = await models.User.findByPk(userId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!user) fail(404, "USER_NOT_FOUND", "User not found");

      const previousStatus = user.status;
      const resolvedNextStatus = resolveNextStatus ? resolveNextStatus(user) : nextStatus;
      if (!ACCOUNT_STATUSES.has(resolvedNextStatus)) {
        fail(400, "INVALID_ACCOUNT_STATUS_TRANSITION", "Invalid account status transition");
      }
      const changed = previousStatus !== resolvedNextStatus;
      const context = {
        changed,
        nextStatus: resolvedNextStatus,
        previousStatus,
        transaction,
      };
      if (validateLockedUser) await validateLockedUser(user, context);

      let suspendedCount = 0;
      if (changed && shouldSuspendTestimonials(previousStatus, resolvedNextStatus)) {
        const submissions = await models.PublicTestimonialSubmission.findAll({
          where: { authorUserId: userId, withdrawnAt: null },
          order: [["id", "ASC"]],
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        const suspendedAt = now();
        for (const submission of submissions) {
          if (submission.publicationSuspendedAt != null
            || submission.publicationSuspensionReason != null) {
            continue;
          }
          await submission.update({
            publicationSuspendedAt: suspendedAt,
            publicationSuspensionReason: SUSPENSION_REASON,
          }, { transaction });
          suspendedCount += 1;
        }
      }

      if (changed) user.status = resolvedNextStatus;
      const pathFieldsChanged = mutateLockedUser
        ? await mutateLockedUser(user, context) === true
        : false;
      if (changed || pathFieldsChanged) await user.save({ transaction });
      if (afterUserSave) await afterUserSave(user, context);

      return {
        changed,
        nextStatus: resolvedNextStatus,
        previousStatus,
        suspendedCount,
        user,
      };
    });
  };

  return { transition };
};

const service = createAccountStatusTransitionService();

module.exports = {
  AccountStatusTransitionError,
  SUSPENSION_REASON,
  createAccountStatusTransitionService,
  ...service,
};
