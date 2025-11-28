import { CircularProgressbar, buildStyles } from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";
import React, { useState, useEffect, use } from "react";

function CircularProgressBar({ percentage }) {
  const [progress, setProgress] = useState(0);
  const target = percentage;

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
    <div>
      <CircularProgressbar
        value={progress}
        text={`${progress}%`}
        strokeWidth={10}
        styles={buildStyles({
          textColor: "#26547C",
          pathColor: "#8DA4B8",
          trailColor: "#D9D9D9",
          pathTransitionDuration: 0.15,
        })}
      />
    </div>
  );
}

export default CircularProgressBar;
