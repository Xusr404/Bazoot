// Colour tokens extracted from bazoot/ (Phase 3A).
// The UI is styled with Tailwind v4 utility classes; where a colour comes from a
// Tailwind class, `twClass` is the canonical reference (rendered as oklch by
// Tailwind v4) and `hex` is the closest hex equivalent for non-Tailwind use.

export const colours = {
  // Theme (@theme in bazoot/packages/web/src/index.css)
  primary: '#ff9900', // --color-primary: buttons, podium columns, leaderboard rows, timer square, progress bar
  secondary: '#1a140b', // --color-secondary: page background outside the game frame

  // Answer tiles. First four match the source (bazoot utils/constants.ts
  // ANSWERS_COLORS); purple/pink extend the palette so a question can carry up
  // to six answers (see answerColourClasses / ANSWER_ICONS).
  answerRed: '#ef4444', // twClass: bg-red-500    (answer 0, Triangle)
  answerBlue: '#3b82f6', // twClass: bg-blue-500   (answer 1, Rhombus)
  answerYellow: '#eab308', // twClass: bg-yellow-500 (answer 2, Circle)
  answerGreen: '#22c55e', // twClass: bg-green-500  (answer 3, Square)
  answerPurple: '#a855f7', // twClass: bg-purple-500 (answer 4, Star)
  answerPink: '#ec4899', // twClass: bg-pink-500   (answer 5, Hexagon)

  // Result feedback (hardcoded in icon SVGs)
  correctGreen: '#22c55e', // CricleCheck fill
  wrongRed: '#ef4444', // CricleXmark fill
  iconBacking: '#ffffff', // white circle behind result icons

  // Timer / progress
  timerBar: '#ff9900', // progress bar under SHOW_QUESTION = bg-primary
  countdownSquare: '#ff9900', // rotating SHOW_START square = bg-primary

  // Chrome
  white: '#ffffff', // cards, chips, manager Next button, player bottom bar
  textDark: '#1f2937', // twClass: text-gray-800 / bg-gray-800 points pill
  overlayDark: 'rgba(0, 0, 0, 0.4)', // bg-black/40 pills and badges
  overlayLabel: 'rgba(0, 0, 0, 0.1)', // bg-black/10 bar-chart count strip
  insetShadow: 'rgba(0, 0, 0, 0.25)', // .shadow-inset / .btn-shadow inset colour
  preparedCard: '#374151', // twClass: bg-gray-700 (3D quizz card)
  inputOutline: '#d1d5db', // twClass: outline-gray-300

  // Podium medals (circle bg / border)
  podiumFirstBg: '#fcd34d', // twClass: bg-amber-300
  podiumFirstBorder: '#fbbf24', // twClass: border-amber-400
  podiumSecondBg: '#71717a', // twClass: bg-zinc-500
  podiumSecondBorder: '#a1a1aa', // twClass: border-zinc-400
  podiumThirdBg: '#b45309', // twClass: bg-amber-700
  podiumThirdBorder: '#92400e', // twClass: border-amber-800

  // Decorative auth-screen blobs
  authBlob: 'rgba(255, 153, 0, 0.15)', // bg-primary/15
}

// Tailwind class names for the answer tiles, in answer-index order. Source of
// truth for AnswerButton/Prepared/Responses grids. The first four match the
// source app; purple/pink cover the optional 5th and 6th answers.
export const answerColourClasses = [
  'bg-red-500',
  'bg-blue-500',
  'bg-yellow-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-pink-500',
]
