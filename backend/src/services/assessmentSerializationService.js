const plain = (value) => value?.toJSON ? value.toJSON() : (value || {});
const numberOrNull = (value) => value == null ? null : Number(value);
const codingExecutionMode = (question) => question.codingExecutionMode || "METHOD";
const DISCOVERY_LOCK_REASONS = new Set([
  "LESSON_PREREQUISITE_REQUIRED",
  "PRE_ASSESSMENT_REQUIRED",
  "GAME_INCOMPLETE",
]);

const serializePlayerAssessment = (assessmentInput) => {
  const assessment = plain(assessmentInput);
  return {
    id: assessment.id,
    lessonKey: assessment.lessonKey,
    type: assessment.type,
    title: assessment.title,
    instructions: assessment.instructions ?? null,
    version: assessment.version,
    questions: (assessment.questions || []).map((questionInput) => {
      const question = plain(questionInput);
      return {
        id: question.id,
        questionText: question.questionText,
        questionType: question.questionType,
        points: numberOrNull(question.points),
        objectiveKey: question.objectiveKey ?? null,
        ...(question.questionType === "CODING" ? {
          executionMode: codingExecutionMode(question),
          starterCode: question.starterCode ?? "",
          ...(codingExecutionMode(question) === "METHOD" ? { methodContract: {
            typeName: question.codingTypeName,
            methodName: question.codingMethodName,
            parameterTypes: [...(question.codingParameterTypes || [])],
            returnType: question.codingReturnType,
          } } : {}),
          codingExamples: (question.codingTestCases || [])
            .map(plain)
            .filter((testCase) => testCase.visibility === "PUBLIC")
            .map((testCase) => ({ input: testCase.input, expectedOutput: testCase.expectedOutput })),
        } : {}),
        choices: (question.choices || []).map((choiceInput) => {
          const choice = plain(choiceInput);
          return {
            id: choice.id,
            choiceText: choice.choiceText,
          };
        }),
      };
    }),
  };
};

const serializeSafeAttempt = (attemptInput) => {
  const attempt = plain(attemptInput);
  return {
    id: attempt.id,
    assessmentId: attempt.assessmentId,
    classroomId: attempt.classroomId,
    attemptNumber: attempt.attemptNumber,
    status: attempt.status,
    assessmentVersion: attempt.assessmentVersion,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt ?? null,
  };
};

const serializePlayerAttempt = ({ assessment, attempt, responses = [], attemptsUsed, maxAttempts }) => ({
  assessment: serializePlayerAssessment(assessment),
  attempt: serializeSafeAttempt(attempt),
  responses: responses.map((responseInput) => {
    const response = plain(responseInput);
    return {
      questionId: response.questionId,
      ...(response.sourceCode != null
        ? { sourceCode: response.sourceCode }
        : { selectedChoiceId: response.selectedChoiceId ?? null }),
    };
  }),
  attemptsUsed: Number(attemptsUsed),
  maxAttempts: Number(maxAttempts),
});

const serializeDiscoveryAssessment = (assessmentInput) => {
  if (!assessmentInput) return null;
  const assessment = plain(assessmentInput);
  return {
    id: assessment.id,
    lessonKey: assessment.lessonKey,
    type: assessment.type,
    title: assessment.title,
    instructions: assessment.instructions ?? null,
    required: Boolean(assessment.isRequired),
    maxAttempts: Number(assessment.maxAttempts),
  };
};

const serializeDiscoveryStatus = (input = {}) => {
  const assessment = input.assessment ? plain(input.assessment) : null;
  const type = input.type ?? assessment?.type;
  const status = {
    available: Boolean(input.available ?? assessment),
    lessonKey: input.lessonKey ?? assessment?.lessonKey,
    type,
    attemptStatus: input.attemptStatus ?? "NOT_AVAILABLE",
    attemptsUsed: Number(input.attemptsUsed ?? 0),
    hasSubmittedAttempt: Boolean(input.hasSubmittedAttempt),
    latestSubmittedAttemptId: input.latestSubmitted
      ? plain(input.latestSubmitted).id
      : null,
  };
  status.unlocked = status.available && input.unlocked === true;
  status.lockReason = status.available
    && !status.unlocked
    && DISCOVERY_LOCK_REASONS.has(input.lockReason)
    ? input.lockReason
    : null;
  if (type === "PRE") {
    status.diagnosticCompleted = status.hasSubmittedAttempt;
  }
  if (input.attemptsRemaining != null) status.attemptsRemaining = Number(input.attemptsRemaining);
  if (input.activeAttemptId != null) status.activeAttemptId = input.activeAttemptId;
  if (assessment?.showScoreAfterSubmission === true && input.latestSubmitted) {
    const latest = plain(input.latestSubmitted);
    status.latestSubmitted = {
      attemptNumber: latest.attemptNumber,
      percentage: numberOrNull(latest.percentage),
      ...(assessment.type === "POST" && latest.passed != null ? { passed: Boolean(latest.passed) } : {}),
    };
  }
  if (assessment?.type === "POST" && assessment.showScoreAfterSubmission === true && input.officialPost) {
    const official = plain(input.officialPost);
    status.officialPost = {
      attemptNumber: official.attemptNumber,
      percentage: numberOrNull(official.percentage),
    };
  }
  return { assessment: serializeDiscoveryAssessment(assessment), status };
};

