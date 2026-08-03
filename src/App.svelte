<script lang="ts">
  import { Canvas } from '@threlte/core'
  import Scene from './lib/Scene.svelte'
</script>

<main>
  <Canvas>
    <Scene />
  </Canvas>
  <div class="overlay">
    <h1>Picture Cube</h1>
    <p>Drag to orbit &middot; click the cube to shuffle photos</p>
  </div>
</main>

<style>
  main {
    position: relative;
    width: 100vw;
    height: 100vh;
    background: #0f0f14;
  }

  .overlay {
    position: absolute;
    top: 0;
    left: 0;
    padding: 1.5rem 2rem;
    color: #f4f4f8;
    pointer-events: none;
  }

  .overlay h1 {
    margin: 0 0 0.25rem;
    font-size: 1.5rem;
    font-weight: 600;
    letter-spacing: -0.02em;
  }

  .overlay p {
    margin: 0;
    font-size: 0.9rem;
    opacity: 0.6;
  }
</style>
