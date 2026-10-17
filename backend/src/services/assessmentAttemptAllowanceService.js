const defaultModels = require("../models");
const { ATTEMPT_STATUSES } = require("../constants/assessmentConfig");

const plain = (value) => value?.get ? value.get({ plain: true }) : value;

const createAssessmentAttemptAllowanceService = ({ models = defaultModels } = {}) => {
  const AssessmentAttemptGrant = models.AssessmentAttemptGrant;

  const summarizeAllowance = ({ assessment: assessmentInput, attempts = [], grants = [] }) => {
    const assessment = plain(assessmentInput) || {};
    const safeAttempts = attempts.map(plain);
    const safeGrants = grants.map(plain);
    const standardAttemptAllowance = Math.max(0, Number(assessment.maxAttempts) || 0);
    const attemptsUsed = safeAttempts.filter(
      (attempt) => attempt.status === ATTEMPT_STATUSES.SUBMITTED,
    ).length;
    const activeAttempt = safeAttempts.find((attempt) => (
      [ATTEMPT_STATUSES.IN_PROGRESS, ATTEMPT_STATUSES.GRADING].includes(attempt.status)
    )) ?? null;
    const historicalAllowance = safeAttempts.reduce(
      (maximum, attempt) => Math.max(maximum, Number(attempt.attemptNumber) || 0),
      0,
    );
    const additionalAttemptsGranted = safeGrants.length;
    const additionalAttemptsAvailable = safeGrants.filter(
      (grant) => grant.consumedByAttemptId == null,
    ).length;
    const totalAttemptAllowance = Math.max(
      standardAttemptAllowance + additionalAttemptsGranted,
      historicalAllowance + additionalAttemptsAvailable,
    );
    return {
      standardAttemptAllowance,
      additionalAttemptsGranted,
      additionalAttemptsAvailable,
      totalAttemptAllowance,
      attemptsUsed,
      attemptsRemaining: activeAttempt
        ? 0
        : Math.max(0, totalAttemptAllowance - attemptsUsed),
      activeAttempt,
    };
  };

  const isAnswerReviewEligible = ({ assessment: assessmentInput, attempts = [], grants = [] }) => {
    const assessment = plain(assessmentInput) || {};
    if (assessment.answerReviewPolicy === "NEVER") return false;
    const submittedCount = attempts.map(plain).filter(
      (attempt) => attempt.status === ATTEMPT_STATUSES.SUBMITTED,
    ).length;
    if (assessment.answerReviewPolicy === "AFTER_SUBMISSION") return submittedCount > 0;
    if (assessment.answerReviewPolicy !== "AFTER_FINAL_ATTEMPT") return false;
    if (grants.map(plain).some((grant) => grant.answerReviewWasEligibleAtGrant === true)) return true;
    const allowance = summarizeAllowance({ assessment, attempts, grants });
    return !allowance.activeAttempt && submittedCount >= allowance.totalAttemptAllowance;
  };

  const loadGrants = async ({ assessmentId, studentId, transaction, lock = false }) => {
    if (!AssessmentAttemptGrant) return [];
    return AssessmentAttemptGrant.findAll({
      where: { assessmentId, studentId },
      order: [["createdAt", "ASC"], ["id", "ASC"]],
      ...(transaction ? { transaction } : {}),
      ...(lock ? { lock: transaction?.LOCK?.UPDATE ?? true } : {}),
    });
  };

  return { isAnswerReviewEligible, loadGrants, summarizeAllowance };
};

const defaultService = createAssessmentAttemptAllowanceService();

module.exports = { createAssessmentAttemptAllowanceService, ...defaultService };
