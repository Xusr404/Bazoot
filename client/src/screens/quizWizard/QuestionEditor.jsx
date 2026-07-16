import { QUESTION_TYPES, questionTypeOf } from '@bazoot/shared/questionTypes'
import { QUIZ_LIMITS } from '@bazoot/shared/quizValidation'
import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { ANSWER_ICONS } from '../../components/game/answerIcons.js'
import {
  ClockIcon,
  CheckCircleIcon,
  DotsVerticalIcon,
  ImageIcon,
  ListIcon,
  PlayIcon,
  PlusIcon,
  SlidersIcon,
  XIcon,
  XCircleIcon,
} from '../../components/icons/ui.jsx'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Card } from '../../components/ui/Card.jsx'
import { Field } from '../../components/ui/Field.jsx'
import { Input } from '../../components/ui/Input.jsx'
import { Menu } from '../../components/ui/Menu.jsx'
import { SegmentedControl } from '../../components/ui/SegmentedControl.jsx'
import { answerColourClasses } from '../../tokens/index.js'
import { listMedia, uploadMedia } from '../../utils/uploadMedia.js'
import { TYPE_META, TYPE_OPTIONS } from './questionTypeMeta.js'
import {
  addAnswer,
  applyTimingToAll,
  changeQuestionType,
  duplicateQuestion,
  moveAnswer,
  moveQuestion,
  patchQuestion,
  removeAnswer,
  removeQuestion,
  setAnswerText,
} from './quizDraft.js'
import { friendlyIssueMessage } from './validationCopy.js'

const iconButton =
  'rounded-md px-2 py-1 text-sm font-bold text-gray-600 outline outline-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:pointer-events-none'

const sectionClass = 'border-b border-gray-100 pb-3 last:border-b-0 last:pb-0'
const sectionTitleClass =
  'mb-2.5 flex items-center gap-1.5 text-sm font-black text-gray-800'

const TYPE_ICONS = {
  [QUESTION_TYPES.SINGLE]: CheckCircleIcon,
  [QUESTION_TYPES.TRUE_FALSE]: XCircleIcon,
  [QUESTION_TYPES.MULTI]: ListIcon,
  [QUESTION_TYPES.ORDER]: SlidersIcon,
}

const TYPE_PICKER_OPTIONS = TYPE_OPTIONS.map((option) => {
  const Icon = TYPE_ICONS[option.value] ?? ListIcon

  return {
    ...option,
    label: TYPE_META[option.value]?.label ?? option.label,
    description: TYPE_META[option.value]?.description ?? option.description,
    icon: <Icon className="h-4 w-4" />,
  }
})

const QuestionTypePicker = ({ type, onChange }) => {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-black tracking-wide text-gray-500 uppercase">Question type</span>
      <SegmentedControl
        ariaLabel="Question type"
        options={TYPE_PICKER_OPTIONS}
        value={type}
        onChange={onChange}
        variant="dropdown"
        layout="grid"
        optionMinWidth="8.5rem"
      />
    </div>
  )
}

const MEDIA_ACCEPT = {
  image: 'image/*',
  video: 'video/*',
  audio: 'audio/*',
}
const ALL_MEDIA_ACCEPT = Object.values(MEDIA_ACCEPT).join(',')

const MEDIA_TYPES = ['image', 'video', 'audio']

const mediaTypeForFile = (file) => MEDIA_TYPES.find((media) => file.type.startsWith(`${media}/`))

const mediaLabel = (media) => media[0].toUpperCase() + media.slice(1)

const sourceName = (url) => {
  try {
    return new URL(url, window.location.origin).pathname.split('/').pop() || url
  } catch {
    return url
  }
}

