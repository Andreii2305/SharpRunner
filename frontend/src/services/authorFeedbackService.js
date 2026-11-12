import axios from "axios";
import { buildApiUrl, getAuthHeaders } from "../utils/auth.js";

const segment = (value) => encodeURIComponent(String(value));
const requestConfig = ({ signal, idempotencyKey } = {}) => ({
  headers: {
    ...getAuthHeaders(),
    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
  },
  ...(signal ? { signal } : {}),
});

export const listOwnPlatformFeedback = async ({ page = 1, limit = 20, signal } = {}) => {
  const response = await axios.get(
    buildApiUrl(`/api/feedback/platform/me?page=${segment(page)}&limit=${segment(limit)}`),
    requestConfig({ signal }),
  );
  return response.data;
};

export const submitPlatformFeedback = async ({ message, idempotencyKey, signal }) => {
  const response = await axios.post(
    buildApiUrl("/api/feedback/platform"),
    { message },
    requestConfig({ signal, idempotencyKey }),
  );
  return response.data;
};

export const getTestimonialOptions = async ({ signal } = {}) => {
  const response = await axios.get(
    buildApiUrl("/api/feedback/testimonials/options"),
    requestConfig({ signal }),
  );
  return response.data;
};

export const listOwnTestimonials = async ({ page = 1, limit = 20, signal } = {}) => {
  const response = await axios.get(
    buildApiUrl(`/api/feedback/testimonials/me?page=${segment(page)}&limit=${segment(limit)}`),
    requestConfig({ signal }),
  );
  return response.data;
};

export const getOwnTestimonial = async ({
  submissionId,
  revisionPage = 1,
  revisionLimit = 20,
  signal,
}) => {
  const response = await axios.get(
    buildApiUrl(`/api/feedback/testimonials/${segment(submissionId)}?revisionPage=${segment(revisionPage)}&revisionLimit=${segment(revisionLimit)}`),
    requestConfig({ signal }),
  );
  return response.data;
};

export const createTestimonial = async ({ payload, idempotencyKey, signal }) => {
  const response = await axios.post(
    buildApiUrl("/api/feedback/testimonials"),
    payload,
    requestConfig({ signal, idempotencyKey }),
  );
  return response.data;
};

export const createTestimonialRevision = async ({
  submissionId,
  payload,
  idempotencyKey,
  signal,
}) => {
  const response = await axios.post(
    buildApiUrl(`/api/feedback/testimonials/${segment(submissionId)}/revisions`),
    payload,
    requestConfig({ signal, idempotencyKey }),
  );
  return response.data;
};

export const withdrawTestimonial = async ({ submissionId, signal }) => {
  const response = await axios.post(
    buildApiUrl(`/api/feedback/testimonials/${segment(submissionId)}/withdraw`),
    {},
    requestConfig({ signal }),
  );
  return response.data;
};
