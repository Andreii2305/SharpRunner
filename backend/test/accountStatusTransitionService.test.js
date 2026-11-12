const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  createAccountStatusTransitionService,
} = require("../src/services/accountStatusTransitionService");
const { authenticateGoogleProfile } = require("../src/routes/auth");

const createHarness = ({
  userStatus = "active",
  submissions = [],
  failUserSave = false,
} = {}) => {
  const calls = [];
  const transaction = { LOCK: { UPDATE: "UPDATE" } };
  const user = {
    id: 41,
    role: "student",
    status: userStatus,
    tokenVersion: 2,
    async save(options) {
      calls.push(["user.save", options]);
      if (failUserSave) throw new Error("user save failed");
    },
  };
  const rows = submissions.map((values) => ({
    authorUserId: user.id,
    withdrawnAt: null,
    publicationSuspendedAt: null,
    publicationSuspensionReason: null,
    ...values,
    async update(next, options) {
      calls.push(["submission.update", this.id, next, options]);
      Object.assign(this, next);
      return this;
    },
  }));
  const database = {
    async transaction(callback) {
      calls.push(["transaction.begin"]);
      const snapshot = {
        status: user.status,
        tokenVersion: user.tokenVersion,
        submissions: rows.map((row) => ({
          publicationSuspendedAt: row.publicationSuspendedAt,
          publicationSuspensionReason: row.publicationSuspensionReason,
        })),
      };
      try {
        const result = await callback(transaction);
        calls.push(["transaction.commit"]);
        return result;
      } catch (error) {
        user.status = snapshot.status;
        user.tokenVersion = snapshot.tokenVersion;
        rows.forEach((row, index) => Object.assign(row, snapshot.submissions[index]));
        calls.push(["transaction.rollback"]);
        throw error;
      }
    },
  };
  const models = {
    User: {
      async findByPk(id, options) {
        calls.push(["user.lock", id, options]);
        return id === user.id ? user : null;
      },
    },
    PublicTestimonialSubmission: {
      async findAll(options) {
        calls.push(["submissions.lock", options]);
        return rows.filter((row) => row.withdrawnAt == null);
      },
    },
  };
  const now = new Date("2026-11-03T10:00:00.000Z");
  return {
    calls,
    database,
    models,
    now,
    rows,
    transaction,
    user,
    service: createAccountStatusTransitionService({ database, models, now: () => now }),
  };
};

test("active-to-inactive locks the user first and durably suspends non-withdrawn testimonials", async () => {
  const existingSuspension = new Date("2026-10-01T00:00:00.000Z");
  const h = createHarness({
    submissions: [
      { id: 9 },
      {
        id: 4,
        publicationSuspendedAt: existingSuspension,
        publicationSuspensionReason: "account_deactivated",
      },
      { id: 7, withdrawnAt: new Date("2026-10-02T00:00:00.000Z") },
    ],
  });

  const result = await h.service.transition({
    userId: h.user.id,
    nextStatus: "inactive",
  });

  assert.equal(result.changed, true);
  assert.equal(result.previousStatus, "active");
  assert.equal(h.user.status, "inactive");
  assert.equal(h.rows[0].publicationSuspendedAt, h.now);
  assert.equal(h.rows[0].publicationSuspensionReason, "account_deactivated");
  assert.equal(h.rows[1].publicationSuspendedAt, existingSuspension);
  assert.equal(h.rows[2].publicationSuspendedAt, null);
  assert.deepEqual(
    h.calls.filter(([name]) => name.endsWith(".lock")).map(([name]) => name),
    ["user.lock", "submissions.lock"],
  );
  const submissionQuery = h.calls.find(([name]) => name === "submissions.lock")[1];
  assert.deepEqual(submissionQuery.order, [["id", "ASC"]]);
  assert.equal(submissionQuery.transaction, h.transaction);
  assert.equal(submissionQuery.lock, "UPDATE");
});

test("archive also suspends an eligible pending account and repeated deactivation preserves evidence", async () => {
  const h = createHarness({ userStatus: "pending", submissions: [{ id: 1 }] });
  await h.service.transition({ userId: h.user.id, nextStatus: "archived" });
  const suspendedAt = h.rows[0].publicationSuspendedAt;

  const repeated = await h.service.transition({ userId: h.user.id, nextStatus: "archived" });

  assert.equal(repeated.changed, false);
  assert.equal(h.rows[0].publicationSuspendedAt, suspendedAt);
  assert.equal(
    h.calls.filter(([name]) => name === "submission.update").length,
    1,
  );
  assert.equal(h.calls.filter(([name]) => name === "user.save").length, 1);
});