const serializeScore = (attemptInput) => {
  const attempt = plain(attemptInput);
  return {
    pointsEarned: numberOrNull(attempt.pointsEarned),
    maxPoints: numberOrNull(attempt.maxPoints),
    percentage: numberOrNull(attempt.percentage),
    correctCount: numberOrNull(attempt.correctCount),
    questionCount: numberOrNull(attempt.questionCount),
  };
};

const serializeGradeReference = (attemptInput) => {
  const attempt = plain(attemptInput);
  return {
    attemptNumber: attempt.attemptNumber,
    percentage: numberOrNull(attempt.percentage),
    ...(attempt.passed != null ? { passed: Boolean(attempt.passed) } : {}),
  };
};

const serializeStudentResult = (input = {}) => {
  const assessment = plain(input.assessment);
  const attempt = plain(input.attempt);
  const result = serializeSafeAttempt(attempt);
  if (assessment.type === "POST" && attempt.passed != null) result.passed = Boolean(attempt.passed);
  if (assessment.showScoreAfterSubmission === true) {
    Object.assign(result, serializeScore(attempt));
  }
  const output = { result };
  if (assessment.showScoreAfterSubmission === true) {
    if (assessment.type === "POST" && input.officialGrade) {
      output.officialGrade = serializeGradeReference(input.officialGrade);
    }
    if (assessment.type === "POST" && input.firstPost) {
      output.firstPost = serializeGradeReference(input.firstPost);
    }
    if (assessment.type === "POST" && input.learningGain) {
      const learningGain = plain(input.learningGain);
      output.prePercentage = numberOrNull(learningGain.prePercentage);
      output.learningGain = {
        value: numberOrNull(learningGain.value),
        unit: learningGain.unit,
        label: learningGain.label,
        firstPostPercentage: numberOrNull(learningGain.firstPostPercentage),
      };
    }
  }
  return output;
};

const serializeAllowedReview = (input = {}) => {
  if (input.reviewAvailable !== true) return { reviewAvailable: false };
  const responses = new Map((input.responses || []).map((responseInput) => {
    const response = plain(responseInput);
    return [String(response.questionId), response];
  }));
  return {
    reviewAvailable: true,
    review: (input.questions || []).map((questionInput) => {
      const question = plain(questionInput);
      const response = responses.get(String(question.id));
      const selectedChoiceId = response?.selectedChoiceId ?? null;
      const correctChoice = (question.choices || []).map(plain).find((choice) => choice.isCorrect === true);
      return {
        questionId: question.id,
        questionText: question.questionText,
        ...(question.questionType === "CODING"
          ? { sourceCode: response?.sourceCode ?? "" }
          : { selectedChoiceId }),
        ...(input.scoreVisible !== false ? {
          correctChoiceId: correctChoice?.id ?? null,
          isCorrect: question.questionType === "CODING"
            ? response?.isCorrect === true
            : Boolean(correctChoice && String(selectedChoiceId) === String(correctChoice.id)),
          pointsAwarded: numberOrNull(response?.pointsAwarded),
          explanation: question.explanation ?? null,
        } : {}),
      };
    }),
  };
};

const serializeTeacherSummary = (input = {}) => {
  const assessment = input.assessment ? plain(input.assessment) : plain(input);
  if (!assessment?.id) return { exists: false };
  const output = {
    exists: true,
    id: assessment.id,
    published: Boolean(assessment.isPublished),
    questionCount: Number(input.questionCount ?? assessment.questionCount ?? assessment.questions?.length ?? 0),
    attemptsExist: Boolean(input.attemptsExist),
  };
  if (assessment.type === "POST") {
    output.passingPercentage = numberOrNull(assessment.passingPercentage);
    output.maxAttempts = Number(assessment.maxAttempts);
    output.requirePassingForCompletion = Boolean(assessment.requirePassingForCompletion);
  }
  return output;
};

