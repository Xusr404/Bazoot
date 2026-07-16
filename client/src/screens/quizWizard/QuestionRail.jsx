import { questionTypeOf } from '@bazoot/shared/questionTypes'
import { QUIZ_LIMITS } from '@bazoot/shared/quizValidation'
import clsx from 'clsx'
import { Reorder } from 'motion/react'
import { useState } from 'react'
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  CopyIcon,
  DotsVerticalIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from '../../components/icons/ui.jsx'
import { Card } from '../../components/ui/Card.jsx'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.jsx'
import { Menu } from '../../components/ui/Menu.jsx'
import { useScreenSize } from '../../hooks/useScreenSize.js'
import { TYPE_META } from './questionTypeMeta.js'
import { addQuestion, duplicateQuestion, removeQuestion, reorderQuestionsByIds } from './quizDraft.js'
import { friendlyIssueMessage } from './validationCopy.js'

// Below lg the three panes stack and the rail becomes a horizontal strip where
// drag-along-y would fight the layout, so reordering there falls back to the
// inspector's ↑/↓ buttons.
const DESKTOP_MIN_WIDTH = 1024
const thumbnailBars = ['bg-red-400', 'bg-blue-400', 'bg-yellow-400', 'bg-green-400']

const QuestionThumbnail = ({ number, answerCount }) => (
  <span
    aria-hidden
    className="relative flex h-12 w-14 shrink-0 flex-col justify-end gap-0.5 overflow-hidden rounded border border-gray-200 bg-gray-50 p-1"
  >
    <span className="absolute left-1 top-1 flex h-6 min-w-6 items-center justify-center rounded bg-white px-1 text-sm font-black text-gray-600 shadow-sm">
      {number}
    </span>
    <span className="mb-3 h-1.5 w-8 self-center rounded bg-gray-200" />
    <span className="grid grid-cols-2 gap-0.5">
      {thumbnailBars.map((bar, index) => (
        <span
          key={bar}
          className={clsx('h-1 rounded-sm', index < answerCount ? bar : 'bg-gray-200')}
        />
      ))}
    </span>
  </span>
)

