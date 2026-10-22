import axios from "axios";
import { buildApiUrl, getAuthHeaders } from "../utils/auth.js";

const config = (signal) => ({
  headers: getAuthHeaders(),
  ...(signal ? { signal } : {}),
});

export const getStudentClassroomSummary = async ({ signal } = {}) => {
  const response = await axios.get(
    buildApiUrl("/api/classrooms/me"),
    config(signal),
  );
  return response.data;
};

export const submitStudentJoinRequest = async ({ classCode }) => {
  const response = await axios.post(
    buildApiUrl("/api/classrooms/join"),
    { classCode },
    config(),
  );
  return response.data;
};
