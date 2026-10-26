import axios from "axios";
import { buildApiUrl, getAuthHeaders } from "../utils/auth.js";

const segment = (value) => encodeURIComponent(String(value));

export const listTeacherClassroomFeedback = async ({ classroomId, page = 1, limit = 20, signal }) => {
  const response = await axios.get(
    buildApiUrl(
      `/api/teacher/classrooms/${segment(classroomId)}/student-feedback?page=${segment(page)}&limit=${segment(limit)}`,
    ),
    {
      headers: getAuthHeaders(),
      ...(signal ? { signal } : {}),
    },
  );
  return response.data;
};
