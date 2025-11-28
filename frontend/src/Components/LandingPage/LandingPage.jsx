import Header from "../Header/Header.jsx";
import HeroSection from "../HeroSection/HeroSection.jsx";
import FeaturesSection from "../FeatureSection/FeatuesSection.jsx";
import HowItWorks from "../HowItWorks/HowItWorks.jsx";
import Footer from "../Footer/Footer.jsx";

function LandingPage() {
  return (
    <>
      <Header pageType="landingPage" />
      <HeroSection />
      <FeaturesSection />
      <HowItWorks />
      <Footer />
    </>
  );
}

export default LandingPage;
