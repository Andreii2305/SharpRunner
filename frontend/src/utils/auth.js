const TOKEN_KEY = "token";
const USER_KEY = "user";

const normalizeRole = (role) =>
  typeof role === "string" ? role.trim().toLowerCase() : "";
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

export const buildApiUrl = (path) => `${API_BASE_URL}${path}`;

export const getToken = () => localStorage.getItem(TOKEN_KEY);

export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);

export const getUser = () => {
  const serializedUser = localStorage.getItem(USER_KEY);

  if (!serializedUser) {
    return null;
  }

  try {
    return JSON.parse(serializedUser);
  } catch {
    localStorage.removeItem(USER_KEY);
    return null;
  }
};

export const setUser = (user) => {
  if (!user) {
    localStorage.removeItem(USER_KEY);
    return;
  }

  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const getUserRole = () => normalizeRole(getUser()?.role);

export const getHomeRouteByRole = (role) => {
  const normalizedRole = normalizeRole(role);

  if (normalizedRole === "admin") {
    return "/admin";
  }

  if (normalizedRole === "teacher") {
    return "/teacher";
  }

  return "/dashboard";
};

export const getHomeRouteForCurrentUser = () => getHomeRouteByRole(getUserRole());

export const clearToken = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

export const getAuthHeaders = () => {
  const token = getToken();
  if (!token) {
    return {};
  }

  return {
    Authorization: `Bearer ${token}`,
  };
};

const decodeJwtPayload = (token) => {
  try {
    const base64UrlPayload = token.split(".")[1];
    if (!base64UrlPayload) {
      return null;
    }

    const base64Payload = base64UrlPayload
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(base64UrlPayload.length / 4) * 4, "=");

    return JSON.parse(atob(base64Payload));
  } catch {
    return null;
  }
};

export const isAuthenticated = () => {
  const token = getToken();
  if (!token) {
    return false;
  }

  const payload = decodeJwtPayload(token);

  // Token is malformed or can't be decoded.
  if (!payload) {
    clearToken();
    return false;
  }

  // Token has expired.
  if (payload.exp && payload.exp * 1000 <= Date.now()) {
    clearToken();
    return false;
  }

  return true;
};
