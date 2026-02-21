import { useEffect, useMemo, useReducer, useRef } from 'react'

const VALID_STATUSES = [
  'idle',
  'loaded',
  'presenting',
  'awaitingAnswer',
  'evaluating',
  'showingFeedback',
  'ended',
  'error',
]

const DEFAULT_DISTRACTOR_LABELS = [
  'apple',
  'book',
  'cat',
  'dog',
  'house',
  'car',
  'chair',
  'tree',
]

export const ACTIONS = {
  LOAD_PLAN: 'LOAD_PLAN',
  LOAD_PLAN_ERROR: 'LOAD_PLAN_ERROR',
  START: 'START',
  PRESENT_TASK: 'PRESENT_TASK',
  SUBMIT_TEXT: 'SUBMIT_TEXT',
  SUBMIT_CHOICE: 'SUBMIT_CHOICE',
  EVALUATION_COMPLETE: 'EVALUATION_COMPLETE',
  NEXT: 'NEXT',
  END: 'END',
  SET_PROMPT_AUDIO: 'SET_PROMPT_AUDIO',
}

export const initialState = {
  status: 'idle',
  error: null,
  plan: null,
  blockIndex: 0,
  itemIndex: 0,
  currentTask: null,
  lastResult: null,
  score: { correct: 0, total: 0 },
  history: [],
  pendingSubmission: null,
}

function normalizeInput(value) {
  return String(value ?? '').trim().toLowerCase()
}

function toChoiceId(index) {
  return String.fromCharCode(65 + index)
}

function getCurrentItem(plan, blockIndex, itemIndex) {
  const block = plan?.therapyBlocks?.[blockIndex]
  const item = block?.items?.[itemIndex]
  return { block, item }
}

function normalizeChoices(item) {
  if (!Array.isArray(item?.choices) || item.choices.length === 0) {
    return []
  }

  return item.choices.slice(0, 4).map((choice, index) => ({
    id: choice.id || toChoiceId(index),
    label: choice.label || choice.text || `Choice ${index + 1}`,
    imageUrl:
      choice.imageUrl ||
      choice.image_url ||
      `/test-images/choice-${(index % 4) + 1}.svg`,
  }))
}

function buildFallbackChoices(item) {
  const expected = normalizeInput(item?.answer)
  const expectedLabel = expected || 'target'
  const distractors = []

  for (const label of DEFAULT_DISTRACTOR_LABELS) {
    if (label !== expectedLabel) {
      distractors.push(label)
    }
    if (distractors.length === 3) {
      break
    }
  }

  return [expectedLabel, ...distractors].map((label, index) => ({
    id: toChoiceId(index),
    label,
    imageUrl: `/test-images/choice-${index + 1}.svg`,
  }))
}

function resolveCorrectChoiceId(item, choices) {
  const explicit = item?.correctChoiceId || item?.correct_choice_id
  if (explicit) {
    return explicit
  }

  const expected = normalizeInput(item?.answer)
  const match = choices.find((choice) => normalizeInput(choice.label) === expected)
  return match?.id || null
}

function buildCurrentTask(plan, blockIndex, itemIndex) {
  const { block, item } = getCurrentItem(plan, blockIndex, itemIndex)
  if (!block || !item) {
    return null
  }

  const promptAudioUrl =
    item.promptAudioUrl || item.audioUrl || item.promptAudio?.url || null

  const providedChoices = normalizeChoices(item)
  const shouldUseChoiceMode =
    block.type === 'picture_description' || providedChoices.length > 0

  const choices = shouldUseChoiceMode
    ? providedChoices.length > 0
      ? providedChoices
      : buildFallbackChoices(item)
    : []

  const correctChoiceId = shouldUseChoiceMode
    ? resolveCorrectChoiceId(item, choices)
    : null

  return {
    blockType: block.type,
    topic: block.topic,
    difficulty: block.difficulty,
    promptText: item.prompt,
    promptAudioUrl,
    responseMode: shouldUseChoiceMode ? 'choice' : 'text',
    choices,
    correctChoiceId,
  }
}

function getNextPosition(plan, blockIndex, itemIndex) {
  const currentBlock = plan?.therapyBlocks?.[blockIndex]
  if (!currentBlock) {
    return null
  }

  const hasNextItemInBlock = itemIndex + 1 < (currentBlock.items?.length || 0)
  if (hasNextItemInBlock) {
    return { blockIndex, itemIndex: itemIndex + 1 }
  }

  const nextBlockIndex = blockIndex + 1
  const nextBlock = plan?.therapyBlocks?.[nextBlockIndex]
  if (!nextBlock || !nextBlock.items?.length) {
    return null
  }

  return { blockIndex: nextBlockIndex, itemIndex: 0 }
}

