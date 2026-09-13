const TERMS_VERSION = "1.0";
const PRIVACY_POLICY_VERSION = "1.0";

const getPolicyStatus = (user) => {
  const termsAccepted = user?.termsVersionAccepted === TERMS_VERSION;
  const privacyAcknowledged =
    user?.privacyVersionAcknowledged === PRIVACY_POLICY_VERSION;

  return {
    currentTermsVersion: TERMS_VERSION,
    currentPrivacyPolicyVersion: PRIVACY_POLICY_VERSION,
    termsAccepted,
    privacyAcknowledged,
    requiresAcceptance: !termsAccepted || !privacyAcknowledged,
  };
};

module.exports = {
  TERMS_VERSION,
  PRIVACY_POLICY_VERSION,
  getPolicyStatus,
};
