// Sound inventory extracted from bazoot/ (Phase 3D).
// Files copied byte-for-byte from bazoot/packages/web/public/sounds/ to client/public/sounds/.

export const SOUNDS = {
  boump: '/sounds/boump.mp3', // start-countdown tick (SHOW_START), vol 0.2
  show: '/sounds/show.mp3', // SHOW_QUESTION mount, vol 0.5
  answersMusic: '/sounds/answersMusic.mp3', // SELECT_ANSWER loop (skip if question has audio/video); restarted once on SHOW_RESPONSES, vol 0.2
  answersSound: '/sounds/answersSound.mp3', // answer submitted / game:playerAnswer pop, vol 0.1
  results: '/sounds/results.mp3', // SHOW_RESULT + SHOW_RESPONSES mount, vol 0.2
  podiumThird: '/sounds/three.mp3', // podium stage 1, vol 0.2
  podiumSecond: '/sounds/second.mp3', // podium stage 2, vol 0.2
  snareRoll: '/sounds/snearRoll.mp3', // podium stage 3 (before winner), vol 0.2
  podiumFirst: '/sounds/first.mp3', // podium stage 4 (winner), vol 0.2
}

export const SOUND_VOLUMES = {
  boump: 0.2,
  show: 0.5,
  answersMusic: 0.2,
  answersSound: 0.1,
  results: 0.2,
  podiumThird: 0.2,
  podiumSecond: 0.2,
  snareRoll: 0.2,
  podiumFirst: 0.2,
}
