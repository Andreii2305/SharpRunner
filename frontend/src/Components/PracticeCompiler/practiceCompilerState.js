export const classifyPracticeRequestError = (error) => {
  const status = error.response?.status;
  const data = error.response?.data;
  if (data?.stdout != null || data?.stderr != null) return data;
  if (status === 401 || status === 403) return { success: false, errorType: "auth", stderr: "Your session is no longer authorized to run practice code. Sign in again, then retry." };
  if (status === 400) return { success: false, rejected: true, stderr: data?.message || "The practice request was invalid. Check the code and try again." };
  if (status === 408) return { success: false, timedOut: true, errorType: "timeout", stderr: data?.message || "Execution took too long and was stopped." };
  if (status === 429) {
    const runnerBusy = data?.code === "PRACTICE_RUNNER_BUSY";
    return { success: false, code: data?.code || "PRACTICE_RATE_LIMITED", errorType: runnerBusy ? "runner_busy" : "rate_limit", retryAfterMs: data?.retryAfterMs || 5000, stderr: data?.message || (runnerBusy ? "The compiler is busy. Please try again in a moment." : "Too many runs. Please wait a moment and try again.") };
  }
  if (status === 500) return { success: false, errorType: "internal", stderr: data?.message || "The compiler encountered an internal error. Try again in a moment." };
  if (status === 503 && data?.code === "PRACTICE_RUNNER_STARTING") return { ...data, success: false, unavailable: true, errorType: "service_starting", stderr: data.stderr || data.message };
  return { success: false, unavailable: true, errorType: "service_unavailable", stderr: data?.message || "The compiler is temporarily unavailable. Please try again." };
};