function createFeedback({ isScored, isCorrect, expected }) {
  if (!isScored) {
    return 'Response saved.'
  }
  if (isCorrect) {
    return 'Correct.'
  }
  return `Not quite. Expected: ${expected}`
}

export function evaluateTextSubmission(item, input) {
  const expected = typeof item?.answer === 'string' ? item.answer.trim() : ''
  const isScored = expected.length > 0
  const isCorrect = isScored
    ? normalizeInput(input) === normalizeInput(expected)
    : true

  return {
    input: String(input ?? ''),
    expected,
    isCorrect,
    isScored,
    feedbackText: createFeedback({ isScored, isCorrect, expected }),
    feedbackAudioUrl: null,
    responseMode: 'text',
  }
}

export function evaluateChoiceSubmission(task, selectedChoiceId) {
  const selectedChoice = task?.choices?.find((choice) => choice.id === selectedChoiceId)
  const expectedChoice = task?.choices?.find((choice) => choice.id === task.correctChoiceId)

  const expected = expectedChoice?.label || ''
  const isScored = Boolean(task?.correctChoiceId)
  const isCorrect = isScored ? selectedChoiceId === task.correctChoiceId : true

  return {
    input: selectedChoice?.label || selectedChoiceId || '',
    expected,
    isCorrect,
    isScored,
    feedbackText: createFeedback({ isScored, isCorrect, expected }),
    feedbackAudioUrl: null,
    responseMode: 'choice',
    selectedChoiceId: selectedChoiceId || null,
    expectedChoiceId: task?.correctChoiceId || null,
  }
}

function isValidPlan(plan) {
  if (!plan || typeof plan !== 'object') {
    return false
  }
  if (!Array.isArray(plan.therapyBlocks) || plan.therapyBlocks.length === 0) {
    return false
  }
  return plan.therapyBlocks.every((block) =>
    Array.isArray(block.items) && block.items.length > 0,
  )
}

export function therapyEngineReducer(state, action) {
  switch (action.type) {
    case ACTIONS.LOAD_PLAN: {
      const plan = action.payload
      if (!isValidPlan(plan)) {
        return {
          ...initialState,
          status: 'error',
          error: 'Invalid therapy plan. Each block must include at least one item.',
        }
      }

      return {
        ...initialState,
        status: 'loaded',
        plan,
      }
    }

    case ACTIONS.LOAD_PLAN_ERROR:
      return {
        ...state,
        status: 'error',
        error: action.payload || 'Unable to load therapy plan.',
      }

    case ACTIONS.START: {
      if (state.status !== 'loaded' || !state.plan) {
        return state
      }

      return {
        ...state,
        blockIndex: 0,
        itemIndex: 0,
        currentTask: buildCurrentTask(state.plan, 0, 0),
        lastResult: null,
        pendingSubmission: null,
        status: 'presenting',
        error: null,
      }
    }

    case ACTIONS.PRESENT_TASK: {
      if (state.status !== 'presenting') {
        return state
      }

      return {
        ...state,
        status: 'awaitingAnswer',
      }
    }

    case ACTIONS.SUBMIT_TEXT: {
      if (state.status !== 'awaitingAnswer') {
        return state
      }

      return {
        ...state,
        pendingSubmission: { kind: 'text', value: action.payload },
        status: 'evaluating',
      }
    }

    case ACTIONS.SUBMIT_CHOICE: {
      if (state.status !== 'awaitingAnswer') {
        return state
      }

      return {
        ...state,
        pendingSubmission: { kind: 'choice', value: action.payload },
        status: 'evaluating',
      }
    }

    case ACTIONS.EVALUATION_COMPLETE: {
      if (state.status !== 'evaluating') {
        return state
      }

      const result = action.payload
      const nextScore = {
        correct: state.score.correct + (result.isScored && result.isCorrect ? 1 : 0),
        total: state.score.total + (result.isScored ? 1 : 0),
      }

      return {
        ...state,
        score: nextScore,
        lastResult: result,
        history: [...state.history, result],
        pendingSubmission: null,
        status: 'showingFeedback',
      }
    }

    case ACTIONS.NEXT: {
      if (state.status !== 'showingFeedback') {
        return state
      }

      const nextPosition = getNextPosition(state.plan, state.blockIndex, state.itemIndex)
      if (!nextPosition) {
        return {
          ...state,
          currentTask: null,
          status: 'ended',
        }
      }

      return {
        ...state,
        blockIndex: nextPosition.blockIndex,
        itemIndex: nextPosition.itemIndex,
        currentTask: buildCurrentTask(state.plan, nextPosition.blockIndex, nextPosition.itemIndex),
        lastResult: null,
        status: 'presenting',
      }
    }

    case ACTIONS.END:
      return {
        ...state,
        currentTask: null,
        pendingSubmission: null,
        status: 'ended',
      }

    case ACTIONS.SET_PROMPT_AUDIO: {
      if (!state.currentTask) {
        return state
      }

      const { blockIndex, itemIndex, promptAudioUrl } = action.payload || {}
      if (blockIndex !== state.blockIndex || itemIndex !== state.itemIndex) {
        return state
      }

      return {
        ...state,
        currentTask: {
          ...state.currentTask,
          promptAudioUrl,
        },
      }
    }

    default:
      return state
  }
}

