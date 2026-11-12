import axios from "axios";
import { buildApiUrl, getAuthHeaders } from "../utils/auth.js";

const segment = (value) => encodeURIComponent(String(value));
const requestConfig = (signal) => ({
  headers: getAuthHeaders(),
  ...(signal ? { signal } : {}),
});

export const listAdminPlatformFeedback = async ({ page = 1, limit = 20, signal } = {}) => {
  const response = await axios.get(
    buildApiUrl(`/api/admin/feedback/platform?page=${segment(page)}&limit=${segment(limit)}`),
    requestConfig(signal),
  );
  return response.data;
};

export const listAdminTestimonials = async ({ status = "pending", page = 1, limit = 20, signal } = {}) => {
  const response = await axios.get(
    buildApiUrl(`/api/admin/feedback/testimonials?status=${segment(status)}&page=${segment(page)}&limit=${segment(limit)}`),
    requestConfig(signal),
  );
  return response.data;
};

export const getAdminTestimonial = async ({
  submissionId,
  revisionPage = 1,
  revisionLimit = 20,
  signal,
}) => {
  const response = await axios.get(
    buildApiUrl(`/api/admin/feedback/testimonials/${segment(submissionId)}?revisionPage=${segment(revisionPage)}&revisionLimit=${segment(revisionLimit)}`),
    requestConfig(signal),
  );
  return response.data;
};

export const moderateTestimonial = async ({
  action,
  submissionId,
  revisionId,
  explanation,
  signal,
}) => {
  const response = await axios.post(
    buildApiUrl(`/api/admin/feedback/testimonials/${segment(submissionId)}/revisions/${segment(revisionId)}/${segment(action)}`),
    action === "approve" ? {} : { explanation },
    requestConfig(signal),
  );
  return response.data;
};
