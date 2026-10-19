import axios from "axios";
import { buildApiUrl, getAuthHeaders } from "../utils/auth.js";

const segment = (value) => encodeURIComponent(String(value));
const config = (signal) => ({ headers: getAuthHeaders(), ...(signal ? { signal } : {}) });
const base = (classroomId) => `/api/teacher/classrooms/${segment(classroomId)}/assessments`;
const customBase = (classroomId, placementId) => (
  `/api/teacher/classrooms/${segment(classroomId)}/lesson-placements/${segment(placementId)}/assessments`
);

const pick = (source = {}, keys = []) => Object.fromEntries(
  keys.filter((key) => Object.hasOwn(source, key)).map((key) => [key, source[key]]),
);
const SETTING_FIELDS = [
  "title", "instructions", "isRequired", "passingPercentage", "maxAttempts",
  "requirePassingForCompletion", "showScoreAfterSubmission", "answerReviewPolicy",
  "shuffleQuestions", "shuffleChoices",
];

export const serializeTeacherAssessmentGraph = (graph = {}) => ({
  version: Number(graph.version),
  settings: pick(graph.settings, SETTING_FIELDS),
  questions: (graph.questions ?? []).map((question) => ({
    ...pick(question, ["questionText", "questionType", "points", "explanation", "objectiveKey"]),
    choices: (question.choices ?? []).map((choice) => pick(choice, ["choiceText", "isCorrect"])),
    ...(question.questionType === "CODING" ? {
      executionMode: question.executionMode ?? "METHOD",
      starterCode: question.starterCode ?? "",
      referenceSolution: question.referenceSolution ?? "",
      ...(question.executionMode !== "PROGRAM" ? { methodContract: {
        ...pick(question.methodContract, ["typeName", "methodName", "parameterNames", "parameterTypes", "returnType"]),
      } } : {}),
      codingTestCases: (question.codingTestCases ?? []).map((testCase) => (
        pick(testCase, ["visibility", "input", "expectedOutput", "weight"])
      )),
    } : {}),
  })),
});

const ASSESSMENT_EDITOR_FIELDS = [
  "id", "classroomId", "targetKind", "lessonKey", "classroomLessonPlacementId",
  "targetLessonVersion", "currentLessonVersion", "revisionReviewRequired",
  "type", "title", "instructions", "isRequired",
  "isPublished", "publishedAt", "passingPercentage", "maxAttempts", "gradeCalculation",
  "requirePassingForCompletion", "showScoreAfterSubmission", "answerReviewPolicy",
  "shuffleQuestions", "shuffleChoices", "version", "attemptsExist", "structureLocked",
];
export const normalizeTeacherAssessmentGraph = (assessment = {}) => ({
  ...pick(assessment, ASSESSMENT_EDITOR_FIELDS),
  questions: (assessment.questions ?? []).map((question) => ({
    ...pick(question, ["id", "questionText", "questionType", "displayOrder", "points", "explanation", "objectiveKey"]),
    choices: (question.choices ?? []).map((choice) => pick(choice, ["id", "choiceText", "displayOrder", "isCorrect"])),
    ...(question.questionType === "CODING" ? {
      executionMode: question.executionMode ?? "METHOD",
      starterCode: question.starterCode ?? "",
      referenceSolution: question.referenceSolution ?? "",
      ...(question.executionMode !== "PROGRAM" ? { methodContract: pick(question.methodContract, ["typeName", "methodName", "parameterNames", "parameterTypes", "returnType"]) } : {}),
      codingTestCases: (question.codingTestCases ?? []).map((testCase) => (
        pick(testCase, ["id", "displayOrder", "visibility", "input", "expectedOutput", "weight"])
      )),
    } : {}),
  })),
});
const normalizeEditorPayload = (payload) => payload?.assessment
  ? { ...payload, assessment: normalizeTeacherAssessmentGraph(payload.assessment) }
  : payload;

