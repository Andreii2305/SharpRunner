import axios from "axios";
import { buildApiUrl, getAuthHeaders } from "../utils/auth.js";

const segment = (value) => encodeURIComponent(String(value));

export const listTeacherAssessmentAttention = async ({ classroomId, limit = 5, signal }) => {
  const response = await axios.get(
    buildApiUrl(
      `/api/teacher/classrooms/${segment(classroomId)}/students-needing-attention?limit=${segment(limit)}`,
    ),
    {
      headers: getAuthHeaders(),
      ...(signal ? { signal } : {}),
    },
  );
  return response.data;
};
