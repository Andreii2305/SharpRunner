import assert from "node:assert/strict";
import test from "node:test";
import {
  ACADEMIC_LESSONS,
  buildAssessmentAnalytics,
  filterAssessmentStudents,
  getAssessmentAnalyticsView,
  summarizeAssessmentAvailability,
  attemptPointsLabel,
  assessmentClassroomLabel,
  assessmentTargetValue,
  parseAssessmentTargetValue,
} from "./teacherAssessmentAnalyticsState.js";

const student = (id, firstName, lastName) => ({ id, firstName, lastName, username: `student${id}` });
const result = (studentValue, overrides = {}) => ({
  student: studentValue,
  attemptId: overrides.attemptId ?? `${studentValue.id}-${overrides.attemptNumber ?? 1}`,
  attemptNumber: overrides.attemptNumber ?? 1,
  submittedAt: overrides.submittedAt ?? "2026-09-20T00:00:00.000Z",
  pointsEarned: Object.hasOwn(overrides, "pointsEarned") ? overrides.pointsEarned : 8,
  maxPoints: Object.hasOwn(overrides, "maxPoints") ? overrides.maxPoints : 10,
  percentage: overrides.percentage ?? 80,
  passed: overrides.passed ?? null,
  passingPercentageApplied: Object.hasOwn(overrides, "passingPercentageApplied")
    ? overrides.passingPercentageApplied : 75,
  isOfficial: overrides.isOfficial ?? false,
  isFirstSubmittedPost: overrides.isFirstSubmittedPost ?? false,
  preBaselineStatus: overrides.preBaselineStatus ?? "VALID",
});

const prePayload = (results, codingQuestions = []) => ({ assessment: { id: 1, lessonKey: "arrays", type: "PRE", title: "Arrays diagnostic", passingPercentage: null, maxAttempts: 1 }, results, codingQuestions });
const postPayload = (results, codingQuestions = []) => ({ assessment: { id: 2, lessonKey: "arrays", type: "POST", title: "Arrays check", passingPercentage: 75, maxAttempts: 3, passingRequirementApplicable: true }, results, codingQuestions });

test("assessment classroom labels keep authoritative names and optional sections separate", () => {
  assert.equal(assessmentClassroomLabel({ id: 47, className: "DSA", section: "BSIT 3E" }), "DSA — BSIT 3E");
  assert.equal(assessmentClassroomLabel({ id: 48, className: "Algorithms", section: "" }), "Algorithms");
  assert.equal(assessmentClassroomLabel({ id: 49, className: "Programming", section: null }), "Programming");
});

test("academic lesson filter uses the backend assessment allowlist", () => {
  assert.deepEqual(ACADEMIC_LESSONS.map(({ key }) => key), ["arrays", "functions", "functions-with-arrays", "final"]);
  assert.equal(ACADEMIC_LESSONS.find(({ key }) => key === "final").assessmentApplicable, false);
});

test("assessment target values use stable built-in keys or placement IDs, never display titles", () => {
  assert.equal(assessmentTargetValue({ targetKind: "BUILT_IN", lessonKey: "arrays", title: "Arrays" }), "builtin:arrays");
  assert.equal(assessmentTargetValue({ targetKind: "CLASSROOM_LESSON_PLACEMENT", placementId: 71, lessonTitle: "Renamed lesson" }), "placement:71");
  assert.deepEqual(parseAssessmentTargetValue("builtin:functions-with-arrays"), {
    targetKind: "BUILT_IN", lessonKey: "functions-with-arrays",
  });
  assert.deepEqual(parseAssessmentTargetValue("placement:71"), {
    targetKind: "CLASSROOM_LESSON_PLACEMENT", placementId: 71,
  });
  assert.equal(parseAssessmentTargetValue("placement:Renamed lesson"), null);
});

