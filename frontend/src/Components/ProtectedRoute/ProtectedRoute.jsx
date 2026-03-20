import { useEffect, useState } from "react";
import axios from "axios";
import { Navigate, useLocation } from "react-router-dom";
import {
  buildApiUrl,
  getAuthHeaders,
  getHomeRouteForCurrentUser,
  getUserRole,
  isAuthenticated,
} from "../../utils/auth";

const MEMBERSHIP_STATUS = {
  IDLE: "idle",
  LOADING: "loading",
  READY: "ready",
  MISSING: "missing",
};

function ProtectedRoute({
  children,
  allowedRoles = [],
  requireClassMembership = false,
}) {
  const location = useLocation();
  const userRole = getUserRole();
  const shouldCheckClassMembership =
    requireClassMembership && userRole === "student";
  const [membershipStatus, setMembershipStatus] = useState(
    shouldCheckClassMembership ? MEMBERSHIP_STATUS.IDLE : MEMBERSHIP_STATUS.READY,
  );

  useEffect(() => {
    let isMounted = true;

    if (!isAuthenticated()) {
      setMembershipStatus(MEMBERSHIP_STATUS.READY);
      return () => {
        isMounted = false;
      };
    }

    if (!shouldCheckClassMembership) {
      setMembershipStatus(MEMBERSHIP_STATUS.READY);
      return () => {
        isMounted = false;
      };
    }

    const checkMembership = async () => {
      setMembershipStatus(MEMBERSHIP_STATUS.LOADING);

      try {
        const response = await axios.get(buildApiUrl("/api/classrooms/me"), {
          headers: getAuthHeaders(),
        });

        if (!isMounted) {
          return;
        }

        const hasActiveMembership = Boolean(response.data?.hasActiveMembership);
        setMembershipStatus(
          hasActiveMembership ? MEMBERSHIP_STATUS.READY : MEMBERSHIP_STATUS.MISSING
        );
      } catch (error) {
        if (!isMounted) {
          return;
        }

        if (error.response?.status === 403) {
          setMembershipStatus(MEMBERSHIP_STATUS.MISSING);
          return;
        }

        setMembershipStatus(MEMBERSHIP_STATUS.READY);
      }
    };

    checkMembership();

    return () => {
      isMounted = false;
    };
  }, [shouldCheckClassMembership]);

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (allowedRoles.length > 0) {
    const isAllowed = allowedRoles.includes(userRole);

    if (!isAllowed) {
      return <Navigate to={getHomeRouteForCurrentUser()} replace />;
    }
  }

  if (shouldCheckClassMembership) {
    if (
      membershipStatus === MEMBERSHIP_STATUS.IDLE ||
      membershipStatus === MEMBERSHIP_STATUS.LOADING
    ) {
      return null;
    }

    if (membershipStatus === MEMBERSHIP_STATUS.MISSING) {
      return (
        <Navigate
          to="/join-class"
          replace
          state={{ from: location.pathname }}
        />
      );
    }
  }

  return children;
}

export default ProtectedRoute;
