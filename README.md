# Picture Cube

A starter project combining **Svelte 5**, **Vite**, **[Threlte](https://threlte.xyz)** (a Three.js wrapper for Svelte), and **GSAP** for animation.

It renders a 3D cube with a random photo on each face. Drag to orbit the camera; click the cube to shuffle in a new set of photos with a GSAP-driven flip animation.

## Stack

- [Vite](https://vitejs.dev/) — build tool / dev server
- [Svelte 5](https://svelte.dev/) — UI framework (runes)
- [Threlte](https://threlte.xyz/) (`@threlte/core`, `@threlte/extras`) — declarative Three.js for Svelte
- [Three.js](https://threejs.org/) — 3D engine
- [GSAP](https://gsap.com/) — animation

## Getting started

```bash
npm install
npm run dev
```

Other scripts:

```bash
npm run build   # production build
npm run preview # preview the production build
npm run check   # type-check with svelte-check
```

## Project structure

- `src/App.svelte` — page shell, mounts the Threlte `<Canvas>`
- `src/lib/Scene.svelte` — camera, lights, controls
- `src/lib/PictureCube.svelte` — the cube: texture loading, click-to-shuffle, GSAP animations
