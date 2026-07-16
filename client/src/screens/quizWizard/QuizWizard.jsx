import { QUIZ_LIMITS } from '@bazoot/shared/quizValidation'
import { QUESTION_TYPES } from '@bazoot/shared/questionTypes'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeftIcon,
  DotsVerticalIcon,
  EyeIcon,
  PencilIcon,
  PlusIcon,
  PlayIcon,
  SaveIcon,
  XCircleIcon,
} from '../../components/icons/ui.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Card } from '../../components/ui/Card.jsx'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.jsx'
import { Input } from '../../components/ui/Input.jsx'
import { Menu } from '../../components/ui/Menu.jsx'
import { DemoRunOverlay } from '../../demo/DemoRunOverlay.jsx'
import { useHistoryState } from '../../hooks/useHistoryState.js'
import { EditorPreview } from './EditorPreview.jsx'
import { QuestionEditor } from './QuestionEditor.jsx'
import { QuestionRail } from './QuestionRail.jsx'
import { friendlyIssueMessage } from './validationCopy.js'
import {
  clearStoredDraft,
  addQuestion,
  createDraft,
  draftIssues,
  draftStats,
  draftStorageKey,
  formatDuration,
  loadStoredDraft,
  normalizeForSave,
  patchQuestion,
  setSubject,
  storeDraft,
  toggleMultiSolution,
} from './quizDraft.js'

const issueLabel = (issue) =>
  issue.questionIndex === undefined
    ? friendlyIssueMessage(issue)
    : `Question ${issue.questionIndex + 1}: ${friendlyIssueMessage(issue)}`

const toolbarBtn =
  'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-bold text-gray-500 outline outline-gray-200 hover:bg-gray-100 disabled:pointer-events-none disabled:opacity-40'

const actionButtonClass = 'inline-flex items-center gap-1.5 px-4 py-1.5 text-sm'

const mobileTabs = [
  { id: 'preview', label: 'Preview' },
  { id: 'questions', label: 'Questions' },
  { id: 'edit', label: 'Edit' },
]

const MobileQuestionNavigator = ({
  count,
  activeQuestion,
  setActiveQuestion,
  add,
}) => {
  const atMax = count >= QUIZ_LIMITS.maxQuestions

  return (
    <Card className="flex items-center gap-2 border border-gray-100 p-2.5 lg:hidden">
      <button
        type="button"
        className={toolbarBtn}
        onClick={() => setActiveQuestion(Math.max(0, activeQuestion - 1))}
        disabled={activeQuestion === 0}
        aria-label="Previous question"
      >
        <ArrowLeftIcon />
      </button>
      <div className="min-w-0 flex-1 text-center">
        <p className="truncate text-sm font-black text-gray-950">
          Question {activeQuestion + 1} of {count}
        </p>
        <p className="text-xs font-semibold text-gray-400">
          {count}/{QUIZ_LIMITS.maxQuestions}
        </p>
      </div>
      <button
        type="button"
        className={toolbarBtn}
        onClick={() => setActiveQuestion(Math.min(count - 1, activeQuestion + 1))}
        disabled={activeQuestion >= count - 1}
        aria-label="Next question"
      >
        <ArrowLeftIcon className="rotate-180" />
      </button>
      <button
        type="button"
        className={toolbarBtn}
        onClick={add}
        disabled={atMax}
        title={atMax ? `No more than ${QUIZ_LIMITS.maxQuestions} questions` : 'Add a question'}
        aria-label="Add question"
      >
        <PlusIcon />
      </button>
    </Card>
  )
}

const focusableSelectorForIssue = (issue) => {
  if (issue.field === 'answer') {
    return `[data-focus="answer-${issue.answerIndex ?? 0}"]`
  }

  if (issue.field === 'solution') {
    return '[data-focus^="answer-"]'
  }

  if (issue.field === 'text') {
    return '[data-focus="question"]'
  }

  if (['cooldown', 'time', 'media'].includes(issue.field)) {
    return `[data-focus="${issue.field}"]`
  }

  return '[data-focus="question"]'
}

