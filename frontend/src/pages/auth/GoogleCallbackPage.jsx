import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { setToken, setUser, getHomeRouteByRole, buildApiUrl } from "../../utils/auth";
import axios from "axios";

export default function GoogleCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = params.get("token");
    const error = params.get("error");

    if (error || !token) {
      navigate("/login?error=google_auth_failed", { replace: true });
      return;
    }

    setToken(token);

    axios
      .get(buildApiUrl("/api/auth/me"), {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        setUser(res.data.user);
        navigate(getHomeRouteByRole(res.data.user?.role), { replace: true });
      })
      .catch(() => {
        navigate(getHomeRouteByRole(null), { replace: true });
      });
  }, []);

  return null;
}