test("custom learning gain requires the same exact placement content revision", () => {
  const learner = student(1, "Ada", "Learner");
  const pre = prePayload([result(learner, { percentage: 50 })]);
  const post = postPayload([result(learner, {
    percentage: 80, isOfficial: true, isFirstSubmittedPost: true,
  })]);
  pre.assessment = { ...pre.assessment, targetKind: "CLASSROOM_LESSON_PLACEMENT",
    classroomLessonPlacementId: 71, targetLessonVersion: 3 };
  post.assessment = { ...post.assessment, targetKind: "CLASSROOM_LESSON_PLACEMENT",
    classroomLessonPlacementId: 71, targetLessonVersion: 4 };

  const model = buildAssessmentAnalytics({ prePayload: pre, postPayload: post });
  assert.equal(model.students[0].learningGain, null);
  assert.equal(model.students[0].learningGainUnavailableReason,
    "Assessment content revisions are not comparable");
  assert.equal(model.metrics.pairedStudents, 0);
});

test("custom learning gain rejects missing revisions instead of coercing NULL to revision zero", () => {
  const learner = student(1, "Ada", "Learner");
  const pre = prePayload([result(learner, { percentage: 50 })]);
  const post = postPayload([result(learner, {
    percentage: 80, isOfficial: true, isFirstSubmittedPost: true,
  })]);
  pre.assessment = { ...pre.assessment, targetKind: "CLASSROOM_LESSON_PLACEMENT",
    classroomLessonPlacementId: 71, targetLessonVersion: null };
  post.assessment = { ...post.assessment, targetKind: "CLASSROOM_LESSON_PLACEMENT",
    classroomLessonPlacementId: 71, targetLessonVersion: null };

  const model = buildAssessmentAnalytics({ prePayload: pre, postPayload: post });
  assert.equal(model.students[0].learningGain, null);
  assert.equal(model.students[0].learningGainUnavailableReason,
    "Assessment content revisions are not comparable");
});

test("custom PRE baseline labels describe lesson access without changing built-in wording", () => {
  const learner = student(1, "Ada", "Learner");
  const customPre = prePayload([result(learner, { preBaselineStatus: "RETROACTIVE" })]);
  customPre.assessment = {
    ...customPre.assessment,
    targetKind: "CLASSROOM_LESSON_PLACEMENT",
    classroomLessonPlacementId: 71,
    targetLessonVersion: 3,
  };

  assert.equal(buildAssessmentAnalytics({ prePayload: customPre }).students[0].preStatus,
    "Retroactive — lesson content was accessed before PRE");
  assert.equal(buildAssessmentAnalytics({
    prePayload: prePayload([result(learner, { preBaselineStatus: "RETROACTIVE" })]),
  }).students[0].preStatus, "Retroactive — game activity preceded PRE");
});

test("assessment presentation keeps request failure distinct from configuration availability", () => {
  assert.equal(getAssessmentAnalyticsView({ classroomId: "", lessonKey: "", assessmentApplicable: true, loading: false, error: "" }), "select_scope");
  assert.equal(getAssessmentAnalyticsView({ classroomId: "3", lessonKey: "final", assessmentApplicable: false, loading: false, error: "" }), "not_applicable");
  assert.equal(getAssessmentAnalyticsView({ classroomId: "3", lessonKey: "arrays", assessmentApplicable: true, loading: true, error: "" }), "loading");
  assert.equal(getAssessmentAnalyticsView({ classroomId: "3", lessonKey: "arrays", assessmentApplicable: true, loading: false, error: "offline" }), "error");
  assert.equal(getAssessmentAnalyticsView({ classroomId: "3", lessonKey: "arrays", assessmentApplicable: true, loading: false, error: "", dataMatchesScope: false }), "loading");
  assert.equal(getAssessmentAnalyticsView({ classroomId: "3", lessonKey: "arrays", assessmentApplicable: true, loading: false, error: "", dataMatchesScope: true }), "ready");
});

