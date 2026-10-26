import axios from "axios";
import { buildApiUrl, getAuthHeaders } from "../utils/auth.js";

const segment = (value) => encodeURIComponent(String(value));

export const sendTeacherCheckIn = async ({
  classroomId,
  studentId,
  message,
  idempotencyKey,
  signal,
}) => {
  const response = await axios.post(
    buildApiUrl(`/api/teacher/classrooms/${segment(classroomId)}/students/${segment(studentId)}/check-ins`),
    { message },
    {
      headers: { ...getAuthHeaders(), "Idempotency-Key": idempotencyKey },
      ...(signal ? { signal } : {}),
    },
  );
  return response.data;
};
