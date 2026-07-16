import { QUESTION_TYPES, questionTypeOf } from '@bazoot/shared/questionTypes'
import clsx from 'clsx'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import background from '../../assets/background.webp'
import { AnswerGrid } from '../../components/game/AnswerGrid.jsx'
import { QuestionAudioPlayer } from '../../components/game/QuestionAudioPlayer.jsx'
import { MonitorIcon, PhoneIcon } from '../../components/icons/ui.jsx'
import { MediaPicker } from './QuestionEditor.jsx'

const DEVICES = [
  { id: 'desktop', label: 'Desktop', ratio: '16:9', icon: MonitorIcon },
  { id: 'mobile', label: 'Mobile', ratio: '19.5:9', icon: PhoneIcon },
]

const DEVICE_RATIOS = {
  desktop: 16 / 9,
  mobile: 6 / 13,
}

const DEFAULT_MEDIA_ASPECT_RATIO = 16 / 9
const AUDIO_MEDIA_ASPECT_RATIO = 4

const safeAspectRatio = (value, fallback = DEFAULT_MEDIA_ASPECT_RATIO) =>
  Number.isFinite(value) && value >= 0.25 && value <= 4 ? value : fallback

const fitMediaBox = (stageSize, aspectRatio, scale, maxHeight) => {
  const availableWidth = Math.floor(stageSize.width * scale)
  const availableHeight = Math.floor(Math.min(stageSize.height * scale, maxHeight ?? Infinity))

  if (availableWidth <= 0 || availableHeight <= 0) {
    return null
  }

  const width = Math.min(availableWidth, availableHeight * aspectRatio)

  return {
    width: Math.max(0, Math.floor(width)),
    height: Math.max(0, Math.floor(width / aspectRatio)),
  }
}

const useMeasuredSize = () => {
  const ref = useRef(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    if (!ref.current) {
      return undefined
    }

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect

      setSize({
        width: Math.floor(width),
        height: Math.floor(height),
      })
    })

    observer.observe(ref.current)

    return () => observer.disconnect()
  }, [])

  return [ref, size]
}

