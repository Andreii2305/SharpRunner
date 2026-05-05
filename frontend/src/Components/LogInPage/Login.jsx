import React, { useEffect, useState } from "react";
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
  const [formData, setFormData] = useState({
    identifier: "",
    password: "",
  });

  useEffect(() => {
    if (isAuthenticated()) {
      navigate(getHomeRouteForCurrentUser(), { replace: true });
      return;
    }
    if (searchParams.get("error") === "google_auth_failed") {
      toast.error("Google sign-in failed. Please try again.");
    }
  }, [navigate]);

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