// A question has one primary media source. The picker writes it to the existing
// image/video/audio schema so the game protocol stays compatible, while avoiding
// three competing fields in the authoring experience.
export const MediaPicker = ({
  question,
  invalid,
  onChange,
  appearance = 'panel',
  className,
  style,
  previewAspectRatio,
  onPreviewAspectRatioChange,
}) => {
  const inputRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [sourceMode, setSourceMode] = useState('upload')
  const [libraryFilter, setLibraryFilter] = useState('all')
  const [selectedAsset, setSelectedAsset] = useState(null)
  const [status, setStatus] = useState('idle') // idle | uploading | error
  const [error, setError] = useState('')
  const [assets, setAssets] = useState([])
  const [assetsStatus, setAssetsStatus] = useState('idle')
  const [isDragging, setIsDragging] = useState(false)
  const activeMedia = MEDIA_TYPES.find((type) => question[type])
  const activeUrl = activeMedia ? question[activeMedia] : ''

  const reportPreviewAspectRatio = (width, height) => {
    if (appearance !== 'preview' || !onPreviewAspectRatioChange || width <= 0 || height <= 0) {
      return
    }

    onPreviewAspectRatioChange(width / height)
  }

  useEffect(() => {
    if (!open) {
      return undefined
    }

    setSourceMode('library')
    setLibraryFilter('all')
    setSelectedAsset(null)
    setError('')
    return undefined
  }, [open]) // The values are deliberately captured when the dialog opens.

  useEffect(() => {
    if (!open || sourceMode !== 'library') {
      return undefined
    }

    setAssetsStatus('loading')
    listMedia()
      .then((items) => {
        setAssets(items)
        setAssetsStatus('idle')
      })
      .catch(() => setAssetsStatus('error'))

    return undefined
  }, [open, sourceMode])

  useEffect(() => {
    if (appearance === 'preview' && activeMedia === 'audio') {
      onPreviewAspectRatioChange?.(4)
    }
  }, [activeMedia, appearance, onPreviewAspectRatioChange])

  const setSource = (type, value) => {
    onChange({ image: '', video: '', audio: '', [type]: value })
    setOpen(false)
  }

  const uploadFile = async (file) => {
    if (!file) {
      return
    }

    const type = mediaTypeForFile(file)

    if (!type) {
      setStatus('error')
      setError('Choose an image, video, or audio file.')

      return
    }

    setStatus('uploading')
    setError('')

    try {
      setSource(type, await uploadMedia(file))
      setStatus('idle')
    } catch (uploadError) {
      setStatus('error')
      setError(uploadError.message || 'Upload failed')
    }
  }

  const handleFile = (event) => {
    const file = event.target.files?.[0]
    event.target.value = '' // let the same file be re-picked after an error
    uploadFile(file)
  }

  const handleDrop = (event) => {
    event.preventDefault()
    setIsDragging(false)
    uploadFile(event.dataTransfer.files?.[0])
  }

  return (
    <>
      <div
        className={clsx(
          'overflow-hidden rounded-lg border bg-gray-50 transition',
          appearance === 'preview' && 'group relative w-full bg-white/95 shadow-lg',
          invalid ? 'border-red-400' : 'border-gray-200',
          isDragging && 'border-primary bg-primary/5 ring-2 ring-primary/30',
          className,
        )}
        style={style}
        onDragOver={(event) => {
          event.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <button
          type="button"
          className={clsx(
            'group relative flex w-full items-center justify-center overflow-hidden text-left focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
            previewAspectRatio ? 'h-full' : 'aspect-video',
          )}
          onClick={() => setOpen(true)}
          aria-label={activeUrl ? `Change ${activeMedia}` : 'Add media'}
        >
          {activeMedia === 'image' && (
            <img
              src={activeUrl}
              alt="Question media"
              className={clsx('h-full w-full', appearance === 'preview' ? 'bg-gray-950 object-contain' : 'object-cover')}
              onLoad={(event) => reportPreviewAspectRatio(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
            />
          )}
          {activeMedia === 'video' && (
            <video
              src={activeUrl}
              className={clsx('h-full w-full', appearance === 'preview' ? 'bg-gray-950 object-contain' : 'object-cover')}
              muted
              preload="metadata"
              onLoadedMetadata={(event) => reportPreviewAspectRatio(event.currentTarget.videoWidth, event.currentTarget.videoHeight)}
            />
          )}
          {activeMedia === 'audio' && (
            <span className="flex flex-col items-center gap-2 text-center text-gray-600">
              <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-black text-primary">Audio</span>
              <span className="max-w-56 truncate text-sm font-bold">{sourceName(activeUrl)}</span>
            </span>
          )}
          {!activeMedia && (
            <span className="flex flex-col items-center gap-2.5 text-center text-gray-500">
              <span className="flex items-end gap-1 text-gray-500" aria-hidden>
                <span className="flex h-8 w-8 -rotate-12 items-center justify-center rounded-md border-2 border-current"><ImageIcon className="h-4 w-4" /></span>
                <span className="flex h-8 w-8 rotate-6 items-center justify-center rounded-md border-2 border-current"><PlayIcon className="h-4 w-4" /></span>
                <span className="flex h-8 w-8 rotate-12 items-center justify-center rounded-md border-2 border-current text-lg font-black">♪</span>
              </span>
              <span className="flex h-11 w-11 items-center justify-center rounded-md bg-white text-3xl font-light text-gray-700 shadow-sm outline outline-gray-200">+</span>
              <span className="text-sm font-black text-gray-800">Search and add media</span>
              <span className="text-xs font-semibold">Upload a file or drop it here</span>
            </span>
          )}
          {activeMedia && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-sm font-black text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
              Change {mediaLabel(activeMedia)}
            </span>
          )}
        </button>
        {activeMedia && appearance === 'preview' && (
          <button
            type="button"
            className="absolute right-2 top-2 rounded bg-gray-950/65 px-2 py-1 text-xs font-black text-white opacity-0 transition hover:bg-red-700 group-hover:opacity-100 focus:opacity-100"
            onClick={() => onChange({ image: '', video: '', audio: '' })}
          >
            Remove
          </button>
        )}
        {activeMedia && appearance !== 'preview' && (
          <div className="flex items-center justify-between border-t border-gray-200 bg-white px-2 py-1.5">
            <span className="truncate text-xs font-bold text-gray-500">{mediaLabel(activeMedia)}</span>
            <button type="button" className="text-xs font-black text-red-600 hover:text-red-700" onClick={() => onChange({ image: '', video: '', audio: '' })}>
              Remove
            </button>
          </div>
        )}
      </div>
      {error && !open && <span role="alert" className="text-sm font-semibold text-red-600">{error}</span>}

      {open && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)} role="presentation">
          <Card role="dialog" aria-modal="true" aria-label="Add media" className="anim-show flex max-h-[min(44rem,calc(100dvh-2rem))] w-full max-w-3xl flex-col gap-4 p-5 sm:p-6" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                {sourceMode !== 'library' && (
                  <button type="button" className="mb-2 text-sm font-black text-primary hover:underline" onClick={() => { setSourceMode('library'); setError('') }}>
                    ← Media library
                  </button>
                )}
                <h2 className="text-xl font-black text-gray-900">
                  {sourceMode === 'library' ? 'Media library' : 'Upload a file'}
                </h2>
                <p className="mt-1 text-sm font-semibold text-gray-500">
                  {sourceMode === 'library'
                    ? 'Choose media you have already uploaded.'
                    : 'Upload an image, video, or audio file from your device.'}
                </p>
              </div>
              {sourceMode === 'library' && (
                <div className="flex shrink-0 gap-2">
                  <Button type="button" className="text-sm" onClick={() => setSourceMode('upload')}>Upload file</Button>
                </div>
              )}
            </div>

            {sourceMode === 'upload' && (
              <>
                <button type="button" className="rounded-md border-2 border-dashed border-gray-300 px-4 py-14 text-center hover:border-primary hover:bg-primary/5 disabled:opacity-60" onClick={() => inputRef.current?.click()} disabled={status === 'uploading'}>
                  <span className="block text-sm font-black text-gray-800">{status === 'uploading' ? 'Uploading…' : 'Choose a file to upload'}</span>
                  <span className="mt-1 block text-xs font-semibold text-gray-500">Images, videos, and audio · or drop a file onto the preview</span>
                </button>
                <input ref={inputRef} type="file" accept={ALL_MEDIA_ACCEPT} className="hidden" onChange={handleFile} />
              </>
            )}

            {sourceMode === 'library' && (
              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-black text-gray-800">Your uploads</p>
                  <div className="flex gap-1" aria-label="Filter media library">
                    {['all', ...MEDIA_TYPES].map((type) => (
                      <button key={type} type="button" onClick={() => { setLibraryFilter(type); setSelectedAsset(null) }} className={clsx('rounded px-1.5 py-1 text-xs font-black', libraryFilter === type ? 'bg-primary/10 text-primary' : 'text-gray-500 hover:bg-gray-100')}>
                        {type === 'all' ? 'All' : mediaLabel(type)}
                      </button>
                    ))}
                  </div>
                </div>
                {assets.length > 0 ? (
                  <div className="grid max-h-96 grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
                  {assets.filter((asset) => libraryFilter === 'all' || asset.type === libraryFilter).map((asset) => (
                    <button key={asset.url} type="button" className={clsx('overflow-hidden rounded-md border text-left transition', selectedAsset?.url === asset.url ? 'border-primary ring-2 ring-primary/30' : 'border-gray-200 hover:border-primary')} onClick={() => setSelectedAsset(asset)} aria-pressed={selectedAsset?.url === asset.url}>
                      {asset.type === 'image' ? <img src={asset.url} alt="" className="aspect-video w-full object-cover" /> : <span className="flex aspect-video items-center justify-center bg-gray-50 text-xs font-black text-gray-600">{mediaLabel(asset.type)}</span>}
                      <span className="block truncate px-1.5 py-1 text-xs font-bold text-gray-500">{asset.name}</span>
                    </button>
                  ))}
                  </div>
                ) : <p className="rounded-md bg-gray-50 px-3 py-5 text-center text-sm font-semibold text-gray-500">No uploaded media yet.</p>}
              </div>
            )}

            {assetsStatus === 'loading' && <span className="text-xs font-semibold text-gray-400">Loading recent uploads…</span>}
            {error && <span role="alert" className="text-sm font-semibold text-red-600">{error}</span>}
            <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
              <Button type="button" variant="secondary" className="text-sm" onClick={() => setOpen(false)}>Cancel</Button>
              {sourceMode === 'library' && (
                <Button type="button" className="text-sm" disabled={!selectedAsset} onClick={() => setSource(selectedAsset.type, selectedAsset.url)}>
                  Use selected media
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}
    </>
  )
}

// Editor for one question: type, text, answers + correct answer(s), timing,
// and (collapsed) optional media. All mutations go through quizDraft helpers.
export const QuestionEditor = ({
  draft,
  update,
  updateText,
  issues,
  index,
  setActiveQuestion,
  showErrors,
}) => {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const question = draft.questions[index]
  const type = questionTypeOf(question)
  const isTrueFalse = type === QUESTION_TYPES.TRUE_FALSE
  const isOrder = type === QUESTION_TYPES.ORDER

  const issueFor = (field) =>
    issues.find((issue) => issue.questionIndex === index && issue.field === field) ?? null

  const errorFor = (field) => {
    const issue = issueFor(field)

    return issue ? friendlyIssueMessage(issue) : null
  }

  const answerIssueAt = (answerIndex) =>
    issues.find(
      (issue) =>
        issue.questionIndex === index &&
        issue.field === 'answer' &&
        issue.answerIndex === answerIndex,
    ) ?? null

  const answerErrorAt = (answerIndex) => {
    const issue = answerIssueAt(answerIndex)

    return issue ? friendlyIssueMessage(issue) : null
  }

  const answersError = errorFor('answers') ?? errorFor('solution')
  const firstAnswerError = question.answers
    .map((_, ai) => answerErrorAt(ai))
    .find(Boolean)

  const hasContent =
    question.question.trim().length > 0 ||
    question.answers.some((answer, ai) => answer.trim().length > 0 && !(isTrueFalse && ai < 2))

  const handleDelete = () => {
    update(removeQuestion, index)
    setActiveQuestion(Math.max(0, index - 1))
    setConfirmDelete(false)
  }

  const editorMenuItems = [
    {
      label: 'Move up',
      disabled: index === 0,
      onSelect: () => {
        update(moveQuestion, index, -1)
        setActiveQuestion(index - 1)
      },
    },
    {
      label: 'Move down',
      disabled: index === draft.questions.length - 1,
      onSelect: () => {
        update(moveQuestion, index, 1)
        setActiveQuestion(index + 1)
      },
    },
    {
      label: 'Duplicate',
      disabled: draft.questions.length >= QUIZ_LIMITS.maxQuestions,
      onSelect: () => {
        update(duplicateQuestion, index)
        setActiveQuestion(index + 1)
      },
    },
    { separator: true },
    {
      label: 'Delete',
      danger: true,
      disabled: draft.questions.length <= 1,
      onSelect: () => (hasContent ? setConfirmDelete(true) : handleDelete()),
    },
  ]

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <h3 className="text-lg font-black text-gray-950 sm:text-xl">
          Question {index + 1}
          <span className="ml-1 text-sm font-semibold text-gray-400">of {draft.questions.length}</span>
        </h3>
        <Menu
          menuLabel={`Question ${index + 1} actions`}
          items={editorMenuItems}
          renderTrigger={({ triggerProps }) => (
            <button type="button" className={iconButton} title="Question actions" {...triggerProps}>
              <DotsVerticalIcon />
            </button>
          )}
        />
      </div>

      <section className={sectionClass}>
        <h4 className={sectionTitleClass}>
          <ListIcon className="h-3.5 w-3.5" />
          1. Question
        </h4>
        <div className="flex flex-col gap-2.5">
          <QuestionTypePicker
            type={type}
            onChange={(value) => update(changeQuestionType, index, value)}
          />

          <Field
            label="Question"
            required
            error={errorFor('text')}
            counter={`${question.question.length}/${QUIZ_LIMITS.questionTextMax}`}
          >
            <Input
              value={question.question}
              invalid={Boolean(errorFor('text'))}
              maxLength={QUIZ_LIMITS.questionTextMax}
              onChange={(e) =>
                updateText(`q${index}:question`, patchQuestion, index, { question: e.target.value })
              }
              data-focus="question"
              placeholder="Type your question…"
            />
          </Field>
        </div>
      </section>

      <section className={clsx(sectionClass, answersError && 'rounded-md border border-red-300 bg-red-50/30 p-2')}>
        <h4 className={sectionTitleClass}>
          <ListIcon className="h-3.5 w-3.5" />
          2. Answers
        </h4>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-gray-500">Edit answers here or directly in the preview.</span>

        {question.answers.map((answer, ai) => {
          const Icon = ANSWER_ICONS[ai]
          const rowError = answerErrorAt(ai)

          return (
            <div key={ai} className="flex items-center gap-2">
              <span
                aria-hidden
                className={clsx(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
                  answerColourClasses[ai],
                )}
              >
                <Icon className="h-4" />
              </span>
              <Input
                className="min-w-0 flex-1"
                value={answer}
                disabled={isTrueFalse}
                invalid={Boolean(rowError)}
                maxLength={QUIZ_LIMITS.answerTextMax}
                onChange={(event) => updateText(`q${index}:a${ai}`, setAnswerText, index, ai, event.target.value)}
                data-focus={`answer-${ai}`}
                placeholder={`Answer ${ai + 1}`}
              />
              {isOrder && (
                <>
                  <button
                    type="button"
                    className={iconButton}
                    title="Move up"
                    onClick={() => update(moveAnswer, index, ai, -1)}
                    disabled={ai === 0}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={iconButton}
                    title="Move down"
                    onClick={() => update(moveAnswer, index, ai, 1)}
                    disabled={ai === question.answers.length - 1}
                  >
                    ↓
                  </button>
                </>
              )}

              {!isTrueFalse && (
                <button
                  type="button"
                  className={clsx(iconButton, 'text-red-500')}
                  title="Remove answer"
                  onClick={() => update(removeAnswer, index, ai)}
                  disabled={question.answers.length <= QUIZ_LIMITS.minAnswers}
                  aria-label={`Remove answer ${ai + 1}`}
                >
                  <XIcon />
                </button>
              )}
            </div>
          )
        })}

        {(answersError || firstAnswerError) && (
          <span role="alert" className="text-sm font-semibold text-red-600">
            {answersError ?? firstAnswerError}
          </span>
        )}

        {!isTrueFalse && question.answers.length < QUIZ_LIMITS.maxAnswers && (
          <button
            type="button"
            className={clsx(iconButton, 'inline-flex items-center gap-1.5 self-start')}
            onClick={() => update(addAnswer, index)}
          >
            <PlusIcon />
            Add answer
          </button>
        )}
        </div>
      </section>

      <section className={sectionClass}>
        <div className="flex items-center gap-2 text-sm font-black text-gray-800">
          <SlidersIcon className="h-4 w-4 shrink-0 text-gray-400" />
          <span>3. Settings</span>
          <span className="hidden truncate text-xs font-semibold text-gray-400 sm:inline">
            <ClockIcon className="mr-1 inline h-3.5 w-3.5" />
            {question.cooldown}s reading · {question.time}s answer
          </span>
        </div>
        <div className="mt-3 flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Reading time"
                hint="Seconds the question is shown before answering opens."
                error={errorFor('cooldown')}
              >
                <Input
                  type="number"
                  min={QUIZ_LIMITS.cooldownRange[0]}
                  max={QUIZ_LIMITS.cooldownRange[1]}
                  value={question.cooldown}
                  invalid={Boolean(errorFor('cooldown'))}
                  data-focus="cooldown"
                  onChange={(e) =>
                    updateText(`q${index}:cooldown`, patchQuestion, index, {
                      cooldown: Number(e.target.value),
                    })
                  }
                />
              </Field>

              <Field
                label="Answer time"
                hint="Seconds players have to answer. Faster answers score more."
                error={errorFor('time')}
              >
                <Input
                  type="number"
                  min={QUIZ_LIMITS.timeRange[0]}
                  max={QUIZ_LIMITS.timeRange[1]}
                  value={question.time}
                  invalid={Boolean(errorFor('time'))}
                  data-focus="time"
                  onChange={(e) =>
                    updateText(`q${index}:time`, patchQuestion, index, { time: Number(e.target.value) })
                  }
                />
              </Field>
            </div>

            {draft.questions.length > 1 && (
              <button
                type="button"
                className={clsx(iconButton, 'self-start text-gray-600')}
                onClick={() => update(applyTimingToAll, question.cooldown, question.time)}
                title="Set every question's reading and answer time to match this one"
              >
                Apply timing to all {draft.questions.length} questions
              </button>
            )}
        </div>
      </section>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete question ${index + 1}?`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      >
        “{question.question.trim() || 'Untitled question'}” and its answers will be removed.
      </ConfirmDialog>
    </div>
  )
}
