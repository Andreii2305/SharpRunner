import { CircularProgressbar, buildStyles } from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";
import React, { useState, useEffect } from "react";

function CircularProgressBar({
  percentage,
  strokeWidth = 10,
  showText = true,
  pathColor = "#8DA4B8",
  trailColor = "#D9D9D9",
  textColor = "#26547C",
  className = "",
}) {
  const [progress, setProgress] = useState(0);
  const target = Math.max(0, Math.min(100, Number(percentage) || 0));

  useEffect(() => {
    let current = 0;
    const timer = setInterval(() => {
      if (current < target) {
        current += 1;
        setProgress(current);
      } else {
        clearInterval(timer);
      }
    }, 20);

    return () => clearInterval(timer);
  }, [target]);
  return (
    <div className={className}>
      <CircularProgressbar
        value={progress}
        text={showText ? `${progress}%` : ""}
        strokeWidth={strokeWidth}
        styles={buildStyles({
          textColor,
          pathColor,
          trailColor,
          pathTransitionDuration: 0.15,
        })}
      />
    </div>
  );
}

export default CircularProgressBar;
