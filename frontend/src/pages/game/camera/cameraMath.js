export const CAMERA_DRAG_THRESHOLD = 12;
export const CAMERA_MIN_ZOOM = 0.875;
export const CAMERA_MAX_ZOOM = 1;
export const CAMERA_ANCHOR_SCREEN_RATIO = 0.68;

export const getResponsiveCameraZoom = ({ viewportWidth, viewportHeight }) => {
  const isCompactLandscape = viewportWidth > viewportHeight
    && viewportWidth <= 1024
    && viewportHeight <= 500;

  if (!isCompactLandscape) return CAMERA_MAX_ZOOM;

  // Eighth-step zoom keeps 32px tiles on whole display pixels (28px at 0.875).
  return viewportHeight < 300 ? CAMERA_MIN_ZOOM : CAMERA_MAX_ZOOM;
};

export const getHorizontalScrollRange = ({ boundsX, boundsWidth, viewportWidth, zoom = 1 }) => {
  const visibleWorldWidth = viewportWidth / Math.max(zoom, Number.EPSILON);
  return {
    min: boundsX,
    max: Math.max(boundsX, boundsX + boundsWidth - visibleWorldWidth),
  };
};

export const getVerticalScrollRange = ({
  boundsY,
  boundsHeight,
  viewportHeight,
  zoom = 1,
}) => {
  const visibleWorldHeight = viewportHeight / Math.max(zoom, Number.EPSILON);
  // Phaser keeps zoom centered in the viewport, so its bounded scroll origin
  // includes half of the extra visible world height.
  const min = boundsY + ((visibleWorldHeight - viewportHeight) / 2);
  return {
    min,
    max: Math.max(min, min + boundsHeight - visibleWorldHeight),
  };
};

export const getAnchoredVerticalScroll = ({
  anchorY,
  boundsY,
  boundsHeight,
  viewportHeight,
  zoom = 1,
  screenRatio = CAMERA_ANCHOR_SCREEN_RATIO,
}) => {
  const range = getVerticalScrollRange({
    boundsY,
    boundsHeight,
    viewportHeight,
    zoom,
  });
  const visibleWorldHeight = viewportHeight / Math.max(zoom, Number.EPSILON);
  const requested = anchorY - visibleWorldHeight * screenRatio;
  return Math.min(range.max, Math.max(range.min, requested));
};
