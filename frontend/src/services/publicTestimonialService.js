export const PUBLIC_TESTIMONIAL_LIMIT = 20;
const DEFAULT_API_BASE_URL = (
  import.meta.env?.VITE_API_BASE_URL || "http://localhost:5000"
).replace(/\/$/, "");

const unavailable = () => Object.assign(
  new Error("Unable to load testimonials."),
  { code: "PUBLIC_TESTIMONIALS_UNAVAILABLE" },
);

export const createPublicTestimonialService = ({
  apiBaseUrl = DEFAULT_API_BASE_URL,
  fetchImpl = globalThis.fetch,
} = {}) => ({
  async list({ signal } = {}) {
    if (typeof fetchImpl !== "function") throw unavailable();
    let response;
    try {
      response = await fetchImpl(
        `${apiBaseUrl.replace(/\/$/, "")}/api/public/testimonials?page=1&limit=${PUBLIC_TESTIMONIAL_LIMIT}`,
        {
          method: "GET",
          cache: "no-store",
          headers: { Accept: "application/json" },
          ...(signal ? { signal } : {}),
        },
      );
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      throw unavailable();
    }
    if (!response?.ok) throw unavailable();
    try {
      return await response.json();
    } catch {
      throw unavailable();
    }
  },
});

export const publicTestimonialService = createPublicTestimonialService();
