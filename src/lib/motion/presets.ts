import type { Target, TargetAndTransition, Transition } from 'svelte-motion'

export type MotionPreset = {
  initial: Target
  animate: TargetAndTransition
  transition: Transition
}

export const blink: MotionPreset = {
  initial: { opacity: 0, scaleY: 0.98 },
  animate: {
    opacity: [.25, 0, 0, 0, 0, 1, 0, 1, 0, 1],
    scaleY: [0.5, 0.5, 0.5, 0.5, 0.5, 0.75, 0.8, 1.2, 0.5, 1]
  },
  transition: {
    times: [0, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
    duration: 0.6,
    ease: 'backOut'
  }
}
