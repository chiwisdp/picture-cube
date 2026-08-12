<script lang="ts">
  import { T } from '@threlte/core'
  import gsap from 'gsap'
  import { untrack } from 'svelte'
  import * as THREE from 'three'

  type Props = {
    /** True while a file drag is over the window. Scales the cube and lights the rim. */
    dragActive?: boolean
  }

  let { dragActive = false }: Props = $props()

  const TWO_PI = Math.PI * 2

  let group = $state<THREE.Group>()
  let idleSpin = $state<gsap.core.Tween>()
  let hovered = $state(false)
  let rimGlow = $state(0)

  const handlePointerEnter = (): void => {
    hovered = true
  }

  const handlePointerLeave = (): void => {
    hovered = false
  }

  $effect(() => {
    if (!group) return

    const entrance = gsap.from(group.rotation, {
      y: TWO_PI,
      x: Math.PI * 0.4,
      duration: 1.6,
      ease: 'power3.out'
    })
    const spin = gsap.to(group.rotation, {
      y: '+=' + TWO_PI,
      duration: 26,
      repeat: -1,
      ease: 'none'
    })
    idleSpin = spin

    return () => {
      entrance.kill()
      spin.kill()
    }
  })

  $effect(() => {
    if (!idleSpin) return
    const shouldSpin = !dragActive && !hovered
    if (shouldSpin) {
      idleSpin.play()
      return
    }
    idleSpin.pause()
  })

  $effect(() => {
    if (!group) return
    const scale = dragActive ? 1.16 : hovered ? 1.06 : 1
    const tween = gsap.to(group.scale, { x: scale, y: scale, z: scale, duration: 0.35, ease: 'power2.out' })
    return () => tween.kill()
  })

  $effect(() => {
    const target = dragActive ? 0.4 : 0
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

<T.Group bind:ref={group}>
  <T.Mesh
    onpointerenter={handlePointerEnter}
    onpointerleave={handlePointerLeave}
  >
    <T.BoxGeometry args={[2, 2, 2]} />
    <T.MeshStandardMaterial metalness={1} roughness={0.1} />
  </T.Mesh>

  <T.Mesh scale={1.14}>
    <T.BoxGeometry args={[2, 2, 2]} />
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
