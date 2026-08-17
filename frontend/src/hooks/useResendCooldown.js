import { useCallback, useEffect, useState } from "react";

export default function useResendCooldown(initiallyActive = false, duration = 60) {
  const [secondsRemaining, setSecondsRemaining] = useState(
    initiallyActive ? duration : 0,
  );

  useEffect(() => {
    if (secondsRemaining <= 0) return undefined;

    const timer = window.setTimeout(() => {
      setSecondsRemaining((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [secondsRemaining]);

  const startCooldown = useCallback((seconds = duration) => {
    const parsedSeconds = Number.parseInt(seconds, 10);
    setSecondsRemaining(
      Number.isInteger(parsedSeconds) && parsedSeconds > 0
        ? parsedSeconds
        : duration,
    );
  }, [duration]);

  return { secondsRemaining, startCooldown };
}