test("analytics deduplicates submitted students and keeps first versus official POST distinct", () => {
  const ada = student(2, "Ada", "Lovelace");
  const grace = student(3, "Grace", "Hopper");
  const model = buildAssessmentAnalytics({
    prePayload: prePayload([result(ada, { percentage: 40 }), result(grace, { percentage: 70 })]),
    postPayload: postPayload([
      result(ada, { attemptId: "a1", attemptNumber: 1, percentage: 60, passed: false, isFirstSubmittedPost: true }),
      result(ada, { attemptId: "a2", attemptNumber: 2, percentage: 90, passed: true, isOfficial: true }),
      result(grace, { attemptId: "g1", percentage: 80, passed: true, isOfficial: true, isFirstSubmittedPost: true }),
    ]),
  });
  assert.equal(model.metrics.preSubmittedStudents, 2);
  assert.equal(model.metrics.postSubmittedStudents, 2);
  assert.equal(model.metrics.averagePrePercentage, 55);
  assert.equal(model.metrics.averageOfficialPostPercentage, 85);
  assert.equal(model.metrics.postPassedStudents, 2);
  assert.equal(model.metrics.postPassRate, 100);
  assert.equal(model.metrics.averagePostAttempts, 1.5);
  assert.equal(model.metrics.pairedStudents, 2);
  assert.equal(model.metrics.averageLearningGain, 15);
  assert.equal(model.students[0].name, "Ada Lovelace");
  assert.equal(model.students[0].firstPost.percentage, 60);
  assert.equal(model.students[0].officialPost.percentage, 90);
  assert.equal(model.students[0].learningGain, 20);
  assert.equal(model.students[0].postAttempts.length, 2);
});

test("PRE is diagnostic and never receives inferred pass/fail semantics", () => {
  const alan = student(1, "Alan", "Turing");
  const model = buildAssessmentAnalytics({ prePayload: prePayload([result(alan, { percentage: 100, passed: true })]) });
  assert.equal(model.students[0].preStatus, "Valid baseline");
  assert.equal(model.students[0].preAttempt.passed, null);
  assert.equal(model.metrics.postPassRate, null);
});

test("supplemental PRE remains in history without replacing the original baseline", () => {
  const alan = student(1, "Alan", "Turing");
  const model = buildAssessmentAnalytics({ prePayload: prePayload([
    result(alan, { attemptId: "pre-1", attemptNumber: 1, percentage: 40, preBaselineStatus: "VALID" }),
    result(alan, { attemptId: "pre-2", attemptNumber: 2, percentage: 90, preBaselineStatus: "SUPPLEMENTAL" }),
  ]) });
  assert.equal(model.students[0].preAttempt.attemptId, "pre-1");
  assert.equal(model.students[0].history[1].baselineLabel, "Supplemental diagnostic — not a baseline");
  assert.equal(model.metrics.averageAllPrePercentage, 40);
});

test("mixed baseline provenance separates diagnostic averages, counts, and paired gain", () => {
  const validNegative = student(1, "Valid", "Negative");
  const validZero = student(2, "Valid", "Zero");
  const retroactive = student(3, "Retro", "Active");
  const unknown = student(4, "Unknown", "Legacy");
  const missing = student(5, "Missing", "Legacy");
  const preOnly = student(6, "Pre", "Only");
  const postOnly = student(7, "Post", "Only");
  const model = buildAssessmentAnalytics({
    prePayload: prePayload([
      result(validNegative, { percentage: 80, preBaselineStatus: "VALID" }),
      result(validZero, { percentage: 60, preBaselineStatus: "VALID" }),
      result(retroactive, { percentage: 100, preBaselineStatus: "RETROACTIVE" }),
      result(unknown, { percentage: 40, preBaselineStatus: "UNKNOWN" }),
      { ...result(missing, { percentage: 20 }), preBaselineStatus: undefined },
      result(preOnly, { percentage: 0, preBaselineStatus: "VALID" }),
    ]),
    postPayload: postPayload([
      result(validNegative, { percentage: 70, isOfficial: true, isFirstSubmittedPost: true }),
      result(validZero, { percentage: 60, isOfficial: true, isFirstSubmittedPost: true }),
      result(retroactive, { percentage: 90, isOfficial: true, isFirstSubmittedPost: true }),
      result(unknown, { percentage: 90, isOfficial: true, isFirstSubmittedPost: true }),
      result(missing, { percentage: 90, isOfficial: true, isFirstSubmittedPost: true }),
      result(postOnly, { percentage: 90, isOfficial: true, isFirstSubmittedPost: true }),
    ]),
  });

  assert.equal(model.metrics.averageAllPrePercentage, 50);
  assert.equal(model.metrics.averagePrePercentage, 50);
  assert.equal(model.metrics.averageValidBaselinePrePercentage, 46.7);
  assert.equal(model.metrics.validBaselineStudents, 3);
  assert.equal(model.metrics.excludedBaselineStudents, 3);
  assert.equal(model.metrics.pairedStudents, 2);
  assert.equal(model.metrics.averageLearningGain, -5);
  assert.equal(model.students.find((row) => row.student.id === 3).preStatus, "Retroactive — game activity preceded PRE");
  assert.equal(model.students.find((row) => row.student.id === 4).preStatus, "Unknown — legacy baseline timing");
  assert.equal(model.students.find((row) => row.student.id === 5).preStatus, "Unknown — legacy baseline timing");
  assert.equal(model.students.find((row) => row.student.id === 3).learningGain, null);
  assert.equal(model.students.find((row) => row.student.id === 4).learningGain, null);
});

