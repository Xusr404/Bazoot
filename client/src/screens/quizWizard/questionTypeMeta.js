import { QUESTION_TYPES } from '@bazoot/shared/questionTypes'

// Display metadata for the four question types — one source for the editor's
// type picker, review tags, and the quiz list.
export const TYPE_META = {
  [QUESTION_TYPES.SINGLE]: {
    label: 'Single choice',
    short: 'Single',
    description: 'One correct answer',
  },
  [QUESTION_TYPES.TRUE_FALSE]: {
    label: 'True / False',
    short: 'True/False',
    description: 'Statement check',
  },
  [QUESTION_TYPES.MULTI]: {
    label: 'Multiple correct',
    short: 'Multi',
    description: 'Select all that apply',
  },
  [QUESTION_TYPES.ORDER]: {
    label: 'Put in order',
    short: 'Order',
    description: 'Sort into sequence',
  },
}

export const TYPE_OPTIONS = Object.entries(TYPE_META).map(([value, meta]) => ({
  value,
  label: meta.label,
  description: meta.description,
}))