const DeviceFrame = ({
  device,
  frameSize,
  question,
  answers,
  correctKeys,
  invalidAnswerKeys,
  isOrder,
  onFocusField,
  onMediaChange,
  mediaInvalid,
  onSelectCorrect,
  onAnswerTextChange,
  correctAnswerInvalid,
  editable,
}) => {
  const isMobile = device === 'mobile'
  const answerItems = Array.isArray(answers) ? answers : []
  const questionText = typeof question.question === 'string' ? question.question.trim() : ''
  const compactStage = answerItems.length >= 5
  const hasMedia = Boolean(question.image || question.video || question.audio)
  const isCompactFrame = isMobile || frameSize?.width < 720 || frameSize?.height < 420
  const isLongQuestion = questionText.length > 120
  const defaultMediaAspectRatio = question.audio
    ? AUDIO_MEDIA_ASPECT_RATIO
    : DEFAULT_MEDIA_ASPECT_RATIO
  const [mediaStageRef, mediaStageSize] = useMeasuredSize()
  const [mediaAspectRatio, setMediaAspectRatio] = useState(defaultMediaAspectRatio)

  useEffect(() => {
    setMediaAspectRatio(defaultMediaAspectRatio)
  }, [defaultMediaAspectRatio, question.audio, question.image, question.video])

  const handleMediaAspectRatio = useCallback(
    (nextRatio) => {
      setMediaAspectRatio((currentRatio) => {
        const ratio = safeAspectRatio(nextRatio, defaultMediaAspectRatio)

        return Math.abs(currentRatio - ratio) < 0.01 ? currentRatio : ratio
      })
    },
    [defaultMediaAspectRatio],
  )

  const mediaBox = useMemo(() => {
    const stageScale = hasMedia ? 0.94 : 0.76
    const audioMaxHeight = question.audio ? (isMobile ? 84 : 112) : undefined

    return fitMediaBox(
      mediaStageSize,
      safeAspectRatio(mediaAspectRatio, defaultMediaAspectRatio),
      stageScale,
      audioMaxHeight,
    )
  }, [defaultMediaAspectRatio, hasMedia, isMobile, mediaAspectRatio, mediaStageSize, question.audio])

  const mediaBoxStyle = mediaBox
    ? { width: `${mediaBox.width}px`, height: `${mediaBox.height}px` }
    : undefined
  const canRenderMedia = Boolean(mediaBox && mediaBox.width >= 80 && mediaBox.height >= 40)
  const questionSizeClass = isMobile
    ? isLongQuestion || compactStage
      ? 'text-sm'
      : 'text-base'
    : isCompactFrame
      ? isLongQuestion
        ? 'text-lg'
        : 'text-2xl'
      : compactStage
        ? isLongQuestion
          ? 'text-xl'
          : 'text-3xl'
        : isLongQuestion
          ? 'text-2xl'
          : hasMedia
            ? 'text-4xl'
            : 'text-5xl'

  return (
    <div className="flex min-w-0 items-center justify-center">
      <div
        className={clsx(
          'relative shrink-0 overflow-hidden rounded-xl bg-secondary shadow-lg transition-all',
          !frameSize && (isMobile ? 'aspect-[6/13] w-full max-w-96' : 'aspect-video w-full'),
        )}
        style={frameSize ? { width: `${frameSize.width}px`, height: `${frameSize.height}px` } : undefined}
      >
        <img
          src={background}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />
        <div className={clsx(
          'relative grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]',
          isMobile ? 'gap-2 p-2.5' : 'gap-4 p-4 sm:p-6',
        )}>
          <div className="flex shrink-0 justify-center">
            {editable ? (
              <button
                type="button"
                onClick={() => onFocusField?.('question')}
                title="Click to edit the question"
                className={clsx(
                  'w-full cursor-pointer rounded-md bg-white/95 text-gray-950 shadow-md outline-white/60 transition hover:bg-white hover:outline-2 focus-visible:outline-2',
                  isMobile ? 'px-3 py-2' : compactStage ? 'px-4 py-2.5 sm:px-6' : 'px-4 py-3 sm:px-8',
                )}
              >
                <h2 className={clsx('line-clamp-3 text-center font-bold', questionSizeClass)} title={questionText}>
                  {questionText || 'Your question will appear here'}
                </h2>
              </button>
            ) : (
              <div
                className={clsx(
                  'w-full rounded-md bg-white/95 text-gray-950 shadow-md',
                  isMobile ? 'px-3 py-2' : compactStage ? 'px-4 py-2.5 sm:px-6' : 'px-4 py-3 sm:px-8',
                )}
              >
                <h2 className={clsx('line-clamp-3 text-center font-bold', questionSizeClass)} title={questionText}>
                  {questionText || 'Your question will appear here'}
                </h2>
              </div>
            )}
          </div>

          <div
            ref={mediaStageRef}
            className={clsx(
              'flex min-h-0 min-w-0 items-center justify-center overflow-hidden',
              isMobile ? 'py-1' : compactStage ? 'py-2' : 'py-3',
            )}
          >
            {editable && canRenderMedia ? (
              <MediaPicker
                question={question}
                onChange={onMediaChange}
                appearance="preview"
                invalid={mediaInvalid}
                previewAspectRatio={mediaAspectRatio}
                onPreviewAspectRatioChange={handleMediaAspectRatio}
                style={mediaBoxStyle}
              />
            ) : (
              <>
                {canRenderMedia && question.audio && (
                  <div style={mediaBoxStyle} className="flex max-h-full max-w-full items-center justify-center">
                    <QuestionAudioPlayer src={question.audio} autoPlay />
                  </div>
                )}
                {canRenderMedia && question.video && (
                  <video
                    style={mediaBoxStyle}
                    className="max-h-full max-w-full rounded-md bg-black object-contain"
                    src={question.video}
                    autoPlay
                    controls
                    onLoadedMetadata={(event) => handleMediaAspectRatio(event.currentTarget.videoWidth / event.currentTarget.videoHeight)}
                  />
                )}
                {canRenderMedia && question.image && (
                  <img
                    style={mediaBoxStyle}
                    src={question.image}
                    alt=""
                    className="max-h-full max-w-full rounded-md bg-gray-950 object-contain"
                    onLoad={(event) => handleMediaAspectRatio(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)}
                  />
                )}
              </>
            )}
          </div>

          {/* The answer body edits inline; the dedicated check control at the
              far right changes correctness. */}
          <div
            className={clsx(
              'min-h-0 [&_button]:cursor-pointer',
              isMobile &&
                '[&>div]:mb-0 [&>div]:px-0 [&>div]:text-xs [&_button]:min-h-[3.25rem] [&_button]:gap-2 [&_button]:px-2 [&_button]:py-2 [&_svg]:h-5 [&_svg]:w-5',
            )}
          >
            <AnswerGrid
              answers={answerItems}
              correctKeys={correctKeys}
              invalidKeys={invalidAnswerKeys}
              badgeFor={isOrder ? (key) => key + 1 : undefined}
              layout={isCompactFrame ? 'compact' : 'stage'}
              onAnswerTextChange={editable ? onAnswerTextChange : undefined}
              onSelectCorrect={editable && !isOrder ? onSelectCorrect : undefined}
              correctAnswerInvalid={correctAnswerInvalid}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// Read-only "as players see it" preview of the active card. Reuses the real
// AnswerGrid so colours, icons and layout match the game exactly; correct
// answers are ringed (a marker only the author sees) and order questions show
// their authored sequence as position badges. Purely presentational — no game
// state, no interaction (the grid is inert).
export const EditorPreview = ({ question, index, total, onFocusField, onMediaChange, onSelectCorrect, onAnswerTextChange, invalidAnswerKeys = [], correctAnswerInvalid = false, mediaInvalid = false, editable = true }) => {
  const [device, setDevice] = useState('desktop')
  const [previewSlotRef, previewSlotSize] = useMeasuredSize()
  const type = questionTypeOf(question)
  const isOrder = type === QUESTION_TYPES.ORDER
  const deviceMeta = DEVICES.find((item) => item.id === device) ?? DEVICES[0]

  const answers = question.answers

  const correctKeys = !editable
    ? []
    : (
        type === QUESTION_TYPES.MULTI
          ? (question.solution ?? [])
          : isOrder
            ? []
            : [question.solution]
      ).filter((key) => key != null)

  const frameSize = useMemo(() => {
    if (previewSlotSize.width <= 0 || previewSlotSize.height <= 0) {
      return null
    }

    const ratio = DEVICE_RATIOS[device]
    const widthFromHeight = previewSlotSize.height * ratio

    if (widthFromHeight <= previewSlotSize.width) {
      return {
        width: Math.floor(widthFromHeight),
        height: previewSlotSize.height,
      }
    }

    return {
      width: previewSlotSize.width,
      height: Math.floor(previewSlotSize.width / ratio),
    }
  }, [device, previewSlotSize.height, previewSlotSize.width])

  return (
    <div className={clsx('flex h-full min-h-0 min-w-0 flex-1 flex-col items-center overflow-hidden', editable && 'gap-3')}>
      {editable && <div className="flex w-full items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="block text-xs font-black tracking-wide text-gray-400 uppercase">
            Live preview
          </span>
          <span className="block text-sm font-black text-gray-700">
            Question {index + 1} of {total} · {deviceMeta.ratio}
          </span>
          {!isOrder && (
            <span className="block text-xs font-semibold text-primary">
              {type === QUESTION_TYPES.MULTI ? 'Click every correct answer' : 'Click the correct answer'}
            </span>
          )}
        </div>
        <div className="flex rounded-md bg-gray-100 p-1">
          {DEVICES.map((d) => {
            const Icon = d.icon

            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setDevice(d.id)}
                className={clsx(
                  'inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-black transition-colors',
                  device === d.id
                    ? 'bg-white text-gray-950 shadow-sm'
                    : 'text-gray-500 hover:text-gray-800',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {d.label}
              </button>
            )
          })}
        </div>
      </div>}

      <div
        ref={previewSlotRef}
        className={clsx('flex min-h-0 w-full flex-1 items-start justify-center overflow-hidden', editable && 'pt-1')}
      >
        <DeviceFrame
          device={device}
          frameSize={frameSize}
          question={question}
          answers={answers}
          correctKeys={correctKeys}
          invalidAnswerKeys={invalidAnswerKeys}
          isOrder={isOrder}
          onFocusField={onFocusField}
          onMediaChange={onMediaChange}
          mediaInvalid={mediaInvalid}
          onSelectCorrect={onSelectCorrect ? (key) => onSelectCorrect(key, type) : undefined}
          onAnswerTextChange={onAnswerTextChange}
          correctAnswerInvalid={correctAnswerInvalid}
          editable={editable}
        />
      </div>
    </div>
  )
}