export const listTeacherClassrooms = async ({ signal } = {}) => {
  const response = await axios.get(buildApiUrl("/api/teacher/classrooms"), config(signal));
  return response.data;
};

export const listTeacherAssessments = async ({ classroomId, lessonKey, signal }) => {
  const response = await axios.get(
    buildApiUrl(`${base(classroomId)}?lessonKey=${segment(lessonKey)}`),
    config(signal),
  );
  return response.data;
};

export const createTeacherAssessment = async ({ classroomId, signal, ...input }) => {
  const response = await axios.post(buildApiUrl(base(classroomId)), input, config(signal));
  return normalizeEditorPayload(response.data);
};

export const listCustomLessonAssessmentDrafts = async ({ classroomId, placementId, signal }) => {
  const response = await axios.get(buildApiUrl(customBase(classroomId, placementId)), config(signal));
  return response.data;
};

export const listCustomAssessmentReportingTargets = async ({ classroomId, signal }) => {
  const response = await axios.get(buildApiUrl(
    `/api/teacher/classrooms/${segment(classroomId)}/lesson-placements/assessment-reporting`,
  ), config(signal));
  return response.data;
};

export const createCustomLessonAssessmentDraft = async ({ classroomId, placementId, signal, ...input }) => {
  const response = await axios.post(
    buildApiUrl(customBase(classroomId, placementId)), input, config(signal),
  );
  return normalizeEditorPayload(response.data);
};

export const loadCustomLessonAssessmentDraft = async ({
  classroomId, placementId, assessmentId, signal,
}) => {
  const response = await axios.get(
    buildApiUrl(`${customBase(classroomId, placementId)}/${segment(assessmentId)}`),
    config(signal),
  );
  return normalizeEditorPayload(response.data);
};

export const saveCustomLessonAssessmentDraft = async ({
  classroomId, placementId, assessmentId, graph, signal,
}) => {
  const response = await axios.put(
    buildApiUrl(`${customBase(classroomId, placementId)}/${segment(assessmentId)}`),
    serializeTeacherAssessmentGraph(graph),
    config(signal),
  );
  return normalizeEditorPayload(response.data);
};

export const reviewCustomLessonAssessmentRevision = async ({
  classroomId, placementId, assessmentId, version, targetLessonVersion, signal,
}) => {
  const response = await axios.post(
    buildApiUrl(`${customBase(classroomId, placementId)}/${segment(assessmentId)}/review-revision`),
    { version, targetLessonVersion },
    config(signal),
  );
  return normalizeEditorPayload(response.data);
};

export const deleteCustomLessonAssessmentDraft = async ({
  classroomId, placementId, assessmentId, signal,
}) => {
  await axios.delete(
    buildApiUrl(`${customBase(classroomId, placementId)}/${segment(assessmentId)}`),
    config(signal),
  );
};

export const listBuiltInAssessmentTemplates = async ({ signal } = {}) => {
  const response = await axios.get(buildApiUrl("/api/teacher/assessment-templates"), config(signal));
  return response.data;
};

export const importBuiltInAssessmentTemplate = async ({
  classroomId, templateKey, templateVersion, signal,
}) => {
  const response = await axios.post(
    buildApiUrl(`${base(classroomId)}/from-template`),
    { templateKey, templateVersion },
    config(signal),
  );
  return normalizeEditorPayload(response.data);
};

export const createTemplateImportController = ({ request, onSuccess, onPending, onError }) => {
  let scope = "";
  let version = 0;
  let pending = false;
  let abortController = null;
  return {
    setScope(nextScope) {
      if (nextScope === scope) return;
      scope = nextScope;
      version += 1;
      abortController?.abort();
      abortController = null;
      if (pending) onPending(false);
      pending = false;
    },
    async importTemplate(input) {
      if (pending || !input?.scope || input.scope !== scope) return false;
      pending = true;
      const requestVersion = ++version;
      abortController = new AbortController();
      onPending(true);
      try {
        const result = await request({ ...input, signal: abortController.signal });
        if (requestVersion !== version || input.scope !== scope) return false;
        onSuccess(result);
        return true;
      } catch (error) {
        if (requestVersion === version && input.scope === scope && error?.code !== "ERR_CANCELED") {
          onError(error);
        }
        return false;
      } finally {
        if (requestVersion === version) {
          pending = false;
          abortController = null;
          onPending(false);
        }
      }
    },
  };
};

