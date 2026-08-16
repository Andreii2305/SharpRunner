const FLIPPED_HORIZONTALLY_FLAG = 0x80000000;
const FLIPPED_VERTICALLY_FLAG = 0x40000000;
const FLIPPED_DIAGONALLY_FLAG = 0x20000000;
const ROTATED_HEXAGONAL_120_FLAG = 0x10000000;
const GID_MASK = 0x0fffffff;

export const decodeGid = (value) => {
  const gid = Number(value) >>> 0;
  return {
    gid: gid & GID_MASK,
    flipHorizontal: Boolean(gid & FLIPPED_HORIZONTALLY_FLAG),
    flipVertical: Boolean(gid & FLIPPED_VERTICALLY_FLAG),
    flipDiagonal: Boolean(gid & FLIPPED_DIAGONALLY_FLAG),
    rotateHex120: Boolean(gid & ROTATED_HEXAGONAL_120_FLAG),
  };
};

export const propertiesToObject = (properties = []) =>
  Object.fromEntries(properties.map(({ name, value }) => [name, value]));

export const parseLevelMarker = (object) => {
  const properties = propertiesToObject(object.properties);
  const propertyValue = Number(properties.levelNumber);
  const fallbackMatch = String(object.name ?? "").match(/^levelNumber\s*(\d+)$/i);
  const markerLevelNumber = Number.isInteger(propertyValue)
    ? propertyValue
    : Number(fallbackMatch?.[1]);

  if (!Number.isInteger(markerLevelNumber)) return null;

  let x = Number(object.x) || 0;
  let y = Number(object.y) || 0;
  const width = Number(object.width) || 0;
  const height = Number(object.height) || 0;

  if (object.gid) {
    // A Tiled tile object's x/y point is its bottom-left corner.
    x += width / 2;
    y -= height / 2;
  } else if (!object.point) {
    x += width / 2;
    y += height / 2;
  }

  return { object, markerLevelNumber, x, y };
};

export const flattenVisibleLayers = (layers = [], inherited = {}) =>
  layers.flatMap((layer) => {
    if (layer.visible === false || inherited.visible === false) return [];
    const flattened = {
      ...layer,
      offsetx: (inherited.offsetx ?? 0) + (layer.offsetx ?? 0),
      offsety: (inherited.offsety ?? 0) + (layer.offsety ?? 0),
      opacity: (inherited.opacity ?? 1) * (layer.opacity ?? 1),
    };
    if (layer.type !== "group") return [flattened];
    return flattenVisibleLayers(layer.layers, flattened);
  });

const readNumber = (element, name, fallback = 0) => {
  const value = Number(element?.getAttribute(name));
  return Number.isFinite(value) ? value : fallback;
};

const readProperties = (parent) =>
  Array.from(parent?.querySelector(":scope > properties")?.children ?? []).map(
    (property) => ({
      name: property.getAttribute("name"),
      type: property.getAttribute("type") ?? "string",
      value: property.hasAttribute("value")
        ? property.getAttribute("value")
        : property.textContent,
    }),
  );

export const parseTsx = (text) => {
  const document = new DOMParser().parseFromString(text, "application/xml");
  const error = document.querySelector("parsererror");
  if (error) throw new Error(`Invalid TSX: ${error.textContent}`);
  const root = document.documentElement;
  const image = root.querySelector(":scope > image");
  const tileOffset = root.querySelector(":scope > tileoffset");
  const tiles = Array.from(root.querySelectorAll(":scope > tile")).map((tile) => {
    const tileImage = tile.querySelector(":scope > image");
    return {
      id: readNumber(tile, "id"),
      type: tile.getAttribute("type") ?? "",
      properties: readProperties(tile),
      image: tileImage?.getAttribute("source"),
      imagewidth: readNumber(tileImage, "width"),
      imageheight: readNumber(tileImage, "height"),
      animation: Array.from(tile.querySelectorAll(":scope > animation > frame")).map(
        (frame) => ({
          tileid: readNumber(frame, "tileid"),
          duration: readNumber(frame, "duration"),
        }),
      ),
    };
  });

  return {
    name: root.getAttribute("name") ?? "",
    tilewidth: readNumber(root, "tilewidth"),
    tileheight: readNumber(root, "tileheight"),
    tilecount: readNumber(root, "tilecount"),
    columns: readNumber(root, "columns"),
    margin: readNumber(root, "margin"),
    spacing: readNumber(root, "spacing"),
    objectalignment: root.getAttribute("objectalignment") ?? undefined,
    tileoffset: tileOffset
      ? { x: readNumber(tileOffset, "x"), y: readNumber(tileOffset, "y") }
      : undefined,
    properties: readProperties(root),
    image: image?.getAttribute("source"),
    imagewidth: readNumber(image, "width"),
    imageheight: readNumber(image, "height"),
    transparentcolor: image?.getAttribute("trans"),
    tiles,
  };
};

const loadExternalTileset = async (reference, mapUrl, signal) => {
  if (!reference.source) return { ...reference, baseUrl: mapUrl };
  const sourceUrl = new URL(reference.source, mapUrl).href;
  const response = await fetch(sourceUrl, { signal });
  if (!response.ok) {
    throw new Error(`Unable to load tileset ${sourceUrl} (${response.status})`);
  }
  const data = sourceUrl.toLowerCase().endsWith(".tsx")
    ? parseTsx(await response.text())
    : await response.json();
  return { ...data, firstgid: reference.firstgid, baseUrl: sourceUrl };
};

export const loadTiledMap = async (mapUrl, signal) => {
  const absoluteMapUrl = new URL(mapUrl, window.location.href).href;
  const response = await fetch(absoluteMapUrl, { signal });
  if (!response.ok) {
    throw new Error(`Unable to load Tiled map ${absoluteMapUrl} (${response.status})`);
  }
  const map = await response.json();
  if (map.orientation !== "orthogonal") {
    throw new Error(`Unsupported Tiled orientation: ${map.orientation}`);
  }
  const tilesets = await Promise.all(
    (map.tilesets ?? []).map((tileset) =>
      loadExternalTileset(tileset, absoluteMapUrl, signal),
    ),
  );
  return { ...map, mapUrl: absoluteMapUrl, tilesets };
};

export const findTileset = (tilesets, gid) => {
  for (let index = tilesets.length - 1; index >= 0; index -= 1) {
    if (gid >= tilesets[index].firstgid) return tilesets[index];
  }
  return null;
};
