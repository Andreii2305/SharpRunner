import axios from "axios";
import { buildApiUrl, getAuthHeaders } from "../utils/auth.js";

const SAFE_DETAIL_KEYS = [
  "lessonKey",
  "prerequisiteLessonKey",
  "assessmentId",
  "nextAction",
];

export class StudentAssessmentRequestError extends Error {
  constructor(message, { status = null, code = null, details = {} } = {}) {
    super(message);
    this.name = "StudentAssessmentRequestError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const safeDetails = (value) => Object.fromEntries(
  SAFE_DETAIL_KEYS
    .filter((key) => value?.[key] !== undefined)
    .map((key) => [key, value[key]]),
);

export const normalizeStudentAssessmentError = (error) => {
  if (error instanceof StudentAssessmentRequestError) return error;
  if (axios.isCancel(error) || error?.name === "AbortError" || error?.code === "ERR_CANCELED") {
    const canceled = new Error("Request canceled");
    canceled.name = "CanceledError";
    canceled.code = "ERR_CANCELED";
    return canceled;
  }

  const status = Number(error?.response?.status) || null;
  const body = error?.response?.data;
  const message = status && status < 500 && typeof body?.message === "string"
    ? body.message
    : "The assessment request could not be completed";

  return new StudentAssessmentRequestError(message, {
    status,
    code: typeof body?.code === "string" ? body.code : null,
    details: safeDetails(body?.details),
  });
};

const authorizedConfig = (signal, headers = {}) => ({
  headers: { ...getAuthHeaders(), ...headers },
  signal,
});

const request = async (operation) => {
  try {
    const { data } = await operation();
    return data;
  } catch (error) {
    throw normalizeStudentAssessmentError(error);
  }
};

const segment = (value) => encodeURIComponent(String(value));
const customBase = ({ classroomId, placementId, type }) => (
  `/api/assessments/classrooms/${segment(classroomId)}`
  + `/lesson-placements/${segment(placementId)}/assessments/${segment(String(type).toUpperCase())}`
);

export const discoverCustomAssessment = ({ classroomId, placementId, type, signal }) => request(
  () => axios.get(buildApiUrl(customBase({ classroomId, placementId, type })), authorizedConfig(signal)),
);

export const discoverAssessment = ({ classroomId, lessonKey, type, signal }) => request(
  () => axios.get(
    buildApiUrl(
      `/api/assessments/classrooms/${segment(classroomId)}`
      + `/lessons/${segment(lessonKey)}/${segment(String(type).toUpperCase())}`,
    ),
    authorizedConfig(signal),
  ),
);

export const getAssessment = ({ assessmentId, signal }) => request(
  () => axios.get(
    buildApiUrl(`/api/assessments/${segment(assessmentId)}`),
    authorizedConfig(signal),
  ),
);

export const startOrResumeAttempt = ({ assessmentId, classroomId, placementId, type, signal }) => request(
  () => axios.post(
    buildApiUrl(placementId
      ? `${customBase({ classroomId, placementId, type })}/${segment(assessmentId)}/attempts`
      : `/api/assessments/${segment(assessmentId)}/attempts`),
    {},
    authorizedConfig(signal),
  ),
);

export const getAttempt = ({ attemptId, classroomId, placementId, type, signal }) => request(
  () => axios.get(
    buildApiUrl(placementId
      ? `${customBase({ classroomId, placementId, type })}/attempts/${segment(attemptId)}`
      : `/api/assessments/attempts/${segment(attemptId)}`),
    authorizedConfig(signal),
  ),
);

export const saveResponse = ({
  attemptId,
  questionId,
  selectedChoiceId,
  sourceCode,
  classroomId,
  placementId,
  type,
  signal,
}) => {
  const hasChoice = selectedChoiceId !== undefined;
  const hasSource = sourceCode !== undefined;
  if (hasChoice === hasSource) {
    return Promise.reject(new TypeError(
      "A response save must contain exactly one of selectedChoiceId or sourceCode",
    ));
  }
  const body = hasChoice ? { selectedChoiceId } : { sourceCode };
  return request(() => axios.put(
    buildApiUrl(
      (placementId ? `${customBase({ classroomId, placementId, type })}/attempts/${segment(attemptId)}`
        : `/api/assessments/attempts/${segment(attemptId)}`)
      + `/responses/${segment(questionId)}`,
    ),
    body,
    authorizedConfig(signal),
  ));
};

export const runCodingQuestion = ({ attemptId, questionId, classroomId, placementId, type, signal }) => request(
  () => axios.post(
    buildApiUrl(
      (placementId ? `${customBase({ classroomId, placementId, type })}/attempts/${segment(attemptId)}`
        : `/api/assessments/attempts/${segment(attemptId)}`)
      + `/questions/${segment(questionId)}/run`,
    ),
    {},
    authorizedConfig(signal),
  ),
);

export const submitAttempt = ({ attemptId, idempotencyKey, classroomId, placementId, type, signal }) => request(
  () => axios.post(
    buildApiUrl(placementId
      ? `${customBase({ classroomId, placementId, type })}/attempts/${segment(attemptId)}/submit`
      : `/api/assessments/attempts/${segment(attemptId)}/submit`),
    {},
    authorizedConfig(signal, { "Idempotency-Key": idempotencyKey }),
  ),
);

export const getAttemptResult = ({
  attemptId,
  classroomId,
  lessonKey,
  placementId,
  type,
  signal,
}) => request(
  () => axios.get(
    buildApiUrl(classroomId && placementId && type
      ? `${customBase({ classroomId, placementId, type })}/attempts/${segment(attemptId)}/result`
      : classroomId && lessonKey && type ? `/api/assessments/classrooms/${segment(classroomId)}`
        + `/lessons/${segment(lessonKey)}/${segment(String(type).toUpperCase())}`
        + `/attempts/${segment(attemptId)}/result`
      : `/api/assessments/attempts/${segment(attemptId)}/result`),
    authorizedConfig(signal),
  ),
);

export const getProgress = ({ classroomId, signal }) => request(
  () => axios.get(
    buildApiUrl(`/api/progress/me?classroomId=${segment(classroomId)}`),
    authorizedConfig(signal),
  ),
);
