import axios from "axios";
import { buildApiUrl, getAuthHeaders } from "../utils/auth.js";

const segment = (value) => encodeURIComponent(String(value));

export const listStudentClassroomFeedback = async ({ page = 1, limit = 20, signal } = {}) => {
  const response = await axios.get(
    buildApiUrl(`/api/classrooms/feedback/me?page=${segment(page)}&limit=${segment(limit)}`),
    {
      headers: getAuthHeaders(),
      ...(signal ? { signal } : {}),
    },
  );
  return response.data;
};

export const listEligibleFeedbackClassrooms = async ({ signal } = {}) => {
  const response = await axios.get(
    buildApiUrl("/api/classrooms/me"),
    {
      headers: getAuthHeaders(),
      ...(signal ? { signal } : {}),
    },
  );
  return response.data;
};

export const submitStudentClassroomFeedback = async ({
  classroomId,
  message,
  idempotencyKey,
  signal,
}) => {
  const response = await axios.post(
    buildApiUrl(`/api/classrooms/${segment(classroomId)}/feedback`),
    { message },
    {
      headers: { ...getAuthHeaders(), "Idempotency-Key": idempotencyKey },
      ...(signal ? { signal } : {}),
    },
  );
  return response.data;
};
