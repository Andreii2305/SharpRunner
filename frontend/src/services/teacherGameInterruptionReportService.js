import axios from "axios";
import { buildApiUrl, getAuthHeaders } from "../utils/auth.js";

const segment = (value) => encodeURIComponent(String(value));

export const getTeacherGameInterruptionReport = async ({
  studentId,
  classroomId,
  levelKey,
  sessionPage = 1,
  eventPage = 1,
  signal,
}) => {
  const query = new URLSearchParams({
    classroomId: String(classroomId),
    sessionPage: String(sessionPage),
    sessionLimit: "20",
    eventPage: String(eventPage),
    eventLimit: "20",
  });
  const response = await axios.get(
    buildApiUrl(
      `/api/teacher/analytics/students/${segment(studentId)}/game-interruptions/${segment(levelKey)}?${query}`,
    ),
    {
      headers: getAuthHeaders(),
      ...(signal ? { signal } : {}),
    },
  );
  return response.data;
};