test("POST without a passing policy is submitted, never failed, and has no pass rate", () => {
  const alan = student(1, "Alan", "Turing");
  const payload = postPayload([result(alan, { percentage: 70, passed: false, isOfficial: true, isFirstSubmittedPost: true })]);
  payload.assessment.passingRequirementApplicable = false;
  const model = buildAssessmentAnalytics({ postPayload: payload });
  assert.equal(model.students[0].postStatus, "Submitted");
  assert.equal(model.metrics.postPassRate, null);
  assert.equal(model.metrics.postPassedStudents, null);
  assert.equal(model.students[0].officialPost.passed, false);
  assert.equal(model.students[0].officialPost.passingRequirementApplicable, false);
});

test("authoritative points and applied thresholds preserve zero, decimals, and partial legacy values", () => {
  const ada = student(1, "Ada", "Lovelace");
  const model = buildAssessmentAnalytics({
    postPayload: postPayload([
      result(ada, {
        pointsEarned: 0, maxPoints: 10.5, percentage: 0, passed: false,
        passingPercentageApplied: null, isOfficial: true, isFirstSubmittedPost: true,
      }),
    ]),
  });
  const attempt = model.students[0].officialPost;
  assert.equal(attempt.pointsEarned, 0);
  assert.equal(attempt.maxPoints, 10.5);
  assert.equal(attempt.percentage, 0);
  assert.equal(attempt.passingPercentageApplied, null);
  assert.equal(attempt.passingRequirementApplicable, true);
  assert.equal(attemptPointsLabel(attempt), "0 / 10.5 points");
  assert.equal(attemptPointsLabel({ pointsEarned: 7.5, maxPoints: null }), "7.5 points earned · possible unavailable");
  assert.equal(attemptPointsLabel({ pointsEarned: null, maxPoints: 10 }), "Earned unavailable · 10 points possible");
  assert.equal(attemptPointsLabel({ pointsEarned: null, maxPoints: null }), "Points unavailable");
  assert.equal(attemptPointsLabel(null), "Not submitted");
});

test("paired learning gain excludes PRE-only and POST-only students and preserves negative gain", () => {
  const paired = student(1, "Alan", "Turing");
  const preOnly = student(2, "Ada", "Lovelace");
  const postOnly = student(3, "Grace", "Hopper");
  const model = buildAssessmentAnalytics({
    prePayload: prePayload([result(paired, { percentage: 90 }), result(preOnly, { percentage: 30 })]),
    postPayload: postPayload([
      result(paired, { percentage: 70, passed: false, isOfficial: true, isFirstSubmittedPost: true }),
      result(postOnly, { percentage: 100, passed: true, isOfficial: true, isFirstSubmittedPost: true }),
    ]),
  });
  assert.equal(model.metrics.pairedStudents, 1);
  assert.equal(model.metrics.averageLearningGain, -20);
  assert.equal(model.students.find((row) => row.student.id === 2).learningGain, null);
  assert.equal(model.students.find((row) => row.student.id === 3).learningGain, null);
});

test("paired learning gain preserves a zero percentage-point change", () => {
  const alan = student(1, "Alan", "Turing");
  const model = buildAssessmentAnalytics({
    prePayload: prePayload([result(alan, { percentage: 75 })]),
    postPayload: postPayload([result(alan, { percentage: 75, passed: true, isOfficial: true, isFirstSubmittedPost: true })]),
  });
  assert.equal(model.students[0].learningGain, 0);
  assert.equal(model.metrics.averageLearningGain, 0);
  assert.equal(model.metrics.pairedStudents, 1);
});

