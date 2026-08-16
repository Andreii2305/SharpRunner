# Tiled curriculum maps

SharpRunner renders curriculum overworlds from Tiled JSON rather than from a flattened screenshot. The reusable React renderer is in `frontend/src/Components/TiledCurriculumMap/`.

## Current Arrays map

The Arrays export is `frontend/public/game/assets/curriculum_map_level/array.tmj`. Its inline tilesets reference images beneath `frontend/public/game/assets/tiles/Map_Leveling_tiles/`. Keep the TMJ and those relative image paths together when reorganizing files. `forest_demo_terrain.tsx` is present beside the map but is not referenced by the current export.

The renderer reads the map width, height, tile size, visibility, opacity, layer offsets, and layer order from the export. It supports ordinary tilesheet tiles, image-collection tiles, external JSON/TSX tilesets, tile object layers, image layers, and Tiled GID flip flags. Each visual layer is drawn to a native-size canvas with image smoothing disabled. The canvases are stacked in export order. The map viewport scrolls in both directions and also supports pointer dragging.

## Current Functions map

The Functions export is `frontend/public/game/assets/curriculum_map_level/functions.tmj`. Its 11 local `levelNumber` markers open `/function/level/1` through `/function/level/11`. Internally these resolve to global configurations 14 through 24. The final marker uses local number 11 and displays `24-25`, because that scene covers both curriculum levels 24 and 25. Functions progress continues to use `functions-level-1` through `functions-level-11`.

## Current Functions with Arrays map

The export is `frontend/public/game/assets/curriculum_map_level/function_with_arrays.tmj`. Local markers 1 through 5 open `/function-with-array/level/1` through `/function-with-array/level/5` and resolve internally to global configurations 26 through 30. Markers 1–4 use `functions-with-arrays-level-1` through `functions-with-arrays-level-4`; marker 5 uses the separate `final-level-1` progress row and opens the Bakunawa finale at `/function-with-array/level/5`.

All playable level URLs use lesson-local numbering:

- `/tutorial/level/1` through `/tutorial/level/5`
- `/array/level/1` through `/array/level/8`
- `/function/level/1` through `/function/level/11`
- `/function-with-array/level/1` through `/function-with-array/level/5`

Legacy `/Map/level/:globalLevelNumber` URLs redirect to their canonical lesson URL.

## `level_nodes`

`level_nodes` is a design-only object layer. It is excluded from artwork rendering. Each object becomes an anchor for a React level control rendered above all artwork layers.

Give each marker an integer custom property named `levelNumber`. On the Arrays map this is the Arrays-local number `1` through `8`; page configuration maps those markers to overall SharpRunner routes `6` through `13`. Until those properties are added, names in the exact form `levelNumber1` through `levelNumber8` are accepted as a fallback.

Point-object coordinates are used directly. Rectangle and ellipse markers use the center of their bounds. Tiled tile objects use the center of their rendered bounds because their exported x/y coordinate is the bottom-left origin. Layer offsets are added after the anchor is calculated.

To move a node:

1. Move its object on `level_nodes` in Tiled. Do not move a React/CSS coordinate.
2. Keep the marker visible in the Tiled source; the game hides the whole design-only layer automatically.
3. Export over `array.tmj` as Tiled JSON, preserving relative tileset/image paths.
4. Reload `/Map`, choose Arrays, and verify the control moved with the marker.

## Adding another curriculum map

1. Put the new TMJ and any external TSX files in a stable directory under `frontend/public/game/`.
2. Keep all artwork layers in the desired Tiled draw order.
3. Add a `level_nodes` object layer and give each marker a local integer `levelNumber` property.
4. Add curriculum-specific page configuration that supplies the map URL, level metadata/progress rows, and a `mapMarkerToLevel` function.
5. Render `TiledCurriculumMap` with those values. Do not add coordinates to React configuration.
6. Build the frontend and test all node states at desktop and narrow viewport sizes.

The Arrays integration is the reference implementation. Progress remains sourced from `/api/progress/me`: completion, attempts, and final score come from `arrays-level-N`, while titles and programming topics come from `levelConfigs` for the mapped global route.
