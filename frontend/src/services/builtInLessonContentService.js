import axios from "axios";
import { buildApiUrl, getAuthHeaders } from "../utils/auth.js";

const SAFE_DETAIL_KEYS = [
  "lessonKey",
  "prerequisiteLessonKey",
  "assessmentId",
  "nextAction",
];

class BuiltInLessonContentRequestError extends Error {
  constructor(message, { status = null, code = null, details = {} } = {}) {
    super(message);
    this.name = "BuiltInLessonContentRequestError";
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

const normalizeRequestError = (error) => {
  if (error instanceof BuiltInLessonContentRequestError) return error;
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
    : "The module request could not be completed";
  return new BuiltInLessonContentRequestError(message, {
    status,
    code: typeof body?.code === "string" ? body.code : null,
    details: safeDetails(body?.details),
  });
};

export const fetchPrimaryClassroomId = async ({ signal } = {}) => {
  try {
    const { data } = await axios.get(buildApiUrl("/api/progress/me"), {
      headers: getAuthHeaders(),
      signal,
    });
    const classroomId = Number(data?.classroomId);
    if (!Number.isSafeInteger(classroomId) || classroomId <= 0) {
      throw new BuiltInLessonContentRequestError(
        "An active classroom membership is required",
        { status: 403, code: "FORBIDDEN" },
      );
    }
    return classroomId;
  } catch (error) {
    throw normalizeRequestError(error);
  }
};

export const fetchBuiltInLessonContent = async ({ classroomId, lessonKey, signal }) => {
  try {
    const path = `/api/classrooms/${encodeURIComponent(String(classroomId))}`
      + `/built-in-lessons/${encodeURIComponent(String(lessonKey))}/content`;
    const { data } = await axios.get(buildApiUrl(path), {
      headers: getAuthHeaders(),
      signal,
    });
    return data;
  } catch (error) {
    throw normalizeRequestError(error);
  }
};