// Left pane: the question list on its own card surface — a draggable vertical
// rail on desktop, a horizontal strip on mobile. The list (and the "+ Add"
// affordance below the last item) scrolls internally while the header stays
// pinned. The active question is highlighted and each row shows a calm status
// marker; destructive actions live in the row menu.
export const QuestionRail = ({
  draft,
  update,
  updateText,
  issues,
  activeQuestion,
  setActiveQuestion,
  showErrors,
}) => {
  const { width } = useScreenSize()
  const canDrag = width >= DESKTOP_MIN_WIDTH
  // Index awaiting delete confirmation (only questions that already have content
  // prompt; empty ones delete immediately). null = no pending confirm.
  const [confirmDelete, setConfirmDelete] = useState(null)

  const handleAdd = () => {
    update(addQuestion)
    setActiveQuestion(draft.questions.length)
  }

  const handleReorder = (ids) => {
    const activeId = draft.questions[activeQuestion]?._id
    // A whole drag gesture folds into one undo step via the shared tag.
    updateText('reorder:questions', reorderQuestionsByIds, ids)

    const next = ids.indexOf(activeId)
    if (next !== -1) {
      setActiveQuestion(next)
    }
  }

  const deleteAt = (index) => {
    update(removeQuestion, index)
    // Keep the selection pointing at a sensible neighbour after removal.
    setActiveQuestion((current) => {
      if (index === current) {
        return Math.max(0, index - 1)
      }

      return index < current ? current - 1 : current
    })
    setConfirmDelete(null)
  }

  const requestDelete = (index) => {
    const question = draft.questions[index]
    const hasContent =
      question.question.trim().length > 0 || question.answers.some((answer) => answer.trim().length > 0)

    if (hasContent) {
      setConfirmDelete(index)
    } else {
      deleteAt(index)
    }
  }

  const atMax = draft.questions.length >= QUIZ_LIMITS.maxQuestions
  const canDelete = draft.questions.length > 1

  const itemClass = (isActive) =>
    clsx(
      'flex w-full shrink-0 items-start gap-2 rounded-md border p-2 text-left transition-colors lg:shrink',
      isActive
        ? 'border-primary bg-primary/10 shadow-sm'
        : 'border-gray-100 bg-white text-gray-600 hover:border-gray-200 hover:bg-gray-50',
    )

  const itemInner = (question, index) => {
    const isActive = index === activeQuestion
    const questionIssues = issues.filter((issue) => issue.questionIndex === index)
    const hasIssue = questionIssues.length > 0
    const type = questionTypeOf(question)
    const statusTone = hasIssue ? (showErrors ? 'error' : 'warning') : 'complete'
    const statusLabel = hasIssue ? friendlyIssueMessage(questionIssues[0]) : 'Complete'
    const StatusIcon = hasIssue ? AlertTriangleIcon : CheckCircleIcon
    const statusClasses = {
      complete: 'text-green-600',
      warning: 'text-amber-500',
      error: 'text-red-500',
    }
    const metaText =
      hasIssue && isActive
        ? `${TYPE_META[type]?.short ?? type} · ${statusLabel}`
        : TYPE_META[type]?.short ?? type

    return (
      <>
        <QuestionThumbnail number={index + 1} answerCount={Math.min(question.answers.length, 4)} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-black text-gray-900">
            {question.question.trim() || 'Untitled question'}
          </span>
          <span className="mt-1 block truncate text-[11px] font-bold text-gray-400">
            {metaText}
          </span>
        </span>
        <StatusIcon
          className={clsx('mt-0.5 h-4 w-4 shrink-0', statusClasses[statusTone])}
          title={statusLabel}
        />
        <Menu
          align="left"
          menuLabel={`Question ${index + 1} actions`}
          items={[
            {
              label: 'Duplicate question',
              icon: <CopyIcon />,
              disabled: atMax,
              onSelect: () => {
                update(duplicateQuestion, index)
                setActiveQuestion(index + 1)
              },
            },
            { separator: true },
            {
              label: 'Delete question',
              icon: <TrashIcon />,
              danger: true,
              disabled: !canDelete,
              onSelect: () => requestDelete(index),
            },
          ]}
          renderTrigger={({ triggerProps }) => (
            <button
              {...triggerProps}
              type="button"
              title={`Question ${index + 1} actions`}
              aria-label={`Question ${index + 1} actions`}
              className="shrink-0 rounded p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                triggerProps.onClick?.(event)
              }}
            >
              <DotsVerticalIcon />
            </button>
          )}
        />
        <button
          type="button"
          title={`Edit question ${index + 1}`}
          aria-label={`Edit question ${index + 1}`}
          className="shrink-0 rounded p-1 text-gray-400 transition hover:bg-primary/10 hover:text-primary"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            setActiveQuestion(index)
          }}
        >
          <PencilIcon className="h-4 w-4" />
        </button>
      </>
    )
  }

  const selectOnKey = (index) => (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setActiveQuestion(index)
    }
  }

  return (
    <Card className="flex shrink-0 flex-col gap-2 border border-gray-100 p-3 lg:h-full lg:min-h-0 lg:rounded-none lg:border-y-0 lg:border-l-0 lg:border-r-gray-200 lg:shadow-none">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h2 className="text-sm font-black text-gray-800">Questions</h2>
        <span className="text-xs font-semibold text-gray-400">
          {draft.questions.length}/{QUIZ_LIMITS.maxQuestions}
        </span>
      </div>

      {/* px-1/py-1 gives the active row's 2px outline room so the scroll
          container doesn't clip it on the edges. */}
      <div className="min-h-0 flex-1 px-1 py-1 lg:overflow-y-auto">
        {canDrag ? (
          <Reorder.Group
            axis="y"
            values={draft.questions.map((question) => question._id)}
            onReorder={handleReorder}
            className="flex flex-col gap-1.5"
          >
            {draft.questions.map((question, index) => (
              <Reorder.Item
                key={question._id}
                value={question._id}
                role="button"
                tabIndex={0}
                aria-current={index === activeQuestion}
                title="Drag to reorder"
                className={clsx(
                  itemClass(index === activeQuestion),
                  'cursor-grab active:cursor-grabbing',
                )}
                onClick={() => setActiveQuestion(index)}
                onKeyDown={selectOnKey(index)}
              >
                {itemInner(question, index)}
              </Reorder.Item>
            ))}
          </Reorder.Group>
        ) : (
          <nav className="flex gap-2 overflow-x-auto pb-1">
            {draft.questions.map((question, index) => (
              <div
                key={question._id}
                role="button"
                tabIndex={0}
                aria-current={index === activeQuestion}
                onClick={() => setActiveQuestion(index)}
                onKeyDown={selectOnKey(index)}
                className={itemClass(index === activeQuestion)}
              >
                {itemInner(question, index)}
              </div>
            ))}
          </nav>
        )}

        {/* Sits directly below the last question and scrolls with the list. */}
        <button
          type="button"
          onClick={handleAdd}
          disabled={atMax}
          title={atMax ? `No more than ${QUIZ_LIMITS.maxQuestions} questions` : 'Add a question'}
          className="mt-2 inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-md border border-dashed border-gray-300 p-2 text-sm font-black text-gray-500 hover:border-primary hover:text-primary disabled:opacity-40"
        >
          <PlusIcon />
          Add question
        </button>
      </div>

      <ConfirmDialog
        open={confirmDelete !== null}
        title={confirmDelete === null ? '' : `Delete question ${confirmDelete + 1}?`}
        confirmLabel="Delete"
        cancelLabel="Keep editing"
        danger
        onConfirm={() => deleteAt(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      >
        {confirmDelete !== null && (
          <>
            “{draft.questions[confirmDelete]?.question.trim() || 'Untitled question'}” and its
            answers will be removed.
          </>
        )}
      </ConfirmDialog>
    </Card>
  )
}
