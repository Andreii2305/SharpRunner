import ProgressBar from "@ramonak/react-progress-bar";

function ProgressBarComponent({ progress }) {
  return (
    <div style={{ width: "100%", maxWidth: 400 }}>
      <ProgressBar
        completed={progress}
        bgColor="#4A718C" // same blue tone as your circular one
        baseBgColor="#e5e7eb" // light gray base
        height="14px"
        borderRadius="8px"
        isLabelVisible={true}
        animateOnRender={true} // <-- enables smooth animation on mount
        transitionDuration="1.2s" // <-- control speed
        transitionTimingFunction="ease-in-out"
        customLabelStyles={{
          fontSize: "12px",
          color: "#e5e7eb",
          fontWeight: "bold",
        }}
      />
    </div>
  );
}

export default ProgressBarComponent;
