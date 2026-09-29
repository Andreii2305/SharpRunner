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

export const startOrResumeAttempt = ({ assessmentId, signal }) => request(
  () => axios.post(
    buildApiUrl(`/api/assessments/${segment(assessmentId)}/attempts`),
    {},
    authorizedConfig(signal),
  ),
);

export const getAttempt = ({ attemptId, signal }) => request(
  () => axios.get(
    buildApiUrl(`/api/assessments/attempts/${segment(attemptId)}`),
    authorizedConfig(signal),
  ),
);

export const saveResponse = ({
  attemptId,
  questionId,
  selectedChoiceId,
  signal,
}) => request(
  () => axios.put(
    buildApiUrl(
      `/api/assessments/attempts/${segment(attemptId)}`
      + `/responses/${segment(questionId)}`,
    ),
    { selectedChoiceId },
    authorizedConfig(signal),
  ),
);

export const submitAttempt = ({ attemptId, idempotencyKey, signal }) => request(
  () => axios.post(
    buildApiUrl(`/api/assessments/attempts/${segment(attemptId)}/submit`),
    {},
    authorizedConfig(signal, { "Idempotency-Key": idempotencyKey }),
  ),
);

export const getAttemptResult = ({ attemptId, signal }) => request(
  () => axios.get(
    buildApiUrl(`/api/assessments/attempts/${segment(attemptId)}/result`),
    authorizedConfig(signal),
  ),
);

export const getProgress = ({ classroomId, signal }) => request(
  () => axios.get(
    buildApiUrl(`/api/progress/me?classroomId=${segment(classroomId)}`),
    authorizedConfig(signal),
  ),
);
