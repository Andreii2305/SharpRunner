export const CAMERA_DRAG_THRESHOLD = 12;
export const CAMERA_ZOOM = 1;

export const getHorizontalScrollRange = ({ boundsX, boundsWidth, viewportWidth, zoom = 1 }) => {
  const visibleWorldWidth = viewportWidth / Math.max(zoom, Number.EPSILON);
  return {
    min: boundsX,
    max: Math.max(boundsX, boundsX + boundsWidth - visibleWorldWidth),
  };
};