const issuesByQuestion = (issues) => {
  const groups = []

  for (const issue of issues) {
    const key = issue.questionIndex ?? 'quiz'
    let group = groups.find((item) => item.key === key)

    if (!group) {
      group = {
        key,
        title:
          issue.questionIndex === undefined
            ? 'Quiz details'
            : `Question ${issue.questionIndex + 1}`,
        issues: [],
      }
      groups.push(group)
    }

    group.issues.push(issue)
  }

  return groups
}

const ValidationSummaryModal = ({ open, issues, onJump, onCancel }) => {
  if (!open) {
    return null
  }

  const groups = issuesByQuestion(issues)

  return (
    <div
      className="fixed inset-0 z-[215] flex items-center justify-center bg-gray-950/55 p-4"
      role="presentation"
      onClick={onCancel}
    >
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby="host-validation-title"
        className="anim-show flex max-h-[82vh] w-full max-w-xl flex-col overflow-hidden border border-gray-100 p-0 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 id="host-validation-title" className="text-lg font-black text-gray-950">
            Before you can host this quiz
          </h2>
          <p className="mt-1 text-sm font-semibold text-gray-500">
            Fix these items, then try Save & host again.
          </p>
        </div>

        <div className="min-h-0 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-3">
            {groups.map((group) => (
              <section key={group.key} className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <h3 className="text-sm font-black text-gray-800">{group.title}</h3>
                <ul className="mt-2 flex flex-col gap-1">
                  {group.issues.map((issue, index) => (
                    <li key={`${issue.field}-${issue.answerIndex ?? 'x'}-${index}`}>
                      <button
                        type="button"
                        className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm font-semibold text-gray-600 hover:bg-white"
                        onClick={() => onJump(issue)}
                      >
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                        <span>{issueLabel(issue).replace(`${group.title}: `, '')}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>

        <div className="flex gap-3 border-t border-gray-100 px-5 py-4">
          <Button className="px-4 py-2 text-sm" onClick={() => onJump(issues[0])}>
            Go to first issue
          </Button>
          <Button variant="secondary" className="px-4 py-2 text-sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </Card>
    </div>
  )
}

// Single-screen quiz editor: a fixed-height app-shell (header · canvas · footer)
// so the page itself never scrolls — only the long inspector pane does. The
// canvas holds the question rail (left), a live card preview (center) and the
// contextual inspector (right). Draft state + undo history live here;
// quizDraft.js holds all the pure logic and an autosaved copy in localStorage
// survives an accidental tab close. Saving is delegated to ManagerPage via onSave.
export const QuizWizard = ({
  initialQuizz,
  saving = false,
  errorMessage,
  onChange,
  onSave,
  onCancel,
}) => {
  const storageKey = draftStorageKey(initialQuizz?.id)
  const initialDraft = useMemo(() => createDraft(initialQuizz), [initialQuizz])

  const { state: draft, set, undo, redo, reset, canUndo, canRedo } = useHistoryState(initialDraft)
  const [activeQuestion, setActiveQuestion] = useState(0)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [saveAndClose, setSaveAndClose] = useState(false)
  const [demoOpen, setDemoOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [validationOpen, setValidationOpen] = useState(false)
  const [mobileTab, setMobileTab] = useState('edit')
  const [titleEditing, setTitleEditing] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  // localStorage autosave lifecycle, surfaced in the toolbar: idle | saving | saved.
  const [saveStatus, setSaveStatus] = useState('idle')
  const saveAndCloseStarted = useRef(false)
  const inspectorRef = useRef(null)
  const titleInputRef = useRef(null)
  // Required fields are validated continuously. Drafts can still be saved at
  // any point, but incomplete work is always clearly marked in the editor.
  const [showErrors, setShowErrors] = useState(true)

  // Offer to restore an autosaved draft exactly once, at mount.
  const [storedOffer, setStoredOffer] = useState(() => {
    const stored = loadStoredDraft(storageKey)

    if (!stored) {
      return null
    }

    // Compare on saved shape so transient fields (e.g. ids) never force the prompt.
    return JSON.stringify(normalizeForSave(stored)) !==
      JSON.stringify(normalizeForSave(initialDraft))
      ? stored
      : null
  })

  const issues = useMemo(() => draftIssues(draft), [draft])
  const stats = useMemo(() => draftStats(draft), [draft])
  const isDirty = useMemo(
    () => JSON.stringify(normalizeForSave(draft)) !== JSON.stringify(normalizeForSave(initialDraft)),
    [draft, initialDraft],
  )
  const ready = issues.length === 0
  const subjectIssue = issues.find((issue) => issue.field === 'subject')

  // Debounced autosave of dirty drafts; clean drafts clear the stored copy.
  const autosaveTimer = useRef(null)
  useEffect(() => {
    clearTimeout(autosaveTimer.current)

    if (isDirty) {
      setSaveStatus('saving')
    }

    autosaveTimer.current = setTimeout(() => {
      if (isDirty) {
        storeDraft(storageKey, draft)
        setSaveStatus('saved')
      } else {
        clearStoredDraft(storageKey)
        setSaveStatus('idle')
      }
    }, 400)

    return () => clearTimeout(autosaveTimer.current)
  }, [draft, isDirty, storageKey])

  // Editor-wide undo/redo shortcuts. Global on purpose (matches design tools):
  // Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z or Ctrl+Y redoes.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) {
        return
      }

      const key = event.key.toLowerCase()

      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        undo()
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault()
        redo()
      }
    }

    window.addEventListener('keydown', onKeyDown)

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo])

  const update = useCallback((mutate, ...args) => set((current) => mutate(current, ...args)), [set])
  // Coalescing variant: rapid same-`tag` edits (typing in a field, a single
  // drag gesture) fold into one undo step instead of dozens.
  const updateText = useCallback(
    (tag, mutate, ...args) => set((current) => mutate(current, ...args), { tag }),
    [set],
  )

  const startTitleEdit = useCallback(() => {
    setTitleDraft(draft.subject)
    setTitleEditing(true)

    window.setTimeout(() => {
      titleInputRef.current?.focus()
      titleInputRef.current?.select?.()
    }, 0)
  }, [draft.subject])

  const commitTitleEdit = useCallback(() => {
    updateText('subject', setSubject, titleDraft)
    onChange?.()
    setTitleEditing(false)
  }, [onChange, titleDraft, updateText])

  const cancelTitleEdit = useCallback(() => {
    setTitleDraft(draft.subject)
    setTitleEditing(false)
  }, [draft.subject])

  const handleAddQuestion = () => {
    update(addQuestion)
    setActiveQuestion(draft.questions.length)
  }

  // Click a preview element → focus (and select) its field in the inspector pane.
  const handleFocusField = useCallback((target, key) => {
    const selector =
      target === 'answer' ? `[data-focus="answer-${key}"]` : `[data-focus="${target}"]`
    const el = inspectorRef.current?.querySelector(selector)

    if (el) {
      el.focus()
      el.select?.()
    }
  }, [])

  const jumpToIssue = (issue) => {
    setShowErrors(true)
    setValidationOpen(false)
    setMobileTab('edit')

    if (issue?.questionIndex !== undefined) {
      setActiveQuestion(issue.questionIndex)
    }

    window.setTimeout(() => {
      if (issue?.field === 'subject') {
        startTitleEdit()

        return
      }

      const target = inspectorRef.current?.querySelector(focusableSelectorForIssue(issue))

      target?.focus()
      target?.select?.()
    }, 0)
  }

  const handleCancel = () => {
    if (isDirty) {
      setConfirmCancel(true)

      return
    }

    clearStoredDraft(storageKey)
    onCancel()
  }

  const handleSave = (host) => {
    if (saving) {
      return
    }

    if (host && issues.length > 0) {
      setShowErrors(true)
      setValidationOpen(true)

      return
    }

    onSave(normalizeForSave(draft), { host })
  }

  const handleSaveAndClose = () => {
    if (saving) {
      return
    }

    saveAndCloseStarted.current = false
    setSaveAndClose(true)
    onSave(normalizeForSave(draft), { host: false })
  }

  useEffect(() => {
    if (!saveAndClose) {
      return
    }

    if (saving) {
      saveAndCloseStarted.current = true

      return
    }

    if (!saveAndCloseStarted.current) {
      return
    }

    if (errorMessage) {
      setSaveAndClose(false)

      return
    }

    clearStoredDraft(storageKey)
    onCancel()
  }, [errorMessage, onCancel, saveAndClose, saving, storageKey])

  const activeIndex = Math.min(activeQuestion, draft.questions.length - 1)
  const activeMediaInvalid =
    showErrors && issues.some((issue) => issue.questionIndex === activeIndex && issue.field === 'media')

  // The live player preview is also the media drop zone. Keep its mutations on
  // the same history/autosave path as inspector edits.
  const handlePreviewMediaChange = useCallback(
    (patch) => updateText(`q${activeIndex}:media`, patchQuestion, activeIndex, patch),
    [activeIndex, updateText],
  )

  const handlePreviewCorrectAnswer = useCallback(
    (answerIndex, type) => {
      if (type === QUESTION_TYPES.MULTI) {
        update(toggleMultiSolution, activeIndex, answerIndex)

        return
      }

      update(patchQuestion, activeIndex, { solution: answerIndex })
    },
    [activeIndex, update],
  )

  const handlePreviewAnswerTextChange = useCallback(
    (answerIndex, value) => {
      const answers = draft.questions[activeIndex].answers.map((answer, index) =>
        index === answerIndex ? value : answer,
      )

      updateText(`q${activeIndex}:answer-${answerIndex}`, patchQuestion, activeIndex, { answers })
    },
    [activeIndex, draft.questions, updateText],
  )

  const titleText = draft.subject.trim()
  const titleDisplay = titleText || 'Untitled quiz'
  const draftStatusLabel =
    saveStatus === 'saving' ? 'Saving draft...' : saveStatus === 'saved' ? 'Draft saved' : 'Draft'

  const paneProps = {
    draft,
    update,
    updateText,
    issues,
    activeQuestion: activeIndex,
    setActiveQuestion,
    showErrors,
  }

  const mobileMoreItems = [
    { label: 'Undo', onSelect: undo, disabled: !canUndo },
    { label: 'Redo', onSelect: redo, disabled: !canRedo },
    { separator: true },
    {
      label: 'Demo run',
      icon: <PlayIcon />,
      onSelect: () => setDemoOpen(true),
      disabled: !ready,
    },
    { separator: true },
    { label: 'Back to quizzes', onSelect: handleCancel },
  ]

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-gray-50">
      {/* ── Header: page identity · title · actions ─────────────────────── */}
      <header className="z-20 flex shrink-0 flex-col items-stretch gap-2 border-b border-gray-200 bg-white/95 px-3 py-2.5 lg:flex-row lg:items-center lg:justify-between lg:gap-4 lg:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            className={toolbarBtn}
            onClick={handleCancel}
            title="Back to quizzes"
            aria-label="Back to quizzes"
          >
            <ArrowLeftIcon />
          </button>
          <div className="min-w-0 flex-1">
            {titleEditing ? (
              <Input
                ref={titleInputRef}
                className={`min-w-0 w-full max-w-xl border-0 bg-transparent p-0 text-lg font-black tracking-tight text-gray-950 shadow-none sm:text-xl ${
                  subjectIssue ? 'rounded-sm outline-2 outline-red-400 focus:outline-red-500' : 'outline-0 focus:outline-0'
                }`}
                value={titleDraft}
                invalid={Boolean(subjectIssue)}
                maxLength={QUIZ_LIMITS.subjectMax}
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={commitTitleEdit}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    commitTitleEdit()
                  } else if (event.key === 'Escape') {
                    event.preventDefault()
                    cancelTitleEdit()
                  }
                }}
                placeholder="Quiz title..."
                aria-label="Quiz title"
              />
            ) : (
              <button
                type="button"
                aria-invalid={Boolean(subjectIssue) || undefined}
                className={`group flex min-w-0 max-w-xl items-center gap-1.5 rounded px-0 py-0.5 text-left focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                  subjectIssue ? 'outline-2 outline-red-400 outline-offset-2' : ''
                }`}
                onClick={startTitleEdit}
                title="Edit quiz title"
              >
                <span
                  className={`min-w-0 truncate text-lg font-black tracking-tight sm:text-xl ${
                    titleText ? 'text-gray-950' : 'text-gray-800'
                  }`}
                >
                  {titleDisplay}
                </span>
                <PencilIcon className="h-3.5 w-3.5 shrink-0 text-gray-300 transition group-hover:text-gray-500" />
              </button>
            )}
            <p className="mt-0.5 truncate text-xs font-semibold text-gray-400">
              {draftStatusLabel} · {stats.questionCount} question{stats.questionCount === 1 ? '' : 's'} · {formatDuration(stats.estimatedSeconds)}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 lg:hidden">
          <div className="grid flex-1 grid-cols-3 rounded-md bg-gray-100 p-1">
            {mobileTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`rounded px-2 py-1 text-xs font-black transition ${
                  mobileTab === tab.id ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500'
                }`}
                onClick={() => setMobileTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className={toolbarBtn}
              onClick={() => setPreviewOpen(true)}
              title="Preview this question"
            >
              <EyeIcon />
              <span className="sr-only">Preview</span>
            </button>
            <Button
              variant="secondary"
              className="px-3 py-1.5 text-sm"
              onClick={() => handleSave(false)}
              disabled={saving}
              title="Save the quiz to your library"
            >
              <SaveIcon />
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button
              className="px-3 py-1.5 text-sm"
              onClick={() => handleSave(true)}
              disabled={saving || !ready}
              title={ready ? 'Save, then open a live lobby with a game PIN' : 'Complete all required fields before hosting'}
            >
              <PlayIcon />
              Host
            </Button>
            <Menu
              menuLabel="More quiz actions"
              items={mobileMoreItems}
              renderTrigger={({ triggerProps }) => (
                <button
                  type="button"
                  className={toolbarBtn}
                  title="More actions"
                  {...triggerProps}
                >
                  <DotsVerticalIcon />
                  <span className="sr-only">More</span>
                </button>
              )}
            />
          </div>
        </div>

        <div className="hidden shrink-0 flex-wrap items-center justify-end gap-2 lg:flex">
          <button
            type="button"
            className={toolbarBtn}
            onClick={() => setPreviewOpen(true)}
            title="Preview this question"
          >
            <EyeIcon />
            Preview
          </button>
          <Menu
            menuLabel="More quiz actions"
            items={mobileMoreItems}
            renderTrigger={({ triggerProps }) => (
              <button type="button" className={toolbarBtn} title="More actions" {...triggerProps}>
                <DotsVerticalIcon />
                More
              </button>
            )}
          />
          <span aria-hidden className="h-5 w-px shrink-0 bg-gray-200"></span>
          <Button
            variant="secondary"
            className={actionButtonClass}
            onClick={() => handleSave(false)}
            disabled={saving}
            title="Save the quiz to your library"
          >
            <SaveIcon />
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button
            className={actionButtonClass}
            onClick={() => handleSave(true)}
            disabled={saving || !ready}
            title={ready ? 'Save, then open a live lobby with a game PIN' : 'Complete all required fields before hosting'}
          >
            <PlayIcon />
            {saving ? 'Saving…' : 'Save & host'}
          </Button>
        </div>
      </header>

      {/* ── Canvas: rail · preview · inspector (panes scroll, page doesn't) ── */}
      <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto bg-gray-100 p-3 lg:grid-cols-[12.25rem_minmax(0,1fr)_23.5rem] lg:items-stretch lg:gap-0 lg:overflow-hidden lg:p-0">
        <MobileQuestionNavigator
          count={draft.questions.length}
          activeQuestion={activeIndex}
          setActiveQuestion={setActiveQuestion}
          add={handleAddQuestion}
        />

        <div className={mobileTab === 'questions' ? 'min-h-0' : 'hidden lg:contents'}>
          <QuestionRail {...paneProps} />
        </div>

        <div className={`${mobileTab === 'preview' ? 'flex' : 'hidden'} min-h-[420px] flex-col overflow-hidden rounded-md border border-gray-200 bg-gray-100/70 p-3 shadow-inner lg:flex lg:h-full lg:min-h-0 lg:rounded-none lg:border-0 lg:bg-[#f4f4f6] lg:p-4 lg:shadow-none`}>
          <EditorPreview
            question={draft.questions[activeIndex]}
            index={activeIndex}
            total={draft.questions.length}
            onFocusField={handleFocusField}
            onMediaChange={handlePreviewMediaChange}
            mediaInvalid={activeMediaInvalid}
            onSelectCorrect={handlePreviewCorrectAnswer}
            onAnswerTextChange={handlePreviewAnswerTextChange}
            invalidAnswerKeys={issues
              .filter((issue) => issue.questionIndex === activeIndex && issue.field === 'answer')
              .map((issue) => issue.answerIndex)}
            correctAnswerInvalid={issues.some(
              (issue) => issue.questionIndex === activeIndex && issue.field === 'solution',
            )}
          />
        </div>

        <Card className={`${mobileTab === 'edit' ? 'block' : 'hidden'} min-h-0 border border-gray-100 p-3.5 lg:block lg:h-full lg:overflow-y-auto lg:rounded-none lg:border-y-0 lg:border-r-0 lg:border-l-gray-200 lg:shadow-none`}>
          <div ref={inspectorRef}>
            <QuestionEditor {...paneProps} index={activeIndex} />
          </div>
        </Card>
      </main>

      <ConfirmDialog
        open={confirmCancel}
        title="Discard changes?"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        danger
        wide
        extraAction={{
          label: saving ? 'Saving…' : 'Save & close',
          disabled: saving,
          onClick: handleSaveAndClose,
        }}
        onConfirm={() => {
          clearStoredDraft(storageKey)
          setConfirmCancel(false)
          onCancel()
        }}
        onCancel={() => setConfirmCancel(false)}
      >
        Your edits have not been saved. Discard them and close the editor?
      </ConfirmDialog>

      {demoOpen && (
        <DemoRunOverlay quizz={normalizeForSave(draft)} onExit={() => setDemoOpen(false)} />
      )}

      {storedOffer && (
        <div className="fixed inset-0 z-[215] flex items-center justify-center bg-black/45 p-4" role="presentation">
          <Card role="dialog" aria-modal="true" aria-labelledby="draft-recovery-title" className="anim-show w-full max-w-md p-5">
            <h2 id="draft-recovery-title" className="text-lg font-black text-gray-950">Restore unsaved draft?</h2>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-gray-600">
              We found changes from an earlier session. Restore them, or continue with the current quiz.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button type="button" className="text-sm" onClick={() => { reset(storedOffer); setStoredOffer(null) }}>
                Restore draft
              </Button>
              <Button type="button" variant="secondary" className="text-sm" onClick={() => setStoredOffer(null)}>
                Keep current
              </Button>
              <button type="button" className="px-2 py-1 text-sm font-black text-red-600 hover:underline sm:ml-auto" onClick={() => { clearStoredDraft(storageKey); setStoredOffer(null) }}>
                Discard saved draft
              </button>
            </div>
          </Card>
        </div>
      )}

      <ValidationSummaryModal
        open={validationOpen}
        issues={issues}
        onJump={jumpToIssue}
        onCancel={() => setValidationOpen(false)}
      />

      {previewOpen && (
        <div className="fixed inset-0 z-[220] flex flex-col bg-gray-950 p-3">
          <div className="flex shrink-0 items-center justify-between gap-3 pb-3 text-white">
            <div className="min-w-0">
              <p className="text-xs font-bold tracking-widest text-primary uppercase">Preview</p>
              <p className="truncate text-sm font-semibold text-white/70">
                Question {activeIndex + 1} of {draft.questions.length}
              </p>
            </div>
            <button
              type="button"
              className="rounded-md bg-white/10 p-2 text-white transition hover:bg-white/20"
              onClick={() => setPreviewOpen(false)}
              aria-label="Close preview"
            >
              <XCircleIcon className="h-5 w-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 rounded-xl bg-white p-3">
            <EditorPreview
              question={draft.questions[activeIndex]}
              index={activeIndex}
              total={draft.questions.length}
              editable={false}
            />
          </div>
        </div>
      )}
    </div>
  )
}
