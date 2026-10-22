import axios from "axios";
import { buildApiUrl, getAuthHeaders } from "../utils/auth.js";

const segment = (value) => encodeURIComponent(String(value));
const config = (signal) => ({ headers: getAuthHeaders(), ...(signal ? { signal } : {}) });

export const listTeacherJoinRequests = async ({ classroomId, page, limit, signal }) => {
  const response = await axios.get(
    buildApiUrl(`/api/teacher/classrooms/${segment(classroomId)}/join-requests?page=${segment(page)}&limit=${segment(limit)}`),
    config(signal),
  );
  return response.data;
};

export const decideTeacherJoinRequest = async ({ classroomId, studentId, decision }) => {
  const response = await axios.patch(
    buildApiUrl(`/api/teacher/classrooms/${segment(classroomId)}/join-requests/${segment(studentId)}`),
    { decision },
    config(),
  );
  return response.data;
};
