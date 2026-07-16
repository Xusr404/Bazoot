export const friendlyIssueMessage = (issue) => {
  if (!issue) {
    return 'Incomplete'
  }

  if (issue.field === 'subject') {
    return 'Quiz title missing'
  }

  if (issue.field === 'text') {
    return 'Question text missing'
  }

  if (issue.field === 'solution') {
    return 'Missing correct answer'
  }

  if (issue.field === 'answer') {
    return issue.answerIndex === undefined
      ? 'Answer text missing'
      : `Answer ${issue.answerIndex + 1} is empty`
  }

  if (issue.field === 'answers') {
    return 'Answer choices incomplete'
  }

  if (issue.field === 'cooldown') {
    return 'Reading time needs attention'
  }

  if (issue.field === 'time') {
    return 'Answer time needs attention'
  }

  if (issue.field === 'media') {
    return 'Media link needs attention'
  }

  if (issue.message?.includes('required')) {
    return 'Required field missing'
  }

  return issue.message || 'Incomplete'
}