test("missing authoritative POST markers stay unavailable rather than being guessed", () => {
  const ada = student(2, "Ada", "Lovelace");
  const model = buildAssessmentAnalytics({ postPayload: postPayload([result(ada, { percentage: 92, passed: true })]) });
  assert.equal(model.students[0].officialPost, null);
  assert.equal(model.students[0].firstPost, null);
  assert.equal(model.metrics.averageOfficialPostPercentage, null);
  assert.equal(model.metrics.postPassedStudents, 0);
  assert.equal(model.metrics.postPassRate, null);
});

test("rows are alphabetical by default and filters never introduce score ranking", () => {
  const model = buildAssessmentAnalytics({
    prePayload: prePayload([result(student(2, "Zoe", "Zeta")), result(student(1, "Amy", "Alpha"))]),
  });
  assert.deepEqual(model.students.map(({ name }) => name), ["Amy Alpha", "Zoe Zeta"]);
  assert.deepEqual(filterAssessmentStudents(model.students, { query: "zoe", type: "PRE" }).map(({ name }) => name), ["Zoe Zeta"]);
  assert.equal(filterAssessmentStudents(model.students, { query: "", type: "POST" }).length, 0);
});

test("availability distinguishes unconfigured, draft, published-empty, and published-with-submissions", () => {
  assert.equal(summarizeAssessmentAvailability({ exists: false }, null), "Not configured");
  assert.equal(summarizeAssessmentAvailability({ exists: true, published: false }, null), "Draft — results unavailable");
  assert.equal(summarizeAssessmentAvailability({ exists: true, published: true }, postPayload([])), "Published — no submitted attempts");
  assert.equal(summarizeAssessmentAvailability({ exists: true, published: true }, postPayload([result(student(1, "A", "B"))])), "Published — submissions available");
});

test("analytics model exposes no answer content or grading keys", () => {
  const raw = postPayload([{ ...result(student(1, "A", "B"), { isOfficial: true }), responses: [{ isCorrect: true, correctChoiceId: 9 }], explanation: "hidden" }]);
  const serialized = JSON.stringify(buildAssessmentAnalytics({ postPayload: raw }));
  for (const forbidden of ["responses", "isCorrect", "correctChoiceId", "explanation", "correctCount", "questionCount"]) assert.equal(serialized.includes(forbidden), false);
});

test("coding question performance stays assessment-scoped and allowlisted without ranking data", () => {
  const preCoding = {
    questionId: 7,
    questionOrder: 1,
    questionLabel: "Return the length.",
    responseCount: 3,
    fullyCorrectCount: 2,
    fullyCorrectRate: 66.67,
    averageAwardedPoints: 3,
    maximumPoints: 4,
    averagePercentageEarned: 75,
    referenceSolution: "teacher secret",
    hiddenTestCount: 5,
    sourceCode: "student secret",
  };
  const postCoding = { ...preCoding, questionId: 8, questionOrder: 2, fullyCorrectRate: 50 };

  const model = buildAssessmentAnalytics({
    prePayload: prePayload([], [preCoding]),
    postPayload: postPayload([], [postCoding]),
  });

  const expectedCodingQuestion = {
    questionId: 7,
    questionOrder: 1,
    questionLabel: "Return the length.",
    responseCount: 3,
    fullyCorrectCount: 2,
    fullyCorrectRate: 66.67,
    averageAwardedPoints: 3,
    maximumPoints: 4,
    averagePercentageEarned: 75,
  };
  assert.deepEqual(model.codingQuestions, [
    { ...expectedCodingQuestion, assessmentType: "PRE" },
    { ...expectedCodingQuestion, questionId: 8, questionOrder: 2, fullyCorrectRate: 50, assessmentType: "POST" },
  ]);
  const serialized = JSON.stringify(model.codingQuestions);
  for (const forbidden of ["referenceSolution", "hiddenTestCount", "sourceCode", "teacher secret", "student secret", "rank"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});
