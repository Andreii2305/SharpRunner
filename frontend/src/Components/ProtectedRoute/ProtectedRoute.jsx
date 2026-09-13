import { useEffect, useState } from "react";
import axios from "axios";
import { Navigate, useLocation } from "react-router-dom";
import {
  buildApiUrl,
  clearToken,
  getAuthHeaders,
  getHomeRouteForCurrentUser,
  getUser,
  getUserRole,
  isAuthenticated,
  setUser,
} from "../../utils/auth";
import PolicyAcceptanceModal from "../PolicyAcceptanceModal/PolicyAcceptanceModal.jsx";

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
  const [policyCheck, setPolicyCheck] = useState({ loading: true, error: false, status: null, researchConsent: false });
  const shouldCheckClassMembership =
    requireClassMembership && userRole === "student" && policyCheck.status?.requiresAcceptance === false;
  const [membershipStatus, setMembershipStatus] = useState(
    shouldCheckClassMembership ? MEMBERSHIP_STATUS.IDLE : MEMBERSHIP_STATUS.READY,
  );

  useEffect(() => {
    let isMounted = true;
    if (!isAuthenticated()) {
      setPolicyCheck({ loading: false, error: false, status: null, researchConsent: false });
      return () => { isMounted = false; };
    }

    axios.get(buildApiUrl("/api/auth/me"), { headers: getAuthHeaders() })
      .then(({ data }) => {
        if (!isMounted) return;
        const nextUser = { ...(getUser() ?? {}), ...(data.user ?? {}) };
        setUser(nextUser);
        setPolicyCheck({ loading: false, error: false, status: nextUser.policyStatus, researchConsent: nextUser.researchConsent === true });
      })
      .catch((error) => {
        if (!isMounted) return;
        if (error.response?.status === 401 || error.response?.status === 403) clearToken();
        setPolicyCheck({ loading: false, error: true, status: null, researchConsent: false });
      });

    return () => { isMounted = false; };
  }, []);

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

  if (policyCheck.loading) {
    return <div role="status" aria-live="polite" style={{ padding: "2rem", textAlign: "center" }}>Checking account requirements...</div>;
  }

  if (policyCheck.error) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (policyCheck.status?.requiresAcceptance) {
    return (
      <PolicyAcceptanceModal
        initialResearchConsent={policyCheck.researchConsent}
        onAccepted={(status, researchConsent) => {
          setUser({ ...(getUser() ?? {}), policyStatus: status, researchConsent });
          setPolicyCheck({ loading: false, error: false, status, researchConsent });
        }}
      />
    );
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
