// Question types. Untyped questions are 'single' (the original behaviour),
// so every pre-existing quiz file keeps working unchanged.
export const QUESTION_TYPES = {
  /** one correct answer, click to answer (original behaviour) */
  SINGLE: 'single',
  /** single with exactly two answers: True / False */
  TRUE_FALSE: 'trueFalse',
  /** several correct answers; player selects a set and submits; exact match scores */
  MULTI: 'multi',
  /** player puts the answers into the right sequence; exact order scores.
   *  Authored answer order is the correct order; the game shuffles the display. */
  ORDER: 'order',
}

export const questionTypeOf = (question) => question?.type ?? QUESTION_TYPES.SINGLE
