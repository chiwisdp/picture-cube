<script lang="ts">
  import { T } from '@threlte/core'
  // GSAP animates plain numbers over time. Here it's used to tween Three.js
  // object properties directly (rotation, scale, an opacity value) instead of
  // Svelte's own transition system, since those need easing/looping/replaying
  // control that CSS-style transitions don't give you.
  import gsap from 'gsap'
  import { untrack } from 'svelte'
  import * as THREE from 'three'

  type Props = {
    /** True while a file drag is over the window. Scales the cube and lights the rim. */
    dragActive?: boolean
    /** Called when the cube is clicked — opens the same file picker as the "browse" link. */
    onClick?: () => void
  }

  // Svelte 5 runes: `$props()` reads props passed by the parent (Scene.svelte)
  let { dragActive = false, onClick }: Props = $props()

  const TWO_PI = Math.PI * 2 // one full rotation, in radians (Three.js uses radians, not degrees)

  // `$state` makes a variable reactive: reading it inside a template or an
  // `$effect` automatically subscribes to future changes, and writing to it
  // re-runs anything that depends on it.

  // Will hold the actual Three.js `Group` object once Threlte creates it (see
  // `bind:ref={group}` in the template below) — gsap animates its
  // `.rotation`/`.scale`, which are plain Three.js properties, not Svelte state.
  let group = $state<THREE.Group>()
  // The gsap tween driving the endless idle rotation, so later effects can
  // pause/resume it (e.g. while hovered or dragging).
  let idleSpin = $state<gsap.core.Tween>()
  let hovered = $state(false)
  // 0–1 opacity of the glowing outer shell (see the second <T.Mesh> below).
  // Tweened up while a file is being dragged over the window, back down when not.
  let rimGlow = $state(0)

  const handlePointerEnter = (): void => {
    hovered = true
  }

  const handlePointerLeave = (): void => {
    hovered = false
  }

  // Three.js doesn't touch the CSS cursor on its own — set it manually so the
  // cube reads as clickable, same as hovering a real button.
  $effect(() => {
    document.body.style.cursor = hovered ? 'pointer' : ''
    return () => {
      document.body.style.cursor = ''
    }
  })

  // `$effect` re-runs whenever any `$state` it reads changes. This one only
  // reads `group`, so it re-runs once — right after the cube's <T.Group> mounts
  // and `bind:ref` sets `group` for the first time.
  $effect(() => {
    if (!group) return // nothing to animate until the group ref exists

    // One-time "spin in" animation played on mount: `gsap.from(...)` animates
    // *from* the given values *to* the element's current values, so the cube
    // appears to unwind into its resting rotation.
    const entrance = gsap.from(group.rotation, {
      y: TWO_PI,
      x: Math.PI * 0.4,
      duration: 1.6,
      ease: 'power3.out'
    })
    // The continuous background spin: rotates y by one more full turn than
    // wherever it currently is (`'+=' + TWO_PI`), forever (`repeat: -1`), at a
    // constant speed (`ease: 'none'`).
    const spin = gsap.to(group.rotation, {
      y: '+=' + TWO_PI,
      duration: 26,
      repeat: -1,
      ease: 'none'
    })
    idleSpin = spin

    // Effects can return a cleanup function, run before the effect re-runs or
    // when the component is destroyed — here it stops both tweens so they
    // don't keep running (or fight over `group.rotation`) after unmount.
    return () => {
      entrance.kill()
      spin.kill()
    }
  })

  // Pauses/resumes the idle spin depending on interaction state, without
  // restarting it — `.play()`/`.pause()` just toggle whether the existing
  // tween is advancing.
  $effect(() => {
    if (!idleSpin) return
    const shouldSpin = !dragActive && !hovered
    if (shouldSpin) {
      idleSpin.play()
      return
    }
    idleSpin.pause()
  })

  // Scales the whole group up slightly on hover, more while a file is being
  // dragged over the window. Re-runs whenever `dragActive`, `hovered`, or
  // `group` changes, killing the previous tween first so rapid hover in/out
  // doesn't stack up competing animations.
  $effect(() => {
    if (!group) return
    const scale = dragActive ? 1.16 : hovered ? 1.06 : 1
    const tween = gsap.to(group.scale, { x: scale, y: scale, z: scale, duration: 0.35, ease: 'power2.out' })
    return () => tween.kill()
  })

  // Fades `rimGlow` toward 0.4 while dragging, back to 0 otherwise. gsap can
  // only tween plain object properties, not a Svelte `$state` variable
  // directly, so it tweens a throwaway `value` object and copies each frame's
  // number into `rimGlow` via `onUpdate` (which is what the template reads).
  $effect(() => {
    const target = dragActive ? 0.4 : 0
    // `untrack` reads `rimGlow`'s *current* value without subscribing this
    // effect to it — otherwise the `onUpdate` write below would immediately
    // re-trigger this same effect on every animation frame.
    const value = { opacity: untrack(() => rimGlow) }
    const tween = gsap.to(value, {
      opacity: target,
      duration: 0.35,
      ease: 'power2.out',
      onUpdate: () => {
        rimGlow = value.opacity
      }
    })
    return () => tween.kill()
  })
</script>

<!-- `bind:ref` is how Threlte hands you the underlying Three.js object once it
     exists, so plain Three.js/gsap code (above) can animate it directly. -->
<T.Group bind:ref={group}>
  <!-- The cube itself: a box mesh with a single chrome material. Pointer
       events only fire because `interactivity()` was called in Scene.svelte. -->
  <T.Mesh
    onpointerenter={handlePointerEnter}
    onpointerleave={handlePointerLeave}
    onclick={onClick}
  >
    <!-- args={[width, height, depth]} — a 2x2x2 cube centered on the origin -->
    <T.BoxGeometry args={[2, 2, 2]} />
    <!-- MeshStandardMaterial reacts to light realistically (unlike
         MeshBasicMaterial). `metalness={1}` makes it fully metallic — it
         reflects its environment instead of showing its own color.
         `roughness={0.1}` keeps those reflections sharp/mirror-like rather
         than blurry. See Scene.svelte's <VirtualEnvironment> for what it's
         actually reflecting. -->
    <T.MeshStandardMaterial metalness={1} roughness={0.1} />
  </T.Mesh>

  <!-- A second, slightly larger copy of the same cube (scale 1.14 = 14%
       bigger) used purely as a glow effect around the real cube. -->
  <T.Mesh scale={1.14}>
    <T.BoxGeometry args={[2, 2, 2]} />
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