export const copyTeacherAssessment = async ({ destinationClassroomId, signal, ...input }) => {
  const response = await axios.post(
    buildApiUrl(`${base(destinationClassroomId)}/copy`),
    input,
    config(signal),
  );
  return normalizeEditorPayload(response.data);
};

export const loadTeacherAssessment = async ({ classroomId, assessmentId, signal }) => {
  const response = await axios.get(
    buildApiUrl(`${base(classroomId)}/${segment(assessmentId)}`),
    config(signal),
  );
  return normalizeEditorPayload(response.data);
};

export const getTeacherAssessmentResults = async ({ classroomId, assessmentId, signal }) => {
  const response = await axios.get(
    buildApiUrl(`${base(classroomId)}/${segment(assessmentId)}/results`),
    config(signal),
  );
  return response.data;
};

export const getCustomTeacherAssessmentResults = async ({
  classroomId, placementId, assessmentId, signal,
}) => {
  const response = await axios.get(buildApiUrl(
    `${customBase(classroomId, placementId)}/${segment(assessmentId)}/results`,
  ), config(signal));
  return response.data;
};

const additionalAttemptPath = ({ classroomId, assessmentId, studentId }) => (
  `${base(classroomId)}/${segment(assessmentId)}/students/${segment(studentId)}/additional-attempt`
);

export const getAdditionalAttemptEligibility = async ({ signal, ...identity }) => {
  const response = await axios.get(buildApiUrl(additionalAttemptPath(identity)), config(signal));
  return response.data;
};

export const grantAdditionalAssessmentAttempt = async ({ reason, idempotencyKey, signal, ...identity }) => {
  const response = await axios.post(buildApiUrl(additionalAttemptPath(identity)), { reason: reason || null }, {
    ...config(signal),
    headers: { ...getAuthHeaders(), "Idempotency-Key": idempotencyKey },
  });
  return response.data;
};

const customAdditionalAttemptPath = ({ classroomId, placementId, assessmentId, studentId }) => (
  `${customBase(classroomId, placementId)}/${segment(assessmentId)}/students/${segment(studentId)}/additional-attempt`
);

export const getCustomAdditionalAttemptEligibility = async ({ signal, ...identity }) => {
  const response = await axios.get(buildApiUrl(customAdditionalAttemptPath(identity)), config(signal));
  return response.data;
};

export const grantCustomAdditionalAssessmentAttempt = async ({
  reason, idempotencyKey, signal, ...identity
}) => {
  const response = await axios.post(
    buildApiUrl(customAdditionalAttemptPath(identity)),
    { reason: reason || null },
    {
      ...config(signal),
      headers: { ...getAuthHeaders(), "Idempotency-Key": idempotencyKey },
    },
  );
  return response.data;
};

export const createAttemptGrantController = ({ request, reconcile, onPending, onSuccess, onError }) => {
  let scope = "";
  let version = 0;
  let pending = false;
  let controller = null;
  return {
    setScope(nextScope) {
      if (scope === nextScope) return;
      scope = nextScope;
      version += 1;
      controller?.abort();
      controller = null;
      pending = false;
      onPending(false);
    },
    async grant(input) {
      if (pending || !input?.scope || input.scope !== scope) return false;
      pending = true;
      const requestVersion = ++version;
      controller = new AbortController();
      onPending(true);
      try {
        let result;
        try {
          result = await request({ ...input, signal: controller.signal });
        } catch (error) {
          if (error?.response || error?.code === "ERR_CANCELED") throw error;
          const authoritative = await reconcile({ ...input, signal: controller.signal });
          if (Number(authoritative?.allowance?.additionalAttemptsAvailable) < 1) throw error;
          result = { ...authoritative, reconciled: true };
        }
        if (requestVersion !== version || input.scope !== scope) return false;
        onSuccess(result);
        return true;
      } catch (error) {
        if (requestVersion === version && input.scope === scope && error?.code !== "ERR_CANCELED") onError(error);
        return false;
      } finally {
        if (requestVersion === version) {
          pending = false;
          controller = null;
          onPending(false);
        }
      }
    },
  };
};

