import { Navigate, useLocation } from "react-router-dom";
import {
  getHomeRouteForCurrentUser,
  getUserRole,
  isAuthenticated,
} from "../../utils/auth";

function ProtectedRoute({ children, allowedRoles = [] }) {
  const location = useLocation();

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (allowedRoles.length > 0) {
    const userRole = getUserRole();
    const isAllowed = allowedRoles.includes(userRole);

    if (!isAllowed) {
      return <Navigate to={getHomeRouteForCurrentUser()} replace />;
    }
  }

  return children;
}

export default ProtectedRoute;
