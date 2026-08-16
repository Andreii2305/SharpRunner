import { useEffect, useMemo, useRef, useState } from "react";
import CheckOutlinedIcon from "@mui/icons-material/CheckOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import {
  decodeGid,
  findTileset,
  flattenVisibleLayers,
  loadTiledMap,
  parseLevelMarker,
} from "./tiledMapUtils";
import styles from "./TiledCurriculumMap.module.css";

const imageCache = new Map();

const loadImage = (url) => {
  if (!imageCache.has(url)) {
    imageCache.set(
      url,
      new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Unable to load tile image ${url}`));
        image.src = url;
      }),
    );
  }
  return imageCache.get(url);
};

const getTileDefinition = (tileset, localId) =>
  tileset.tiles?.find((tile) => tile.id === localId);

const getTileImageInfo = (tileset, localId) => {
  const tile = getTileDefinition(tileset, localId);
  if (tile?.image) {
    return {
      url: new URL(tile.image, tileset.baseUrl).href,
      sx: 0,
      sy: 0,
      sw: tile.imagewidth || tileset.tilewidth,
      sh: tile.imageheight || tileset.tileheight,
    };
  }
  if (!tileset.image || !tileset.columns) return null;
  const margin = tileset.margin ?? 0;
  const spacing = tileset.spacing ?? 0;
  const column = localId % tileset.columns;
  const row = Math.floor(localId / tileset.columns);
  return {
    url: new URL(tileset.image, tileset.baseUrl).href,
    sx: margin + column * (tileset.tilewidth + spacing),
    sy: margin + row * (tileset.tileheight + spacing),
    sw: tileset.tilewidth,
    sh: tileset.tileheight,
  };
};

const drawFlippedImage = (context, image, source, destination, flags) => {
  const { x, y, width, height } = destination;
  context.save();
  context.translate(x + width / 2, y + height / 2);
  if (flags.flipDiagonal) {
    if (flags.flipHorizontal && flags.flipVertical) {
      context.rotate(Math.PI / 2);
      context.scale(1, -1);
    } else if (flags.flipHorizontal) {
      context.rotate(Math.PI / 2);
    } else if (flags.flipVertical) {
      context.rotate(-Math.PI / 2);
    } else {
      context.rotate(-Math.PI / 2);
      context.scale(1, -1);
    }
  } else {
    context.scale(flags.flipHorizontal ? -1 : 1, flags.flipVertical ? -1 : 1);
  }
  context.drawImage(
    image,
    source.sx,
    source.sy,
    source.sw,
    source.sh,
    -width / 2,
    -height / 2,
    width,
    height,
  );
  context.restore();
};

const drawGid = async (context, map, rawGid, cellX, cellY, size) => {
  const flags = decodeGid(rawGid);
  if (!flags.gid) return;
  const tileset = findTileset(map.tilesets, flags.gid);
  if (!tileset) return;
  const localId = flags.gid - tileset.firstgid;
  const source = getTileImageInfo(tileset, localId);
  if (!source) return;
  const image = await loadImage(source.url);
  const width = size?.width || source.sw;
  const height = size?.height || source.sh;
  const offsetX = tileset.tileoffset?.x ?? 0;
  const offsetY = tileset.tileoffset?.y ?? 0;
  const x = cellX + offsetX;
  const y = cellY + (size ? -height : map.tileheight - height) + offsetY;
  drawFlippedImage(context, image, source, { x, y, width, height }, flags);
};

const drawLayer = async (canvas, map, layer) => {
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;
  context.globalAlpha = layer.opacity ?? 1;
  const offsetX = layer.offsetx ?? 0;
  const offsetY = layer.offsety ?? 0;

  if (layer.type === "tilelayer") {
    const chunks = layer.chunks ?? [
      { data: layer.data, x: layer.startx ?? 0, y: layer.starty ?? 0, width: layer.width },
    ];
    for (const chunk of chunks) {
      for (let index = 0; index < (chunk.data ?? []).length; index += 1) {
        const gid = chunk.data[index];
        if (!gid) continue;
        const column = index % chunk.width;
        const row = Math.floor(index / chunk.width);
        await drawGid(
          context,
          map,
          gid,
          (chunk.x + column) * map.tilewidth + offsetX,
          (chunk.y + row) * map.tileheight + offsetY,
        );
      }
    }
  } else if (layer.type === "objectgroup") {
    for (const object of layer.objects ?? []) {
      if (object.visible === false || !object.gid) continue;
      context.save();
      context.globalAlpha = (layer.opacity ?? 1) * (object.opacity ?? 1);
      context.translate(object.x + offsetX, object.y + offsetY);
      context.rotate(((object.rotation ?? 0) * Math.PI) / 180);
      await drawGid(context, map, object.gid, 0, 0, {
        width: object.width,
        height: object.height,
      });
      context.restore();
    }
  } else if (layer.type === "imagelayer" && layer.image) {
    const image = await loadImage(new URL(layer.image, map.mapUrl).href);
    context.drawImage(image, (layer.x ?? 0) + offsetX, (layer.y ?? 0) + offsetY);
  }
};

function TiledVisualLayer({ map, layer, onError }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    drawLayer(canvasRef.current, map, layer).catch((error) => {
      if (!cancelled) onError(error);
    });
    return () => {
      cancelled = true;
    };
  }, [layer, map, onError]);

  return (
    <canvas
      ref={canvasRef}
      className={styles.tileLayer}
      width={map.width * map.tilewidth}
      height={map.height * map.tileheight}
      aria-hidden="true"
    />
  );
}

function LevelNode({ node, onNodeClick }) {
  const locked = node.status === "locked";
  const completed = node.status === "completed";
  const current = node.status === "current";
  const statusLabel = completed ? "Completed" : current ? "Current" : locked ? "Locked" : "Available";
  const grade =
    node.grade ??
    (node.finalScore >= 90 ? "S" : node.finalScore >= 80 ? "A" : node.finalScore != null ? "B" : null);
  const levelLabel = node.displayLevelNumber ?? node.levelNumber;

  return (
    <button
      type="button"
      className={`${styles.levelNode} ${styles[node.status]}`}
      style={{ left: node.x, top: node.y }}
      disabled={locked}
      onClick={() => onNodeClick?.(node)}
      aria-label={`Level ${levelLabel}: ${node.title}. ${statusLabel}.`}
    >
      {current && <span className={styles.currentFlag}>Kai</span>}
      <span className={styles.nodeShield}>
        <span className={styles.shieldOuter} />
        <span className={styles.shieldInner} />
        {current && <span className={styles.pulseRing} aria-hidden="true" />}
        <span className={styles.nodeContent}>
          {completed ? (
            <CheckOutlinedIcon sx={{ fontSize: 17 }} />
          ) : locked ? (
            <LockOutlinedIcon sx={{ fontSize: 14 }} />
          ) : (
            levelLabel
          )}
        </span>
      </span>
      <span className={styles.nodeTitle}>{node.title}</span>
      {completed && node.finalScore != null && (
        <span
          className={`${styles.scoreBadge} ${styles[`grade${grade}`] ?? ""}`}
          aria-label={`Grade ${grade}, score ${node.finalScore}`}
        >
          <span className={styles.gradeLabel}>Grade</span>
          <strong>{grade}</strong>
          <span className={styles.scoreValue}>{Math.round(node.finalScore)}</span>
        </span>
      )}
      <span className={styles.tooltip} role="tooltip">
        <strong>Level {levelLabel}: {node.title}</strong>
        <span>{node.topic}</span>
        <span>{statusLabel}{node.finalScore != null ? ` · Score ${node.finalScore}` : ""}</span>
        {node.attemptCount > 0 && <span>{node.attemptCount} attempt{node.attemptCount === 1 ? "" : "s"}</span>}
      </span>
    </button>
  );
}

function TiledCurriculumMap({ mapUrl, nodes, mapMarkerToLevel, onNodeClick }) {
  const [map, setMap] = useState(null);
  const [error, setError] = useState(null);
  const viewportRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    setMap(null);
    setError(null);
    loadTiledMap(mapUrl, controller.signal)
      .then(setMap)
      .catch((loadError) => {
        if (loadError.name === "AbortError") return;
        console.error("SharpRunner could not load the Tiled curriculum map:", loadError);
        setError(loadError);
      });
    return () => controller.abort();
  }, [mapUrl]);

  const visibleLayers = useMemo(
    () => (map ? flattenVisibleLayers(map.layers) : []),
    [map],
  );

  const positionedNodes = useMemo(() => {
    if (!map) return [];
    const markerLayer = visibleLayers.find(
      (layer) => layer.type === "objectgroup" && layer.name === "level_nodes",
    );
    return (markerLayer?.objects ?? [])
      .map(parseLevelMarker)
      .filter(Boolean)
      .map((marker) => {
        const levelNumber = mapMarkerToLevel(marker.markerLevelNumber, marker.object);
        const node = nodes.find((candidate) => candidate.levelNumber === levelNumber);
        return node
          ? {
              ...node,
              x: marker.x + (markerLayer.offsetx ?? 0),
              y: marker.y + (markerLayer.offsety ?? 0),
            }
          : null;
      })
      .filter(Boolean);
  }, [map, mapMarkerToLevel, nodes, visibleLayers]);

  useEffect(() => {
    const current = positionedNodes.find((node) => node.status === "current");
    const viewport = viewportRef.current;
    if (!current || !viewport) return;
    viewport.scrollTo({
      left: Math.max(0, current.x - viewport.clientWidth / 2),
      top: Math.max(0, current.y - viewport.clientHeight / 2),
    });
  }, [positionedNodes]);

  if (error) {
    return (
      <div className={styles.fallback} role="alert">
        <strong>The Arrays map could not be loaded.</strong>
        <span>{error.message}</span>
      </div>
    );
  }
  if (!map) return <div className={styles.loading}>Loading the Arrays map…</div>;

  const artworkLayers = visibleLayers.filter(
    (layer) => !(layer.type === "objectgroup" && layer.name === "level_nodes"),
  );

  const startDrag = (event) => {
    if (event.button !== 0 || event.target.closest("button")) return;
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      left: event.currentTarget.scrollLeft,
      top: event.currentTarget.scrollTop,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event) => {
    if (!dragRef.current) return;
    event.currentTarget.scrollLeft = dragRef.current.left - (event.clientX - dragRef.current.x);
    event.currentTarget.scrollTop = dragRef.current.top - (event.clientY - dragRef.current.y);
  };
  const stopDrag = () => {
    dragRef.current = null;
  };

  return (
    <div
      ref={viewportRef}
      className={styles.viewport}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      aria-label="Scrollable Arrays curriculum map"
    >
      <div
        className={styles.world}
        style={{ width: map.width * map.tilewidth, height: map.height * map.tileheight }}
      >
        {artworkLayers.map((layer) => (
          <TiledVisualLayer
            key={layer.id}
            map={map}
            layer={layer}
            onError={setError}
          />
        ))}
        <div className={styles.nodeLayer}>
          {positionedNodes.map((node) => (
            <LevelNode key={node.levelNumber} node={node} onNodeClick={onNodeClick} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default TiledCurriculumMap;