export function useTherapyEngine(options = {}) {
  const { resolvePromptAudioRef } = options
  const [state, dispatch] = useReducer(therapyEngineReducer, initialState)
  const resolvedAudioKeysRef = useRef(new Set())

  useEffect(() => {
    if (state.status === 'presenting') {
      dispatch({ type: ACTIONS.PRESENT_TASK })
    }
  }, [state.status])

  useEffect(() => {
    if (state.status !== 'evaluating' || !state.plan || !state.currentTask) {
      return
    }

    const { item } = getCurrentItem(state.plan, state.blockIndex, state.itemIndex)
    const submission = state.pendingSubmission

    let result
    if (submission?.kind === 'choice') {
      result = evaluateChoiceSubmission(state.currentTask, submission.value)
    } else {
      result = evaluateTextSubmission(item, submission?.value)
    }

    dispatch({ type: ACTIONS.EVALUATION_COMPLETE, payload: result })
  }, [
    state.status,
    state.plan,
    state.currentTask,
    state.blockIndex,
    state.itemIndex,
    state.pendingSubmission,
  ])

  useEffect(() => {
    const canResolveAudio =
      typeof resolvePromptAudioRef === 'function' &&
      state.plan &&
      state.currentTask &&
      !state.currentTask.promptAudioUrl

    if (!canResolveAudio) {
      return
    }

    const key = `${state.blockIndex}:${state.itemIndex}`
    if (resolvedAudioKeysRef.current.has(key)) {
      return
    }

    resolvedAudioKeysRef.current.add(key)

    let isCancelled = false
    const { block, item } = getCurrentItem(state.plan, state.blockIndex, state.itemIndex)

    Promise.resolve(
      resolvePromptAudioRef({
        block,
        item,
        blockIndex: state.blockIndex,
        itemIndex: state.itemIndex,
      }),
    )
      .then((audioRef) => {
        if (isCancelled || !audioRef) {
          return
        }

        const promptAudioUrl = typeof audioRef === 'string' ? audioRef : audioRef.url || null
        if (!promptAudioUrl) {
          return
        }

        dispatch({
          type: ACTIONS.SET_PROMPT_AUDIO,
          payload: {
            blockIndex: state.blockIndex,
            itemIndex: state.itemIndex,
            promptAudioUrl,
          },
        })
      })
      .catch(() => {
        // Audio is optional; failures should not interrupt the session flow.
      })

    return () => {
      isCancelled = true
    }
  }, [
    resolvePromptAudioRef,
    state.plan,
    state.currentTask,
    state.blockIndex,
    state.itemIndex,
  ])

  const actions = useMemo(
    () => ({
      loadPlan(plan) {
        try {
          dispatch({ type: ACTIONS.LOAD_PLAN, payload: plan })
        } catch {
          dispatch({ type: ACTIONS.LOAD_PLAN_ERROR })
        }
      },
      start() {
        dispatch({ type: ACTIONS.START })
      },
      submitText(text) {
        dispatch({ type: ACTIONS.SUBMIT_TEXT, payload: text })
      },
      submitChoice(choiceId) {
        dispatch({ type: ACTIONS.SUBMIT_CHOICE, payload: choiceId })
      },
      next() {
        dispatch({ type: ACTIONS.NEXT })
      },
      end() {
        dispatch({ type: ACTIONS.END })
      },
    }),
    [],
  )

  const validatedStatus = VALID_STATUSES.includes(state.status) ? state.status : 'error'
  const blockCount = state.plan?.therapyBlocks?.length || 0
  const itemCountInBlock = state.plan?.therapyBlocks?.[state.blockIndex]?.items?.length || 0

  return {
    state: {
      ...state,
      status: validatedStatus,
      progress: {
        blockIndex: state.blockIndex,
        itemIndex: state.itemIndex,
        blockNumber: blockCount ? state.blockIndex + 1 : 0,
        blockCount,
        itemNumber: itemCountInBlock ? state.itemIndex + 1 : 0,
        itemCountInBlock,
      },
    },
    actions,
  }
}
