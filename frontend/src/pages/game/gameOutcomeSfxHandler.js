import { playGameSfx } from "./audio/gameSfx.js";

export const subscribeGameOutcomeSfx = ({
  events,
  eventName,
  levelNumber,
  sceneKey,
  getGame,
  getPaused,
  playSfx = playGameSfx,
}) => {
  const handleOutcome = ({ levelNumber: outcomeLevelNumber, status }) => {
    if (outcomeLevelNumber !== levelNumber) return;
    if (getPaused()) return;
    const activeScene = getGame()?.scene?.getScene(sceneKey);
    if (!activeScene) return;
    playSfx(activeScene, status === "success" ? "successMagic" : "errorMagic");
  };

  events.on(eventName, handleOutcome);
  return () => events.off(eventName, handleOutcome);
};
