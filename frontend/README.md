# SharpRunner Frontend

This directory contains SharpRunner's React client: the student and teacher dashboards, curriculum map, and the Phaser/Monaco game experience. It communicates with the Express API in `../backend`; the frontend is not the source of truth for scores, XP, access control, or hint purchases.

## Main Technologies

- React 19 and React Router
- Vite
- Phaser 3
- Monaco Editor
- Axios
- Vitest and Testing Library
- ESLint

## Development Commands

Run these from the repository root:

```bash
npm --prefix frontend install
npm --prefix frontend run dev:local
npm --prefix frontend run lint
npm --prefix frontend test
npm --prefix frontend run build
```

The backend must be running for authenticated and progress-saving flows.

## Environment Configuration

Copy the frontend example environment file when one is provided for your deployment, then set `VITE_API_BASE_URL` to the backend API origin. Never commit real credentials or service-role keys; Vite variables are bundled into browser code and must be treated as public configuration.

## Directory Overview

- `src/Components/` — reusable dashboard, navigation, modal, and account UI.
- `src/pages/` — route-level student, teacher, admin, and game screens.
- `src/pages/game/` — shared React game shell, Phaser scenes, curriculum configs, and validators.
- `src/services/` — API clients and browser-side service helpers.
- `public/game/` — game assets loaded by Phaser.

## Game-Safety Boundary

Individual scenes, validators, maps, routes, and assets encode the active curriculum. Treat them as protected behavior: verify shared UI or service changes against the existing levels instead of changing levels to fit stale documentation.

## Responsive Behavior

- **Desktop (1024px and wider):** the Phaser game and Monaco editor remain side by side.
- **Tablet:** the layout adapts to available width; landscape is preferred for gameplay.
- **Mobile (below 768px):** navigation and the curriculum map support portrait use, while gameplay uses persistent Game, Code, and Lesson panels. A portrait prompt recommends rotation without blocking access.

Phaser and Monaco stay mounted while mobile panels change, preserving scene and draft state. The code panel uses automatic editor layout, a compact 13px mobile font, and a safe-area-aware action region. For the best coding experience, use a tablet, laptop, or mobile device in landscape orientation.
