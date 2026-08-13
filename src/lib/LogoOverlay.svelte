<script lang="ts">
  import Frame from './components/Frame.svelte';
  import { Motion } from 'svelte-motion';
  import { blink } from './motion/presets';
</script>

<!-- this is the logo overlay -->
<div class=" pointer-events-none absolute top-0 right-0 bottom-0 left-0 h-dvh w-dvw p-8">
  <!-- intro animation use blink-->
  <Motion let:motion {...blink}>
    <!-- logo and text -->
    <div use:motion class="pointer-events-none h-full">
      <Frame
        padding="0rem"
        topRightCorner="0"
        bottomLeftCorner="0"
        class="pointer-events-none block h-full w-full"
      >
        <img src="/images/logo.svg" alt="Logo" class="h-35 w-auto border-r-2 pt-4 pr-4 pb-2 pl-3" />
        <Frame
          topLeftCorner="0"
          topRightCorner="0"
          bottomLeftCorner="0"
          background="var(--color-white)"
        >
          <p class=" text-m font-body tracking-[0.1988em] text-my-blue">
            (-) WEB DEVELOPER IMAGE ANALYSIS AI (-)
          </p>
        </Frame>
      </Frame>
    </div>
  </Motion>
</div>
