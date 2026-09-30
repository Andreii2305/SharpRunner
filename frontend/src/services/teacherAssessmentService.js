import axios from "axios";
import { buildApiUrl, getAuthHeaders } from "../utils/auth.js";

const segment = (value) => encodeURIComponent(String(value));
const config = (signal) => ({ headers: getAuthHeaders(), ...(signal ? { signal } : {}) });
const base = (classroomId) => `/api/teacher/classrooms/${segment(classroomId)}/assessments`;

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
  return response.data;
};

export const loadTeacherAssessment = async ({ classroomId, assessmentId, signal }) => {
  const response = await axios.get(
    buildApiUrl(`${base(classroomId)}/${segment(assessmentId)}`),
    config(signal),
  );
  return response.data;
};

export const getTeacherAssessmentResults = async ({ classroomId, assessmentId, signal }) => {
  const response = await axios.get(
    buildApiUrl(`${base(classroomId)}/${segment(assessmentId)}/results`),
    config(signal),
  );
  return response.data;
};

export const saveTeacherAssessment = async ({ classroomId, assessmentId, graph, signal }) => {
  const response = await axios.put(
    buildApiUrl(`${base(classroomId)}/${segment(assessmentId)}`),
    graph,
    config(signal),
  );
  return response.data;
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
  ASSESSMENT_INVALID: "Complete the assessment before publishing it.",
  INVALID_QUESTION: "Check the question text, points, objective key, and choices.",
  INVALID_CHOICE: "Each question needs valid choices and exactly one correct answer.",
  FORBIDDEN: "You do not have permission to manage this classroom.",
  ASSESSMENT_NOT_FOUND: "This assessment could not be found in the selected classroom.",
  INVALID_LESSON_KEY: "Select an eligible academic lesson.",
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
  return { code, message: SAFE_MESSAGES[code] ?? fallback, status };
};
