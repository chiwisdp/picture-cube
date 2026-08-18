<script lang="ts">
  import { T, useLoader } from '@threlte/core';
  // GSAP animates plain numbers over time. Here it's used to tween Three.js
  // object properties directly (rotation, scale, an opacity value) instead of
  // Svelte's own transition system, since those need easing/looping/replaying
  // control that CSS-style transitions don't give you.
  import gsap from 'gsap';
  import { untrack } from 'svelte';
  import * as THREE from 'three';
  import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
  import { MeshRefractionMaterial } from '@threlte/extras';
  import { imageStore } from './image/store.svelte';

  type Props = {
    /** True while a file drag is over the window. Scales the cube and lights the rim. */
    dragActive?: boolean;
    /** Called when the cube is clicked — opens the same file picker as the "browse" link. */
    onClick?: () => void;
  };

  // Svelte 5 runes: `$props()` reads props passed by the parent (Scene.svelte)
  let { dragActive = false, onClick }: Props = $props();

  const TWO_PI = Math.PI * 2; // one full rotation, in radians (Three.js uses radians, not degrees)

  // Each small cube's resting position is already an offset from the center
  // (e.g. [.5, .5, -.5]), so that same vector doubles as the direction it
  // should fly outward along when exploded — no separate direction table
  // needed. Order matches the 8 <T.Mesh> elements in cubeGroup below.
  const CUBE_OFFSETS: [number, number, number][] = [
    [0.5, 0.5, -0.5],
    [-0.5, 0.5, -0.5],
    [0.5, -0.5, -0.5],
    [-0.5, -0.5, -0.5],
    [0.5, 0.5, 0.5],
    [-0.5, 0.5, 0.5],
    [0.5, -0.5, 0.5],
    [-0.5, -0.5, 0.5],
  ];
  // How far each cube travels outward on hover, as a multiple of its resting offset.
  const EXPLODE_SCALE = 5.5;

  // `$state` makes a variable reactive: reading it inside a template or an
  // `$effect` automatically subscribes to future changes, and writing to it
  // re-runs anything that depends on it.

  // Will hold the actual Three.js `diamondGroup` object once Threlte creates it (see
  // `bind:ref={diamondGroup}` in the template below) — gsap animates its
  // `.rotation`/`.scale`, which are plain Three.js properties, not Svelte state.
  let diamondGroup = $state<THREE.Group>();
  let cubeGroup = $state<THREE.Group>();
  // Refs to the 8 small cubes inside cubeGroup, in the same order they're
  // declared in the template below — used to explode them apart on hover.
  let cube1 = $state<THREE.Mesh>();
  let cube2 = $state<THREE.Mesh>();
  let cube3 = $state<THREE.Mesh>();
  let cube4 = $state<THREE.Mesh>();
  let cube5 = $state<THREE.Mesh>();
  let cube6 = $state<THREE.Mesh>();
  let cube7 = $state<THREE.Mesh>();
  let cube8 = $state<THREE.Mesh>();
  // The gsap tweens driving the endless idle rotation, so later effects can
  // pause/resume them (e.g. while hovered or dragging).
  let idleSpin = $state<gsap.core.Tween>();
  let idleCubeSpin = $state<gsap.core.Tween>();
  let hovered = $state(false);
  // 0–1 opacity of the glowing outer shell (see the second <T.Mesh> below).
  // Tweened up while a file is being dragged over the window, back down when not.
  let rimGlow = $state(0);

  // Mirrors AnalysisPanel.svelte's own open/loading state (same `imageStore`
  // it reads) rather than threading dragActive-style props through
  // Scene.svelte. `aiLoading` matches that panel's `isPending`: a selection
  // exists but hasn't come back with an analysis (and hasn't errored).
  let panelOpen = $derived(imageStore.selected !== null);
  let aiLoading = $derived(
    imageStore.selected !== null &&
      imageStore.selected.analysis === null &&
      imageStore.selected.status !== 'error',
  );

  // The diamond's refraction envMap: a real HDR panorama (downloaded from
  // Poly Haven into public/hdr/ rather than hotlinked, so it doesn't depend
  // on an external host at runtime) instead of Scene.svelte's fake
  // <VirtualEnvironment> box — used only for the diamond; the chrome
  // fallback below and the cube shell still reflect the VirtualEnvironment.
  const envMapPromise = useLoader(HDRLoader).load('/hdr/wooden_studio_12_1k.hdr');

  const handlePointerEnter = (): void => {
    hovered = true;
  };

  const handlePointerLeave = (): void => {
    hovered = false;
  };

  // Three.js doesn't touch the CSS cursor on its own — set it manually so the
  // cube reads as clickable, same as hovering a real button.
  $effect(() => {
    document.body.style.cursor = hovered ? 'pointer' : '';
    return () => {
      document.body.style.cursor = '';
    };
  });

  // `$effect` re-runs whenever any `$state` it reads changes. This one only
  // reads `diamondGroup`, so it re-runs once — right after the cube's <T.diamondGroup> mounts
  // and `bind:ref` sets `diamondGroup` for the first time.
  $effect(() => {
    // Nothing to animate until the diamond's group ref exists (set by
    // `bind:ref`). `cubeGroup` is handled separately below since cubeGroup
    // is currently commented out of the template (see below) — the diamond
    // shouldn't lose its own entrance/spin just because the cube shell isn't
    // mounted.
    if (!diamondGroup) return;

    // One-time "spin in" animation played on mount: `gsap.from(...)` animates
    // *from* the given values *to* the element's current values, so the cube
    // appears to unwind into its resting rotation.
    const entrance = gsap.from(diamondGroup.rotation, {
      y: TWO_PI,
      x: Math.PI * 0.4,
      duration: 1.6,
      ease: 'power3.out',
    });
    // The continuous background spin: rotates y by one more full turn than
    // wherever it currently is (`'+=' + TWO_PI`), forever (`repeat: -1`), at a
    // constant speed (`ease: 'none'`).
    const spin = gsap.to(diamondGroup.rotation, {
      y: '+=' + TWO_PI,
      duration: 26,
      repeat: -1,
      ease: 'none',
    });
    idleSpin = spin;

    return () => {
      entrance.kill();
      spin.kill();
    };
  });

  $effect(() => {
    if (!cubeGroup) return;

    const cubeEntrance = gsap.from(cubeGroup.rotation, {
      y: TWO_PI,
      x: Math.PI * 0.4,
      duration: 1.6,
      ease: 'power3.out',
    });
    const cubeSpin = gsap.to(cubeGroup.rotation, {
      y: '+=' + TWO_PI,
      duration: 26,
      repeat: -1,
      ease: 'none',
    });
    idleCubeSpin = cubeSpin;

    return () => {
      cubeEntrance.kill();
      cubeSpin.kill();
    };
  });

  // Pauses/resumes the idle spins depending on interaction state, without
  // restarting them — `.play()`/`.pause()` just toggle whether the existing
  // tweens are advancing. The diamond keeps spinning on hover (only a file
  // drag pauses it) — only the cube shell's spin pauses on hover, since its
  // own explode/tumble animation takes over then. It's also paused while
  // `aiLoading` — the rapid-spin effect below takes over during that window,
  // and pausing (not killing) this one means it resumes from where it left
  // off once loading ends, instead of restarting.
  $effect(() => {
    if (!idleSpin) return;
    if (dragActive || aiLoading) {
      idleSpin.pause();
    } else {
      idleSpin.play();
    }
  });

  // Overrides the diamond's slow idle spin with a rapid Y-axis-only spin
  // while the AI analysis is loading (see `aiLoading` above), so the diamond
  // visibly "works" instead of just idling. The normal idle spin is paused
  // (not killed) for the same duration by the effect above, so once loading
  // ends it eases back into the regular slow spin rather than restarting.
  $effect(() => {
    if (!diamondGroup || !aiLoading) return;
    const group = diamondGroup; // narrowed to non-undefined for the closures below
    const rapidSpin = gsap.to(group.rotation, {
      y: '+=' + TWO_PI,
      duration: 1.5,
      repeat: -1,
      ease: 'none',
    });
    // Ping-pongs the diamond's scale between 1 and 2 for as long as the AI
    // analysis is loading, so it visibly "pulses" instead of just idling.
    const scalePulse = gsap.to(group.scale, {
      x: 1.5,
      y: 1.5,
      z: 1.5,
      duration: 1,
      repeat: -1,
      yoyo: true,
      ease: 'elastic.out',
    });

    return () => {
      rapidSpin.kill();
      scalePulse.kill();
      // Scales back down to 1 once loading finishes, instead of leaving the
      // diamond wherever the pulse happened to be paused.
      gsap.to(group.scale, { x: 1, y: 1, z: 1, duration: 0.4, ease: 'elastic.out' });
    };
  });

  

  $effect(() => {
    if (!idleCubeSpin) return;
    const shouldSpin = !dragActive && !hovered && !panelOpen;
    if (shouldSpin) {
      idleCubeSpin.play();
      return;
    }
    idleCubeSpin.pause();
  });

  // Scales the whole diamondGroup up slightly on hover, more while a file is being
  // dragged over the window. Re-runs whenever `dragActive`, `hovered`, or
  // `diamondGroup` changes, killing the previous tween first so rapid hover in/out
  // doesn't stack up competing animations.
  $effect(() => {
    if (!diamondGroup||aiLoading) return;
    const scale = dragActive ? 1.5 : hovered ? 1.5: 1;
    const tween = gsap.to(diamondGroup.scale, {
      x: scale,
      y: scale,
      z: scale,
      duration: 5.55,
      yoyo: true,
      ease: 'elastic.out',
    });
    return () => tween.kill();
  });

  // Explodes the 8 small cubes apart on hover — each flies outward along its
  // own resting offset (so they scatter in 8 different directions, not just
  // one) and tumbles on its own axis at a per-cube speed so they don't spin
  // in lockstep. On hover-out both tweens reverse back to rest. Also stays
  // exploded for as long as the analysis panel is open (`panelOpen`), not
  // just while the mouse is actually over the cube.
  $effect(() => {
    const cubes = [cube1, cube2, cube3, cube4, cube5, cube6, cube7, cube8];
    if (cubes.some((cube) => !cube)) return;

    const tweens = cubes.flatMap((cube, i) => {
      const mesh = cube as THREE.Mesh;
      const [x, y, z] = CUBE_OFFSETS[i];

      if (hovered || panelOpen) {
        const move = gsap.to(mesh.position, {
          x: x * EXPLODE_SCALE,
          y: y * EXPLODE_SCALE,
          z: z * EXPLODE_SCALE,
          duration: 0.6,
          ease: 'expo.out',
        });
        // Alternate spin direction per axis/cube via index parity so the 8
        // cubes visibly tumble differently instead of moving in unison; the
        // varying duration keeps them out of sync with each other too.
        const tumble = gsap.to(mesh.rotation, {
          x: `+=${i % 2 === 0 ? TWO_PI : -TWO_PI}`,
          y: `+=${i % 3 === 0 ? TWO_PI : -TWO_PI}`,
          duration: 6.5 + i * 0.35,
          repeat: -1,
          ease: 'none',
        });
        return [move, tumble];
      }

      const move = gsap.to(mesh.position, { x, y, z, duration: 0.75, ease: 'power4.out' });
      const settle = gsap.to(mesh.rotation, { x: 0, y: 0, z: 0, duration: 1.5, ease: 'power2.out' });
      return [move, settle];
    });

    return () => tweens.forEach((tween) => tween.kill());
  });

  // Fades `rimGlow` toward 0.4 while dragging, back to 0 otherwise. gsap can
  // only tween plain object properties, not a Svelte `$state` variable
  // directly, so it tweens a throwaway `value` object and copies each frame's
  // number into `rimGlow` via `onUpdate` (which is what the template reads).
  $effect(() => {
    const target = dragActive ? 0.4 : 0;
    // `untrack` reads `rimGlow`'s *current* value without subscribing this
    // effect to it — otherwise the `onUpdate` write below would immediately
    // re-trigger this same effect on every animation frame.
    const value = { opacity: untrack(() => rimGlow) };
    const tween = gsap.to(value, {
      opacity: target,
      duration: 0.35,
      ease: 'power2.out',
      onUpdate: () => {
        rimGlow = value.opacity;
      },
    });
    return () => tween.kill();
  });
  
