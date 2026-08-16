import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { useToast } from "../Toast/ToastProvider.jsx";
import SignUpComp from "../LoginAndSignUp/SignUpComp.jsx";
import {
  buildApiUrl,
  getHomeRouteForCurrentUser,
  isAuthenticated,
} from "../../utils/auth";


const SignUp = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const submittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  useEffect(() => {
    if (isAuthenticated()) {
      navigate(getHomeRouteForCurrentUser(), { replace: true });
    }
  }, [navigate]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submittingRef.current) return;

    if (
      !formData.firstName.trim() ||
      !formData.lastName.trim() ||
      !formData.username.trim() ||
      !formData.email.trim() ||
      !formData.password
    ) {
      toast.error("Please complete all required fields.");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);

    try {
      const res = await axios.post(buildApiUrl("/api/auth/register"), {
        firstName: formData.firstName,
        lastName: formData.lastName,
        username: formData.username,
        email: formData.email,
        password: formData.password,
        role: "student",
      });

      toast.success(res.data.message);
      navigate(`/verify-email?email=${encodeURIComponent(res.data.email)}&sent=1`, {
        replace: true,
      });
    } catch (err) {
      if (err.response?.data?.code === "EMAIL_VERIFICATION_PENDING") {
        const email = err.response.data.email || formData.email;
        navigate(`/verify-email?email=${encodeURIComponent(email)}`);
        return;
      }
      toast.error(err.response?.data?.message || "Registration failed.");
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = buildApiUrl("/api/auth/google");
  };

  return (
    <SignUpComp
      user="Student"
      formData={formData}
      handleChange={handleChange}
      handleSubmit={handleSubmit}
      onGoogleLogin={handleGoogleLogin}
      isSubmitting={isSubmitting}
    />
  );
};

export default SignUp;
