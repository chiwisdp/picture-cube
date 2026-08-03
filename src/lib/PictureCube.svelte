<script lang="ts">
  import { T } from '@threlte/core'
  import { useTexture } from '@threlte/extras'
  import gsap from 'gsap'
  import * as THREE from 'three'

  let group = $state<THREE.Group>()
  let seed = $state(0)

  let urls = $derived(
    Array.from({ length: 6 }, (_, i) => `https://picsum.photos/seed/picture-cube-${seed}-${i}/600`)
  )
  let textures = $derived(urls.map((url) => useTexture(url)))

  function attachFace(index: number) {
    return ({ parent, ref }: { parent: unknown; ref: THREE.Material }) => {
      const mesh = parent as THREE.Mesh
      const mats =
        Array.isArray(mesh.material) && mesh.material.length === 6
          ? [...mesh.material]
          : Array.from({ length: 6 }, () => new THREE.MeshStandardMaterial({ color: '#232336' }))
      mats[index] = ref
      mesh.material = mats
    }
  }

  function shuffle() {
    seed += 1
    if (!group) return
    gsap.to(group.rotation, {
      x: '+=' + Math.PI * 2,
      duration: 0.9,
      ease: 'power2.inOut'
    })
  }

  function onPointerEnter() {
    if (!group) return
    gsap.to(group.scale, { x: 1.1, y: 1.1, z: 1.1, duration: 0.3, ease: 'power2.out' })
  }

  function onPointerLeave() {
    if (!group) return
    gsap.to(group.scale, { x: 1, y: 1, z: 1, duration: 0.3, ease: 'power2.out' })
  }

  $effect(() => {
    if (!group) return

    const entrance = gsap.from(group.rotation, {
      y: Math.PI * 2,
      x: Math.PI * 0.4,
      duration: 1.6,
      ease: 'power3.out'
    })
    const idle = gsap.to(group.rotation, {
      y: '+=' + Math.PI * 2,
      duration: 26,
      repeat: -1,
      ease: 'none'
    })

    return () => {
      entrance.kill()
      idle.kill()
    }
  })
</script>

<T.Group bind:ref={group}>
  <T.Mesh
    onclick={shuffle}
    onpointerenter={onPointerEnter}
    onpointerleave={onPointerLeave}
  >
    <T.BoxGeometry args={[2, 2, 2]} />
    {#each textures as texture, i (i)}
      {#await texture then map}
        <T.MeshStandardMaterial
          {map}
          roughness={0.6}
          metalness={0.05}
          attach={attachFace(i)}
        />
      {/await}
    {/each}
  </T.Mesh>
</T.Group>
