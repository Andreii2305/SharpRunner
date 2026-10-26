import axios from "axios";
import { buildApiUrl, getAuthHeaders } from "../utils/auth.js";

const segment = (value) => encodeURIComponent(String(value));
const config = (signal) => ({
  headers: getAuthHeaders(),
  ...(signal ? { signal } : {}),
});

export const listStudentCheckIns = async ({ page = 1, limit = 20, signal } = {}) => {
  const response = await axios.get(
    buildApiUrl(`/api/notifications/check-ins?page=${segment(page)}&limit=${segment(limit)}`),
    config(signal),
  );
  return response.data;
};

export const markStudentCheckInRead = async ({ notificationId, signal } = {}) => {
  const response = await axios.post(
    buildApiUrl(`/api/notifications/${segment(notificationId)}/viewed`),
    {},
    config(signal),
  );
  return response.data;
};