test("reactivation preserves suspension and never loads testimonial rows", async () => {
  const suspendedAt = new Date("2026-10-01T00:00:00.000Z");
  const h = createHarness({
    userStatus: "inactive",
    submissions: [{
      id: 1,
      publicationSuspendedAt: suspendedAt,
      publicationSuspensionReason: "account_deactivated",
    }],
  });

  await h.service.transition({ userId: h.user.id, nextStatus: "active" });

  assert.equal(h.user.status, "active");
  assert.equal(h.rows[0].publicationSuspendedAt, suspendedAt);
  assert.equal(h.calls.some(([name]) => name === "submissions.lock"), false);
});

test("a recovered submission is suspended again on a later deactivation", async () => {
  const h = createHarness({ submissions: [{ id: 2 }] });

  await h.service.transition({ userId: h.user.id, nextStatus: "inactive" });

  assert.equal(h.rows[0].publicationSuspendedAt, h.now);
  assert.equal(h.rows[0].publicationSuspensionReason, "account_deactivated");
});

test("status and suspension changes roll back together when the user save fails", async () => {
  const h = createHarness({ submissions: [{ id: 1 }], failUserSave: true });

  await assert.rejects(
    h.service.transition({ userId: h.user.id, nextStatus: "inactive" }),
    /user save failed/,
  );

  assert.equal(h.user.status, "active");
  assert.equal(h.rows[0].publicationSuspendedAt, null);
  assert.equal(h.rows[0].publicationSuspensionReason, null);
  assert.equal(h.calls.at(-1)[0], "transaction.rollback");
});

test("locked validation and path-specific mutation run within the same transaction", async () => {
  const h = createHarness();
  let validationTransaction;
  let mutationTransaction;

  const result = await h.service.transition({
    userId: h.user.id,
    nextStatus: "archived",
    validateLockedUser: async (_user, context) => {
      validationTransaction = context.transaction;
    },
    mutateLockedUser: async (user, context) => {
      mutationTransaction = context.transaction;
      user.tokenVersion += 1;
      return true;
    },
  });

  assert.equal(validationTransaction, h.transaction);
  assert.equal(mutationTransaction, h.transaction);
  assert.equal(result.user.tokenVersion, 3);
});

test("a locked status resolver activates pending users without reactivating inactive users", async () => {
  const pending = createHarness({ userStatus: "pending" });
  await pending.service.transition({
    userId: pending.user.id,
    resolveNextStatus: (user) => user.status === "pending" ? "active" : user.status,
  });
  assert.equal(pending.user.status, "active");

  const inactive = createHarness({ userStatus: "inactive" });
  const result = await inactive.service.transition({
    userId: inactive.user.id,
    resolveNextStatus: (user) => user.status === "pending" ? "active" : user.status,
  });
  assert.equal(result.changed, false);
  assert.equal(inactive.user.status, "inactive");
});

test("the existing-user Google callback activates through the locked transition path", async () => {
  const discovered = {
    id: 71,
    status: "pending",
    emailVerifiedAt: null,
  };
  const locked = { ...discovered };
  let transitionInput;
  const doneResult = await new Promise((resolve, reject) => {
    authenticateGoogleProfile({
      id: "google-71",
      emails: [{ value: "student71@example.com", verified: true }],
      name: { givenName: "Student", familyName: "Seventy One" },
    }, (error, user) => error ? reject(error) : resolve(user), {
      UserModel: { findOne: async () => discovered },
      transitionStatus: async (input) => {
        transitionInput = input;
        input.validateLockedUser(locked);
        locked.status = input.resolveNextStatus(locked);
        input.mutateLockedUser(locked);
        return { user: locked };
      },
      now: () => new Date("2026-11-03T11:00:00.000Z"),
    });
  });

  assert.equal(transitionInput.userId, discovered.id);
  assert.equal(doneResult.status, "active");
  assert.equal(doneResult.googleId, "google-71");
  assert.ok(doneResult.emailVerifiedAt instanceof Date);
  assert.ok(doneResult.lastLoginAt instanceof Date);
});

test("the Google callback refuses a concurrent deactivation seen under the user lock", async () => {
  const discovered = { id: 72, status: "pending", emailVerifiedAt: null };
  const result = await new Promise((resolve, reject) => {
    authenticateGoogleProfile({
      id: "google-72",
      emails: [{ value: "student72@example.com", verified: true }],
    }, (error, user) => error ? reject(error) : resolve(user), {
      UserModel: { findOne: async () => discovered },
      transitionStatus: async (input) => {
        input.validateLockedUser({ ...discovered, status: "inactive" });
        throw new Error("unreachable");
      },
    });
  });

  assert.equal(result, false);
});
