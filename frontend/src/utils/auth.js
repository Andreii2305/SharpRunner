const TOKEN_KEY = "token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);

export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);

export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

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