const downloadFilename = (headers, fallback) => {
  const disposition = typeof headers?.get === "function"
    ? headers.get("content-disposition")
    : headers?.["content-disposition"];
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition || "");
  if (encoded) {
    try { return decodeURIComponent(encoded[1]); } catch { return fallback; }
  }
  return /filename="([^"]+)"/i.exec(disposition || "")?.[1] || fallback;
};

export const getTeacherAssessmentScoreSheet = async ({ classroomId, lessonKey, signal }) => {
  const response = await axios.get(buildApiUrl(
    `/api/teacher/classrooms/${segment(classroomId)}/lessons/${segment(lessonKey)}/assessment-score-sheet.csv`,
  ), {
    ...config(signal),
    responseType: "blob",
  });
  return {
    blob: response.data,
    filename: downloadFilename(response.headers, `sharprunner-${lessonKey}-assessment-score-sheet.csv`),
  };
};

export const getCustomTeacherAssessmentScoreSheet = async ({ classroomId, placementId, signal }) => {
  const response = await axios.get(buildApiUrl(
    `/api/teacher/classrooms/${segment(classroomId)}/lesson-placements/${segment(placementId)}/assessment-score-sheet.csv`,
  ), {
    ...config(signal),
    responseType: "blob",
  });
  return {
    blob: response.data,
    filename: downloadFilename(
      response.headers,
      `sharprunner-placement-${placementId}-assessment-score-sheet.csv`,
    ),
  };
};

export const saveTeacherAssessmentScoreSheet = ({ blob, filename }, {
  documentRef = document,
  createObjectUrl = (value) => URL.createObjectURL(value),
  revokeObjectUrl = (value) => URL.revokeObjectURL(value),
} = {}) => {
  const objectUrl = createObjectUrl(blob);
  try {
    const link = documentRef.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    link.hidden = true;
    documentRef.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    revokeObjectUrl(objectUrl);
  }
};

export const createScoreSheetDownloadController = ({ request, onReady, onPending, onError }) => {
  let scope = "";
  let version = 0;
  let pending = false;
  let abortController = null;
  return {
    setScope(nextScope) {
      if (nextScope === scope) return;
      scope = nextScope;
      version += 1;
      abortController?.abort();
      abortController = null;
      if (pending) onPending(false);
      pending = false;
    },
    async download(input) {
      if (pending || !input?.scope || input.scope !== scope) return false;
      pending = true;
      const requestVersion = ++version;
      abortController = new AbortController();
      onPending(true);
      try {
        const result = await request({ ...input, signal: abortController.signal });
        if (requestVersion !== version || input.scope !== scope) return false;
        onReady(result);
        return true;
      } catch (error) {
        if (requestVersion === version && input.scope === scope && error?.code !== "ERR_CANCELED") {
          onError(error);
        }
        return false;
      } finally {
        if (requestVersion === version) {
          pending = false;
          abortController = null;
          onPending(false);
        }
      }
    },
  };
};

export const saveTeacherAssessment = async ({ classroomId, assessmentId, graph, signal }) => {
  const response = await axios.put(
    buildApiUrl(`${base(classroomId)}/${segment(assessmentId)}`),
    serializeTeacherAssessmentGraph(graph),
    config(signal),
  );
  return normalizeEditorPayload(response.data);
};

