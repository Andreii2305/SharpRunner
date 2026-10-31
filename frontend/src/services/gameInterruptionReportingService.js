import axios from "axios";
import { buildApiUrl, getAuthHeaders } from "../utils/auth.js";

const segment = (value) => encodeURIComponent(String(value));

export const startGameInterruptionSession = async ({
  classroomId,
  levelKey,
  sessionKey,
  signal,
}) => {
  const response = await axios.post(
    buildApiUrl(`/api/progress/level/${segment(levelKey)}/interruption-sessions`),
    { classroomId, sessionKey },
    {
      headers: getAuthHeaders(),
      ...(signal ? { signal } : {}),
    },
  );
  return response.data;
};

export const recordGameInterruptionEvent = async ({
  classroomId,
  levelKey,
  sessionId,
  eventKey,
  eventType,
  signal,
}) => {
  const response = await axios.post(
    buildApiUrl(
      `/api/progress/level/${segment(levelKey)}/interruption-sessions/${segment(sessionId)}/events`,
    ),
    { classroomId, eventKey, eventType },
    {
      headers: getAuthHeaders(),
      ...(signal ? { signal } : {}),
    },
  );
  return response.data;
};
