<script lang="ts">
  import { Canvas } from '@threlte/core'
  import { Motion } from 'svelte-motion'
  import Scene from './lib/Scene.svelte'
</script>

<main class="relative w-screen h-screen bg-[#0f0f14]">
  <Canvas>
    <Scene />
  </Canvas>

  <Motion
    let:motion
    initial={{ opacity: 0, y: -12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.6, ease: 'easeOut' }}
  >
    <div
      use:motion
      class="pointer-events-none absolute top-0 left-0 px-8 py-6 text-neutral-100"
    >
      <h1 class="m-0 text-2xl font-semibold tracking-tight">Picture Cube</h1>
      <p class="mt-1 text-sm text-neutral-400">Drag to orbit &middot; click the cube to shuffle photos</p>
    </div>
  </Motion>
</main>