const serializeTeacherEditor = (assessmentInput, metadata = {}) => {
  const assessment = plain(assessmentInput);
  return {
    id: assessment.id,
    classroomId: assessment.classroomId,
    lessonKey: assessment.lessonKey,
    type: assessment.type,
    title: assessment.title,
    instructions: assessment.instructions ?? null,
    isRequired: Boolean(assessment.isRequired),
    isPublished: Boolean(assessment.isPublished),
    publishedAt: assessment.publishedAt ?? null,
    passingPercentage: numberOrNull(assessment.passingPercentage),
    maxAttempts: Number(assessment.maxAttempts),
    gradeCalculation: assessment.gradeCalculation,
    requirePassingForCompletion: Boolean(assessment.requirePassingForCompletion),
    showScoreAfterSubmission: Boolean(assessment.showScoreAfterSubmission),
    answerReviewPolicy: assessment.answerReviewPolicy,
    shuffleQuestions: Boolean(assessment.shuffleQuestions),
    shuffleChoices: Boolean(assessment.shuffleChoices),
    version: assessment.version,
    attemptsExist: Boolean(metadata.attemptsExist),
    structureLocked: Boolean(metadata.structureLocked),
    questions: (assessment.questions || []).map((questionInput) => {
      const question = plain(questionInput);
      return {
        id: question.id,
        questionText: question.questionText,
        questionType: question.questionType,
        displayOrder: question.displayOrder,
        points: numberOrNull(question.points),
        explanation: question.explanation ?? null,
        objectiveKey: question.objectiveKey ?? null,
        ...(question.questionType === "CODING" ? {
          executionMode: codingExecutionMode(question),
          starterCode: question.starterCode ?? "",
          referenceSolution: question.referenceSolution ?? "",
          ...(codingExecutionMode(question) === "METHOD" ? { methodContract: {
            typeName: question.codingTypeName ?? null,
            methodName: question.codingMethodName ?? null,
            parameterTypes: question.codingParameterTypes ?? null,
            returnType: question.codingReturnType ?? null,
          } } : {}),
          codingTestCases: (question.codingTestCases || []).map((testInput) => {
            const testCase = plain(testInput);
            return {
              id: testCase.id,
              displayOrder: testCase.displayOrder,
              visibility: testCase.visibility,
              input: testCase.input,
              expectedOutput: testCase.expectedOutput,
              weight: Number(testCase.weight),
            };
          }),
        } : {}),
        choices: (question.choices || []).map((choiceInput) => {
          const choice = plain(choiceInput);
          return {
            id: choice.id,
            choiceText: choice.choiceText,
            displayOrder: choice.displayOrder,
            isCorrect: Boolean(choice.isCorrect),
          };
        }),
      };
    }),
  };
};

const serializeTeacherResults = (input = {}) => {
  const assessment = plain(input.assessment);
  return {
    assessment: {
      id: assessment.id,
      lessonKey: assessment.lessonKey,
      type: assessment.type,
      title: assessment.title,
      passingPercentage: numberOrNull(assessment.passingPercentage),
      maxAttempts: Number(assessment.maxAttempts),
    },
    results: (input.results || []).map((itemInput) => {
      const item = plain(itemInput);
      const attempt = plain(item.attempt ?? item);
      const student = plain(item.student);
      return {
        student: {
          id: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          username: student.username,
        },
        attemptId: attempt.id,
        attemptNumber: attempt.attemptNumber,
        submittedAt: attempt.submittedAt,
        pointsEarned: numberOrNull(attempt.pointsEarned),
        maxPoints: numberOrNull(attempt.maxPoints),
        percentage: numberOrNull(attempt.percentage),
        passed: attempt.passed == null ? null : Boolean(attempt.passed),
        isOfficial: Boolean(item.isOfficial),
        isFirstSubmittedPost: Boolean(item.isFirstSubmittedPost),
      };
    }),
    codingQuestions: (input.codingQuestions || []).map((questionInput) => {
      const question = plain(questionInput);
      return {
        questionId: question.questionId,
        questionOrder: Number(question.questionOrder),
        questionLabel: question.questionLabel,
        responseCount: Number(question.responseCount),
        fullyCorrectCount: Number(question.fullyCorrectCount),
        fullyCorrectRate: Number(question.fullyCorrectRate),
        averageAwardedPoints: Number(question.averageAwardedPoints),
        maximumPoints: Number(question.maximumPoints),
        averagePercentageEarned: Number(question.averagePercentageEarned),
      };
    }),
  };
};

const serializeTeacherGrantedAttempt = (attemptInput) => {
  const attempt = plain(attemptInput);
  return {
    id: attempt.id,
    assessmentId: attempt.assessmentId,
    classroomId: attempt.classroomId,
    studentId: attempt.studentId,
    attemptNumber: attempt.attemptNumber,
    status: attempt.status,
    assessmentVersion: attempt.assessmentVersion,
    startedAt: attempt.startedAt,
  };
};

module.exports = {
  serializeAllowedReview,
  serializeDiscoveryStatus,
  serializePlayerAssessment,
  serializePlayerAttempt,
  serializeStudentResult,
  serializeTeacherEditor,
  serializeTeacherGrantedAttempt,
  serializeTeacherResults,
  serializeTeacherSummary,
};
