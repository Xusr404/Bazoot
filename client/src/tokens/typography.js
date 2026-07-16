// Typography tokens extracted from bazoot/ (Phase 3B).
// Source loads NO custom fonts: Tailwind v4 default sans stack + `antialiased`.

export const fontFamily = {
  sans: "ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'",
}

export const fontWeight = {
  semibold: 600, // form buttons, inputs (font-semibold)
  bold: 700, // headings, answers, chips, toasts (font-bold)
  extrabold: 800, // game PIN, join URL (font-extrabold)
}

// Tailwind text sizes per usage (class — px equivalent)
export const fontSize = {
  pinCode: '3.75rem', // text-6xl — Game PIN
  countdown: '3.75rem', // text-6xl (md: text-8xl/6rem) — start countdown number
  heading: '1.875rem', // text-3xl (md: 4xl, lg: 5xl) — question / subject / wait text
  leaderboardTitle: '3rem', // text-5xl — "Leaderboard"
  resultMessage: '2.25rem', // text-4xl — "Nice!" / "Too bad"
  playerChip: '1.875rem', // text-3xl — lobby player names
  rowText: '1.5rem', // text-2xl — leaderboard rows, pills, podium points/names (md: 4xl)
  answer: '1.125rem', // text-lg (md: text-xl) — answer buttons, frame chips, buttons
  small: '0.875rem', // text-sm — "Time"/"Answers" pill labels
}
