<script lang="ts">
  // `T` is Threlte's magic component: `<T.Mesh>`, `<T.PerspectiveCamera>`, etc.
  // each map directly to a Three.js class of the same name (`THREE.Mesh`,
  // `THREE.PerspectiveCamera`...). Threlte creates the Three.js object for you
  // and keeps its properties in sync with whatever props you pass.
  import { T } from '@threlte/core';
  // Helper components from Threlte's companion "extras" package (the rough
  // equivalent of `@react-three/drei` for React Three Fiber).
  import { OrbitControls, VirtualEnvironment, interactivity } from '@threlte/extras';
  import * as THREE from 'three';
  import PictureCube from './PictureCube.svelte';

  type Props = {
    /** Forwarded to the cube so it can scale up and light its rim during a drag. */
    dragActive?: boolean;
    /** Forwarded to the cube so clicking it opens the same file picker as the "browse" link. */
    onCubeClick?: () => void;
  };

  // Svelte 5 "runes" syntax: `$props()` reads the props passed in from the
  // parent (`App.svelte`), and `= false` is the default if none is given.
  let { dragActive = false, onCubeClick }: Props = $props();

  // Three.js doesn't fire pointer events (click/hover) by default — it just
  // draws pixels. Calling this once turns on Threlte's raycasting layer, which
  // is what lets `<PictureCube>` respond to `onpointerenter`/`onpointerleave`.
  interactivity();
</script>

<!--
  Everything below is the actual 3D scene graph — every element here is a
  Three.js object, nested the same way you'd nest them in plain Three.js code,
  just written as Svelte markup instead of `new THREE.Whatever()` calls.
-->

<!-- The camera we look through. `makeDefault` tells Threlte's <Canvas> (in
     App.svelte) to render from this camera's point of view. -->
<T.PerspectiveCamera makeDefault position={[3.5, 2.5, 4.5]} fov={45}>
  <!-- Lets the user drag with the mouse to orbit the camera around `target`.
       Nested inside the camera because OrbitControls needs a camera to
       control — Threlte wires that up automatically from the parent. -->
  <OrbitControls enableDamping target={[0, 0, 0]} minDistance={3} maxDistance={12} />
</T.PerspectiveCamera>

<!-- Lighting: without any light, materials like MeshStandardMaterial (used by
     the cube) render pure black, since they need light to reflect. -->

<!-- Flat light with no direction or position — brightens everything evenly,
     like a soft fill light. Prevents shadowed areas from going fully black. -->
<T.AmbientLight intensity={0.7} />

<!-- A two-tone ambient light: one color from "the sky" (above), another from
     "the ground" (below), blended by each surface's normal direction. Cheap
     way to fake bounced/ambient environment light without a real environment
     map. Args are [skyColor, groundColor, intensity]. -->
<T.HemisphereLight args={['#c7d2fe', '#08080d', 0.6]} />

<!-- Directional lights simulate a far-away light source (like the sun): all
     its rays travel in one parallel direction, unlike a point light which
     radiates outward. `position` only sets which direction the light comes
     from, not how far away it "is". This one is the key/main light. -->
<T.DirectionalLight position={[5, 6, 4]} intensity={1.3} />
<!-- A second, dimmer directional light from roughly the opposite side, so the
     side facing away from the key light isn't pitch black. -->
<T.DirectionalLight position={[-4, -2, -3]} intensity={0.3} />
<!-- Two more fill lights covering the other two diagonal corners. The small
     cubes (see PictureCube.svelte's cubeGroup) are fully metallic and can end
     up scattered into any of 8 octant positions when exploded on hover —
     metals barely respond to the ambient/hemisphere lights above, so without
     light coming from all four diagonals some of those positions would
     render black. Dimmer than the key light so they read as fill, not a
     second sun. -->
<T.DirectionalLight position={[-5, 6, -4]} intensity={0.5} />
<T.DirectionalLight position={[4, -3, 5]} intensity={0.5} />

<T.DirectionalLight position={[0, 10, 0]} intensity={1.3} />  
<T.DirectionalLight position={[0, -10, 0]} intensity={1.3} />  
<T.DirectionalLight position={[10, 0, 0]} intensity={1.3} />  
<T.DirectionalLight position={[-10, 0, 0]} intensity={1.3} />  
<T.DirectionalLight position={[0, 0, 10]} intensity={1.3} />  
<T.DirectionalLight position={[0, 0, -10]} intensity={1.3} />  


<!--
  The cube's material is polished chrome (metalness 1, roughness 0.1 — see
  PictureCube.svelte), which works like a mirror: it doesn't show its own
  color, it shows *reflections of whatever is around it*. With only the lights
  above, there's nothing to reflect, so it would look almost black.

  <VirtualEnvironment> solves that without needing an external image file: it
  points a camera outward from the cube's position in all six directions,
  renders whatever shapes are placed inside it, and uses that as a "fake
  environment" for reflections. Below, six large flat planes form a simple box
  around the scene — differently colored so the chrome has something visibly
  varied to reflect (bright top, dark bottom, indigo/neutral sides) instead of
  a single flat color.
-->
<VirtualEnvironment resolution={256}>
  <!-- top: bright -->
  <T.Mesh position={[0, 6, 0]}>
    <T.PlaneGeometry args={[12, 12]} />
    <!-- MeshBasicMaterial ignores lighting entirely — it always renders as
         its flat `color`, which is exactly what we want here: these planes
         exist only to be reflected, not to be lit themselves.
         `side={THREE.DoubleSide}` makes the plane visible from both faces, so
         we don't have to get its rotation exactly right for it to show up. -->
    <T.MeshBasicMaterial color="#ffffff" side={THREE.DoubleSide} />
  </T.Mesh>
  <!-- bottom: deep amber — was near-black; the diamond's refraction shows
       whatever's on the *far* side of it from the camera (unlike the chrome
       cube, which reflects the *near* side), so the far three faces need
       real hue, not just near-black neutrals, or refraction reads as solid
       black. Still dark enough to keep contrast against the bright top/side. -->
  <T.Mesh position={[0, -6, 0]}>
    <T.PlaneGeometry args={[12, 12]} />
    <T.MeshBasicMaterial color="#7c2d12" side={THREE.DoubleSide} />
  </T.Mesh>
  <!-- +X side: indigo accent, matching the rest of the UI -->
  <T.Mesh position={[6, 0, 0]}>
    <T.PlaneGeometry args={[12, 12]} />
    <T.MeshBasicMaterial color="#6366f1" side={THREE.DoubleSide} />
  </T.Mesh>
  <!-- -X side: deep magenta (see bottom face comment) -->
  <T.Mesh position={[-6, 0, 0]}>
    <T.PlaneGeometry args={[12, 12]} />
    <T.MeshBasicMaterial color="#831843" side={THREE.DoubleSide} />
  </T.Mesh>
  <!-- +Z side: pale indigo -->
  <T.Mesh position={[0, 0, 6]}>
    <T.PlaneGeometry args={[12, 12]} />
    <T.MeshBasicMaterial color="#c7d2fe" side={THREE.DoubleSide} />
  </T.Mesh>
  <!-- -Z side: deep indigo (see bottom face comment) -->
  <T.Mesh position={[0, 0, -6]}>
    <T.PlaneGeometry args={[12, 12]} />
    <T.MeshBasicMaterial color="#312e81" side={THREE.DoubleSide} />
  </T.Mesh>
</VirtualEnvironment>

<!-- The cube itself. `{dragActive}` is Svelte shorthand for
     `dragActive={dragActive}` — passing our own prop straight through. -->
<PictureCube {dragActive} onClick={onCubeClick} />
