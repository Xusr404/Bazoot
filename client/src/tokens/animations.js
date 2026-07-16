// Animation tokens extracted from bazoot/ (Phase 3C).
// CSS keyframes are copied verbatim into client/src/styles/animations.css —
// these constants document and parameterise the same specs for JS-driven motion.

export const animations = {
  // Animation: show — pop-in scale bounce
  //   Trigger: titles/sections mount (SHOW_START, SHOW_QUESTION, SHOW_PREPARED, SHOW_RESULT, podium subject)
  //   Effect:  scale 0 -> 0.9 (30%) -> 0.8 (60%) -> 1 (80%)
  //   Library: CSS keyframes (.anim-show)
  show: { duration: 500, easing: 'ease-out' },

  // Animation: progressBar — question reading-time bar
  //   Trigger: SHOW_QUESTION mount; Element: bg-primary bar
  //   Effect:  width 0% -> 100%, fill mode forwards; duration = question.cooldown seconds
  progressBar: { easing: 'linear', fill: 'forwards' },

  // Animation: quizz — 3D card reveal on SHOW_PREPARED
  //   Effect: scale 0 + rotateY(-60deg) rotateX(60deg) -> settle at
  //           perspective(1200px) rotateY(-15deg) rotateX(15deg) translateZ(100px)
  //   Resting box-shadow: 10px 10px 0 rgba(20, 24, 29, 1)
  quizz: { duration: 800, easing: 'linear' },

  // Animation: quizzButton — answer tiles inside the 3D card
  //   Effect: scale 0 -> 1 (60%) -> 0.8 (80%) -> 1
  quizzButton: { duration: 800, easing: 'ease-out' },

  // Animation: balanced — winner names rocking on podium
  //   Effect: rotate 0 -> -10deg/-10px -> 0 -> +10deg/-10px -> 0, infinite
  balanced: { duration: 800, easing: 'linear', iteration: 'infinite' },

  // Animation: spotlightAnim — radial dark mask sweep when winner revealed
  //   Effect: oversized radial-gradient mask pans across the screen then fades
  spotlight: { duration: 2500, easing: 'ease-in' },

  // Animation: timer — defined in source CSS (.anim-timer) but unused by live screens.
  // Kept for parity: scale 1 -> 1.4 rot -6deg -> 0.8 rot 6deg -> 1
  timer: { duration: 1000, easing: 'ease-out', iteration: 'infinite' },

  // Podium staging (JS-driven, Podium screen): stages 1..4 advance every 2000 ms
  //   1 = 3rd place rises, 2 = 2nd, 3 = 1st + spotlight + snare roll,
  //   4 = winner name + confetti + first.mp3. Columns use CSS transition-all.
  podiumStageInterval: 2000,

  // Leaderboard (motion/react, SHOW_LEADERBOARD):
  //   old board renders first, swaps to new board after `swapDelay`;
  //   rows reorder with layout spring; points count up with a stiffer spring.
  leaderboard: {
    swapDelay: 1600,
    rowSpring: { type: 'spring', stiffness: 350, damping: 25 },
    pointsSpring: { stiffness: 1000, damping: 30 },
    enter: { opacity: 0, y: 50 },
    exitDuration: 200,
  },

  // SHOW_START countdown square: rotates 45deg per elapsed second via CSS transition-all.
  startSquareRotationPerTick: 45,
}
