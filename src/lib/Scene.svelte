<script lang="ts">
  import { T } from '@threlte/core'
  import { OrbitControls, interactivity } from '@threlte/extras'
  import PictureCube from './PictureCube.svelte'

  interactivity()
</script>

<T.PerspectiveCamera
  makeDefault
  position={[3.5, 2.5, 4.5]}
  fov={45}
>
  <OrbitControls
    enableDamping
    target={[0, 0, 0]}
    minDistance={3}
    maxDistance={12}
  />
</T.PerspectiveCamera>

<T.AmbientLight intensity={0.7} />
<T.DirectionalLight
  position={[5, 6, 4]}
  intensity={1.3}
/>
<T.DirectionalLight
  position={[-4, -2, -3]}
  intensity={0.3}
/>

<PictureCube />
