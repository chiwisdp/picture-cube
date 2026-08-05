<script lang="ts">
  import { T } from '@threlte/core'
  import type { IntersectionEvent } from '@threlte/extras'
  import gsap from 'gsap'
  import { untrack } from 'svelte'
  import * as THREE from 'three'
  import { createCanvas2D } from './image/encodeSupport'
  import { FACES_PER_PAGE, imageStore } from './image/store.svelte'

  type Props = {
    /** True while a file drag is over the window. Scales the cube and lights the rim. */
    dragActive?: boolean
  }

  let { dragActive = false }: Props = $props()

  const TWO_PI = Math.PI * 2

  /**
   * Group rotation that brings each box material index round to face the camera.
   * BoxGeometry orders its groups +X, -X, +Y, -Y, +Z, -Z.
   */
  const FACE_ROTATIONS: readonly (readonly [number, number])[] = [
    [0, -Math.PI / 2],
    [0, Math.PI / 2],
    [Math.PI / 2, 0],
    [-Math.PI / 2, 0],
    [0, 0],
    [0, Math.PI]
  ]

  /** Picks the equivalent angle nearest the current one so tweens never unwind. */
  const nearestAngle = (current: number, target: number): number =>
    target + Math.round((current - target) / TWO_PI) * TWO_PI

  const createPlaceholderTexture = (): THREE.CanvasTexture => {
    const size = 512
    const { canvas, context } = createCanvas2D(size, size)

    context.fillStyle = '#15151e'
    context.fillRect(0, 0, size, size)
    context.strokeStyle = '#3b3b55'
    context.lineWidth = 8
    context.setLineDash([26, 20])
    context.strokeRect(44, 44, size - 88, size - 88)
    context.fillStyle = '#4d4d6b'
    context.font = '600 34px system-ui, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText('empty face', size / 2, size / 2)

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }

  /**
   * Built from the decoded `ImageBitmap` rather than a URL: a URL-based load
   * cannot paint a TIFF, and re-loading would decode the file a second time.
   */
  const createBitmapTexture = (bitmap: ImageBitmap): THREE.Texture => {
    const texture = new THREE.Texture(bitmap)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.magFilter = THREE.LinearFilter
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.anisotropy = 4
    texture.needsUpdate = true
    return texture
  }

  const placeholderTexture = createPlaceholderTexture()

  let group = $state<THREE.Group>()
  let idleSpin = $state<gsap.core.Tween>()
  let hovered = $state(false)
  let rimGlow = $state(0)
  let faceTextures = $state<(THREE.Texture | null)[]>(
    Array.from({ length: FACES_PER_PAGE }, () => null)
  )

  // Memoised on a signature so a status change on a queued image does not throw
  // away and re-upload six GPU textures.
  let cachedSignature = ''
  let cachedBitmaps: (ImageBitmap | null)[] = []

  let pageBitmaps = $derived.by(() => {
    const images = imageStore.pageImages
    const signature = images.map((image) => `${image.id}:${image.bitmap ? 'b' : '-'}`).join('|')
    if (signature !== cachedSignature) {
      cachedSignature = signature
      cachedBitmaps = images.map((image) => image.bitmap)
    }
    return cachedBitmaps
  })

  let selectedFaceIndex = $derived(
    imageStore.pageImages.findIndex((image) => image.id === imageStore.selectedId)
  )

  const attachFace = (index: number) => {
    return ({ parent, ref }: { parent: unknown; ref: THREE.Material }) => {
      const mesh = parent as THREE.Mesh
      const mats =
        Array.isArray(mesh.material) && mesh.material.length === FACES_PER_PAGE
          ? [...mesh.material]
          : Array.from(
              { length: FACES_PER_PAGE },
              () => new THREE.MeshStandardMaterial({ color: '#232336' })
            )
      mats[index] = ref
      mesh.material = mats
    }
  }

  const handleFaceClick = (event: IntersectionEvent<MouseEvent>): void => {
    const { faceIndex } = event
    if (faceIndex === null || faceIndex === undefined) return

    // Two triangles per box face, in material-index order.
    const image = imageStore.pageImages[Math.floor(faceIndex / 2)]
    if (!image) return

    event.stopPropagation()
    imageStore.select(image.id)
  }

  const handlePointerEnter = (): void => {
    hovered = true
  }

  const handlePointerLeave = (): void => {
    hovered = false
  }

  $effect(() => {
    const created = pageBitmaps.map((bitmap) => (bitmap ? createBitmapTexture(bitmap) : null))
    faceTextures = Array.from({ length: FACES_PER_PAGE }, (_, index) => created[index] ?? null)

    return () => {
      for (const texture of created) texture?.dispose()
    }
  })

  $effect(() => () => placeholderTexture.dispose())

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
    const shouldSpin = !dragActive && !hovered && selectedFaceIndex < 0
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

  $effect(() => {
    const index = selectedFaceIndex
    if (!group || index < 0) return

    const [x, y] = FACE_ROTATIONS[index]
    const tween = gsap.to(group.rotation, {
      x: nearestAngle(group.rotation.x, x),
      y: nearestAngle(group.rotation.y, y),
      z: nearestAngle(group.rotation.z, 0),
      duration: 0.9,
      ease: 'power3.inOut'
    })

    return () => tween.kill()
  })
</script>

<T.Group bind:ref={group}>
  <T.Mesh
    onclick={handleFaceClick}
    onpointerenter={handlePointerEnter}
    onpointerleave={handlePointerLeave}
  >
    <T.BoxGeometry args={[2, 2, 2]} />
    {#each faceTextures as texture, index (index)}
      <T.MeshStandardMaterial
        map={texture ?? placeholderTexture}
        roughness={0.55}
        metalness={0.05}
        emissive={selectedFaceIndex === index ? '#6366f1' : '#000000'}
        emissiveIntensity={selectedFaceIndex === index ? 0.35 : 0}
        attach={attachFace(index)}
      />
    {/each}
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
