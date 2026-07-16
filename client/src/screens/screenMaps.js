import { EVENTS } from '@bazoot/shared/events'
import { STATUS } from '@bazoot/shared/gameStates'
import { AnswersScreen } from './AnswersScreen.jsx'
import { LeaderboardScreen } from './LeaderboardScreen.jsx'
import { PodiumScreen } from './PodiumScreen.jsx'
import { PreparedScreen } from './PreparedScreen.jsx'
import { QuestionScreen } from './QuestionScreen.jsx'
import { ResponsesScreen } from './ResponsesScreen.jsx'
import { ResultScreen } from './ResultScreen.jsx'
import { RoomScreen } from './RoomScreen.jsx'
import { StartScreen } from './StartScreen.jsx'
import { WaitScreen } from './WaitScreen.jsx'

// Status → screen registries (the source's GAME_STATE_COMPONENTS maps).
// Kept in a separate file so demo/ can import without pulling in QuizWizard.
export const PLAYER_SCREENS = {
  [STATUS.SELECT_ANSWER]: AnswersScreen,
  [STATUS.SHOW_QUESTION]: QuestionScreen,
  [STATUS.WAIT]: WaitScreen,
  [STATUS.SHOW_START]: StartScreen,
  [STATUS.SHOW_RESULT]: ResultScreen,
  [STATUS.SHOW_PREPARED]: PreparedScreen,
}

export const MANAGER_SCREENS = {
  ...PLAYER_SCREENS,
  [STATUS.SHOW_ROOM]: RoomScreen,
  [STATUS.SHOW_RESPONSES]: ResponsesScreen,
  [STATUS.SHOW_LEADERBOARD]: LeaderboardScreen,
  [STATUS.FINISHED]: PodiumScreen,
}

// Manager "next" button: label + event per status (source MANAGER_SKIP_BTN /
// MANAGER_SKIP_EVENTS). Statuses absent here show no button.
export const MANAGER_SKIP_BTN = {
  [STATUS.SHOW_ROOM]: 'Start Game',
  [STATUS.SELECT_ANSWER]: 'Skip',
  [STATUS.SHOW_RESPONSES]: 'Next',
  [STATUS.SHOW_LEADERBOARD]: 'Next',
  [STATUS.FINISHED]: 'Play Again',
}

export const MANAGER_SKIP_EVENTS = {
  [STATUS.SHOW_ROOM]: EVENTS.MANAGER_START_GAME,
  [STATUS.SELECT_ANSWER]: EVENTS.MANAGER_ABORT_QUIZ,
  [STATUS.SHOW_RESPONSES]: EVENTS.MANAGER_SHOW_LEADERBOARD,
  [STATUS.SHOW_LEADERBOARD]: EVENTS.MANAGER_NEXT_QUESTION,
  [STATUS.FINISHED]: EVENTS.MANAGER_RESET_GAME,
}