</script>






<!-- DIAMOND -->
<!-- `bind:ref` is how Threlte hands you the underlying Three.js object once it
     exists, so plain Three.js/gsap code (above) can animate it directly. -->
<T.Group bind:ref={diamondGroup}>
  <!-- The cube itself: a box mesh with a single chrome material. Pointer
       events only fire because `interactivity()` was called in Scene.svelte. -->
  {#await envMapPromise}
    <!-- MeshStandardMaterial reacts to light realistically (unlike
         MeshBasicMaterial). `metalness={1}` makes it fully metallic — it
         reflects its environment instead of showing its own color.
         `roughness={0.1}` keeps those reflections sharp/mirror-like rather
         than blurry. Rendered only until the HDR below finishes loading. -->
    <T.Mesh onpointerenter={handlePointerEnter} onpointerleave={handlePointerLeave} onclick={onClick}>
      <T.OctahedronGeometry args={[.75]} />
      <T.MeshStandardMaterial metalness={1} roughness={0.1} color="#ff0d1a"/>
    </T.Mesh>
  {:then envMap}
    <!-- A convincing glass/diamond refraction material: light bends as it
         passes through the mesh instead of just reflecting off it. `envMap`
         is the real HDR panorama loaded above (public/hdr/), not the chrome
         fallback's fake <VirtualEnvironment> box.

         This is a whole separate <T.Mesh> from the chrome fallback above
         (not a material swapped in-place on a shared mesh) — Threlte doesn't
         hand off the `material` attachment cleanly when only the material
         child changes inside an already-mounted mesh, which silently left
         the old material attached with the new one never actually compiled.
         A fresh mesh per branch avoids that. -->
    <T.Mesh onpointerenter={handlePointerEnter} onpointerleave={handlePointerLeave} onclick={onClick}>
      <!-- Geometry before material: MeshRefractionMaterial builds its BVH
           from `mesh.geometry` once, on mount, and needs the real geometry
           (not Three's default empty one) to already be set. -->
      <T.OctahedronGeometry args={[.75]} detail={3}/>
      <MeshRefractionMaterial
        {envMap}
        ior={2}
        bounces={5}
        fresnel={1}
        aberrationStrength={0.3}
        color="#ff0d1a"
      />
    </T.Mesh>
  {/await}

  <!-- A second, slightly larger copy of the same cube (scale 1.14 = 14%
       bigger) used purely as a glow effect around the real cube. -->
  <T.Mesh scale={1}>
    <T.OctahedronGeometry args={[1, 1, 1]} />
    <!--
      side={BackSide}: only render the *inside* surface of this larger box.
      Since it's bigger than the chrome cube and we're looking at its inside
      face, what's visible is a glowing outline just outside the cube's edges,
      rather than the box covering the cube entirely.

      depthWrite={false}: skip writing to the depth buffer so this transparent
      glow doesn't block/hide anything behind it based on depth — it should
      always blend on top.

      blending={AdditiveBlending}: makes overlapping glow brighter instead of
      just more opaque — the usual look for light/glow effects.
    -->
    <T.MeshBasicMaterial
      color="#818cf8"
      transparent
      opacity={rimGlow}
      side={THREE.BackSide}
      depthWrite={false}
      blending={THREE.AdditiveBlending}
    />
  </T.Mesh>
</T.Group>

<T.Group bind:ref={cubeGroup} position={[0, 0, 0]} scale={1}>
  <T.Mesh bind:ref={cube1} position={[.5, .5, -.5]}>
    <T.BoxGeometry args={[1, 1, 1]} />
    <T.MeshStandardMaterial metalness={1} roughness={0.25} color="#CCBEBF"/>
  </T.Mesh>
  <T.Mesh bind:ref={cube2} position={[-.5, .5, -.5]}>
    <T.BoxGeometry args={[1, 1, 1]} />
    <T.MeshStandardMaterial metalness={1} roughness={0.25} color="#CCBEBF"/>
  </T.Mesh>
  <T.Mesh bind:ref={cube3} position={[.5, -.5, -.5]}>
    <T.BoxGeometry args={[1, 1, 1]} />
    <T.MeshStandardMaterial metalness={1} roughness={0.25} color="#CCBEBF"/>
  </T.Mesh>
  <T.Mesh bind:ref={cube4} position={[-.5, -.5, -.5]}>
    <T.BoxGeometry args={[1, 1, 1]} />
    <T.MeshStandardMaterial metalness={1} roughness={0.25} color="#CCBEBF"/>
  </T.Mesh>
  <T.Mesh bind:ref={cube5} position={[.5, .5, .5]}>
    <T.BoxGeometry args={[1, 1, 1]} />
    <T.MeshStandardMaterial metalness={1} roughness={0.25} color="#CCBEBF"/>
  </T.Mesh>
  <T.Mesh bind:ref={cube6} position={[-.5, .5, .5]}>
    <T.BoxGeometry args={[1, 1, 1]} />
    <T.MeshStandardMaterial metalness={1} roughness={0.25} color="#CCBEBF"/>
  </T.Mesh>
  <T.Mesh bind:ref={cube7} position={[.5, -.5, .5]}>
    <T.BoxGeometry args={[1, 1, 1]} />
    <T.MeshStandardMaterial metalness={1} roughness={0.25} color="#CCBEBF"/>
  </T.Mesh>
  <T.Mesh bind:ref={cube8} position={[-.5, -.5, .5]}>
    <T.BoxGeometry args={[1, 1, 1]} />
    <T.MeshStandardMaterial metalness={1} roughness={0.25} color="#CCBEBF"/>
  </T.Mesh>
</T.Group>

