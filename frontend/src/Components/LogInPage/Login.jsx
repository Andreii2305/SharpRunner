import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "../Toast/ToastProvider.jsx";
import LoginComp from "../LoginAndSignUp/LoginComp.jsx";
import {
  buildApiUrl,
  getHomeRouteByRole,
  getHomeRouteForCurrentUser,
  isAuthenticated,
  setToken,
  setUser,
} from "../../utils/auth";

const Login = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const googleErrorShown = useRef(false);
  const [formData, setFormData] = useState({
    identifier: "",
    password: "",
  });

  useEffect(() => {
    if (isAuthenticated()) {
      navigate(getHomeRouteForCurrentUser(), { replace: true });
      return;
    }
    if (
      searchParams.get("error") === "google_auth_failed" &&
      !googleErrorShown.current
    ) {
      googleErrorShown.current = true;
      toast.error("Google sign-in failed. Please try again.");
    }
  }, [navigate, searchParams, toast]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const res = await axios.post(
        buildApiUrl("/api/auth/login"),
        formData
      );

      setToken(res.data.token);
      setUser(res.data.user);
      navigate(getHomeRouteByRole(res.data.user?.role), { replace: true });
    } catch (err) {
      if (err.response?.data?.code === "EMAIL_NOT_VERIFIED") {
        const email = err.response.data.email || formData.identifier;
        const verificationRoute = err.response.data.role === "admin"
          ? "/admin-verify-email"
          : "/verify-email";
        const sentQuery = err.response.data.verificationSent ? "&sent=1" : "";
        navigate(
          `${verificationRoute}?email=${encodeURIComponent(email)}${sentQuery}`,
        );
        return;
      }
      toast.error(err.response?.data?.message || "Login failed.");
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = buildApiUrl("/api/auth/google");
  };

  return (
    <LoginComp
      user="IT"
      formData={formData}
      handleChange={handleChange}
      handleSubmit={handleSubmit}
      onGoogleLogin={handleGoogleLogin}
    />
  );
};

export default Login;