const action = async ({ classroomId, assessmentId, version, name, signal }) => {
  const response = await axios.post(
    buildApiUrl(`${base(classroomId)}/${segment(assessmentId)}/${name}`),
    { version },
    config(signal),
  );
  return response.data;
};

export const publishTeacherAssessment = (input) => action({ ...input, name: "publish" });
export const unpublishTeacherAssessment = (input) => action({ ...input, name: "unpublish" });

export const deleteTeacherAssessment = async ({ classroomId, assessmentId, signal }) => {
  await axios.delete(buildApiUrl(`${base(classroomId)}/${segment(assessmentId)}`), config(signal));
};

const SAFE_MESSAGES = Object.freeze({
  ASSESSMENT_TYPE_EXISTS: "That assessment type already exists for this lesson.",
  ASSESSMENT_VERSION_CONFLICT: "This assessment changed elsewhere. Reload it before continuing.",
  VERSION_CONFLICT: "This assessment changed elsewhere. Reload it before continuing.",
  ASSESSMENT_LOCKED: "This assessment is locked because a student attempt exists.",
  ASSESSMENT_PUBLISHED: "Unpublish this assessment before deleting it.",
  ASSESSMENT_TYPE_MISMATCH: "Only assessments of the same type can be copied.",
  SOURCE_ASSESSMENT_INVALID: "The source assessment cannot be copied in its current state.",
  ASSESSMENT_INVALID: "Complete the assessment before publishing it.",
  CODING_EXECUTION_UNAVAILABLE: "Coding assessments can be saved as drafts, but publishing is unavailable until secure coding execution is available.",
  INVALID_QUESTION: "Check the question text, points, objective key, and choices.",
  INVALID_CHOICE: "Each question needs valid choices and exactly one correct answer.",
  FORBIDDEN: "You do not have permission to manage this classroom.",
  ASSESSMENT_NOT_FOUND: "This assessment could not be found in the selected classroom.",
  INVALID_LESSON_KEY: "Select an eligible academic lesson.",
  ACTIVE_ATTEMPT_EXISTS: "The student already has an active attempt.",
  UNUSED_GRANT_EXISTS: "The student already has an unused teacher-granted attempt.",
  ATTEMPTS_REMAINING: "The student still has an unused standard attempt.",
  NO_SUBMITTED_ATTEMPT: "The student must submit an attempt before another can be granted.",
  POST_ALREADY_PASSED: "The student has already passed this required POST assessment.",
  POST_OUTCOME_UNAVAILABLE: "The required POST outcome is unavailable, so another attempt cannot be granted safely.",
  IDEMPOTENCY_KEY_REUSED: "This request key was already used for a different grant.",
  CLASSROOM_ARCHIVED: "Restore this classroom before granting an additional attempt.",
  GRANT_REQUEST_CONFLICT: "Another grant request was processed. Eligibility has been refreshed.",
  CUSTOM_ASSESSMENT_REVISION_REVIEW_REQUIRED: "Review the current lesson revision before saving this draft.",
  LESSON_VERSION_CONFLICT: "The lesson changed again. Reload before reviewing this revision.",
  ASSESSMENT_TARGET_ARCHIVED: "Restore this lesson placement before editing its assessments.",
});

export const normalizeTeacherAssessmentError = (source) => {
  const status = Number(source?.response?.status) || 0;
  const payload = source?.response?.data?.error ?? source?.response?.data ?? {};
  const code = typeof payload.code === "string" ? payload.code : (status ? "REQUEST_FAILED" : "NETWORK_ERROR");
  const fallback = status === 401 ? "Sign in again to continue."
    : status === 403 ? "You do not have permission to manage this classroom."
      : status === 404 ? "The requested assessment was not found."
        : status >= 500 ? "The assessment service is temporarily unavailable."
          : "Unable to complete the assessment request.";
  return {
    code,
    message: SAFE_MESSAGES[code] ?? fallback,
    status,
    ...(Number.isSafeInteger(Number(payload.currentVersion))
      ? { currentVersion: Number(payload.currentVersion) } : {}),
  };
};
