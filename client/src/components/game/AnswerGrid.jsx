import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { answerColourClasses } from '../../tokens/index.js'
import { ANSWER_ICONS } from './answerIcons.js'
import { AnswerButton } from './AnswerButton.jsx'
import { CheckCircleIcon, PencilIcon } from '../icons/ui.jsx'

// The compact layout retains the established two-column answer board. The
// preview stage can opt into balanced desktop templates for two through six
// answers while narrow frames continue to use the compact layout.
// `dimmedKeys` fades tiles (wrong answers on reveal), `selectedKeys` rings the
// player's current multi-selection, `badgeFor(key)` returns a position number
// for ordering questions (or null for no badge), and `correctKeys` adds the
// author-only correct-answer checkmark in the quiz editor preview.
export const AnswerGrid = ({
  answers,
  onAnswer,
  dimmedKeys = [],
  selectedKeys = [],
  correctKeys = [],
  invalidKeys = [],
  markable = false,
  badgeFor,
  onEditAnswer,
  onAnswerTextChange,
  onSelectCorrect,
  correctAnswerInvalid = false,
  layout = 'compact',
}) => {
  const answerItems = Array.isArray(answers) ? answers : []
  const answerCount = answerItems.length
  const isDense = answerCount >= 5
  const useStageLayout = layout === 'stage'
  const hasUnpairedLastAnswer = !useStageLayout && answerCount > 1 && answerCount % 2 === 1
  const stageGridClass =
    answerCount <= 1
      ? 'grid-cols-1'
      : answerCount === 2
        ? 'grid-cols-2'
        : answerCount === 3 || answerCount === 6
          ? 'grid-cols-3'
          : answerCount === 4
            ? 'grid-cols-2'
            : 'grid-cols-6'
  const [editingKey, setEditingKey] = useState(null)
  const [editingValue, setEditingValue] = useState('')
  const [initialEditingValue, setInitialEditingValue] = useState('')
  const inputRef = useRef(null)
  const cancelBlurRef = useRef(false)
  const canEditInline = Boolean(onAnswerTextChange)

  useEffect(() => {
    if (editingKey !== null) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editingKey])

  const startEditing = (key) => {
    if (!canEditInline) {
      onEditAnswer?.(key)
      return
    }

    const value = typeof answerItems[key] === 'string' ? answerItems[key] : ''

    setEditingKey(key)
    setEditingValue(value)
    setInitialEditingValue(value)
    cancelBlurRef.current = false
  }

  const finishEditing = (save) => {
    if (editingKey === null) return

    if (!save && editingValue !== initialEditingValue) {
      onAnswerTextChange(editingKey, initialEditingValue)
    }

    setEditingKey(null)
  }

  return (
    <div
      className={clsx(
        'mx-auto mb-3 grid w-full max-w-[112rem] gap-2 px-3 text-lg font-bold text-white sm:mb-4 sm:gap-3 sm:px-4 md:text-xl',
        useStageLayout ? stageGridClass : answerCount <= 1 ? 'grid-cols-1' : 'grid-cols-2',
        hasUnpairedLastAnswer && '[&>:last-child]:col-span-2',
      )}
    >
      {answerItems.map((answer, key) => {
        const isCorrect = correctKeys.includes(key)
        const canSelectCorrect = Boolean(onSelectCorrect)
        const isEditing = editingKey === key
        const displayAnswer = typeof answer === 'string' && answer.trim()
          ? answer
          : `Answer ${key + 1}`

        return (
          <div
            key={key}
            className={clsx(
              'relative min-w-0',
              useStageLayout && answerCount === 5 && (key < 3 ? 'col-span-2' : 'col-span-3'),
            )}
          >
            <AnswerButton
              as={isEditing ? 'div' : 'button'}
              className={clsx(
                'w-full min-h-[5rem] sm:min-h-[5.5rem]',
                isDense && 'py-3 sm:py-4',
                canSelectCorrect && 'pr-16',
                answerColourClasses[key],
                {
                  'opacity-65': dimmedKeys.includes(key),
                  'group cursor-text focus-visible:outline-2 focus-visible:outline-white/90 motion-reduce:transition-none': canEditInline && !isEditing,
                },
              )}
              icon={ANSWER_ICONS[key]}
              selected={selectedKeys.includes(key)}
              correct={isCorrect}
              invalid={invalidKeys.includes(key)}
              showCorrectBadge={!canSelectCorrect}
              showCorrectState={!canSelectCorrect}
              markable={markable}
              badge={badgeFor ? badgeFor(key) : null}
              contentClassName={isEditing ? 'flex min-w-0 flex-1' : undefined}
              onClick={
                isEditing
                  ? undefined
                  : (event) => {
                      event.stopPropagation()
                      if (canEditInline || onEditAnswer) {
                        startEditing(key)
                      } else {
                        onAnswer?.(key)
                      }
                    }
              }
            >
              {isEditing ? (
                <input
                  ref={inputRef}
                  value={editingValue}
                  aria-label={`Edit answer ${key + 1}`}
                  className="w-full min-w-0 bg-transparent text-inherit outline-none placeholder:text-white/70"
                  placeholder={`Answer ${key + 1}`}
                  onChange={(event) => {
                    const value = event.target.value
                    setEditingValue(value)
                    onAnswerTextChange(key, value)
                  }}
                  onClick={(event) => event.stopPropagation()}
                  onBlur={() => {
                    const shouldSave = !cancelBlurRef.current
                    cancelBlurRef.current = false
                    finishEditing(shouldSave)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      finishEditing(true)
                    } else if (event.key === 'Escape') {
                      event.preventDefault()
                      cancelBlurRef.current = true
                      finishEditing(false)
                    }
                  }}
                />
              ) : (
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="min-w-0 break-words">{displayAnswer}</span>
                  {canEditInline && <PencilIcon className="h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-80 group-focus-visible:opacity-80 motion-reduce:transition-none" />}
                </span>
              )}
            </AnswerButton>
            {canSelectCorrect && (
              <button
                type="button"
                aria-label={`${isCorrect ? 'Unmark' : 'Mark'} answer ${key + 1} as correct`}
                aria-pressed={isCorrect}
                title={isCorrect ? 'Correct answer' : 'Mark as correct'}
                onClick={(event) => {
                  event.stopPropagation()
                  onSelectCorrect(key)
                }}
                className={clsx(
                  'absolute inset-y-0 right-0 flex w-14 items-center justify-center border-l border-white/45 transition-colors focus:outline-none focus-visible:bg-white/15 focus-visible:outline-2 focus-visible:outline-white motion-reduce:transition-none',
                  isCorrect
                    ? 'text-green-600 hover:bg-white/10'
                    : correctAnswerInvalid
                      ? 'bg-red-500/20 text-red-100 hover:bg-red-500/30'
                      : 'text-white/85 hover:bg-white/10',
                )}
              >
                {isCorrect ? (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/95">
                    <CheckCircleIcon className="h-7 w-7" />
                  </span>
                ) : (
                  <span aria-hidden className="h-6 w-6 rounded-full border-2 border-current" />
                )}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
