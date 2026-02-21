import { describe, expect, it } from 'vitest'
import {
  ACTIONS,
  evaluateChoiceSubmission,
  evaluateTextSubmission,
  initialState,
  therapyEngineReducer,
} from './useTherapyEngine'

const plan = {
  therapyBlocks: [
    {
      type: 'picture_description',
      topic: 'animals',
      difficulty: 'easy',
      items: [
        {
          prompt: 'Tap the cat',
          answer: 'cat',
          choices: [
            { id: 'A', label: 'dog', imageUrl: '/test-images/choice-1.svg' },
            { id: 'B', label: 'cat', imageUrl: '/test-images/choice-2.svg' },
            { id: 'C', label: 'bird', imageUrl: '/test-images/choice-3.svg' },
            { id: 'D', label: 'fish', imageUrl: '/test-images/choice-4.svg' },
          ],
          correctChoiceId: 'B',
        },
      ],
    },
    {
      type: 'sentence_completion',
      topic: 'kitchen',
      difficulty: 'easy',
      items: [{ prompt: 'I cook eggs in a ____', answer: 'pan' }],
    },
  ],
}

function runToAwaiting(state) {
  const started = therapyEngineReducer(state, { type: ACTIONS.START })
  return therapyEngineReducer(started, { type: ACTIONS.PRESENT_TASK })
}

describe('therapyEngineReducer', () => {
  it('scores correct image choice selections', () => {
    const loaded = therapyEngineReducer(initialState, {
      type: ACTIONS.LOAD_PLAN,
      payload: plan,
    })

    let state = runToAwaiting(loaded)
    expect(state.currentTask?.responseMode).toBe('choice')

    state = therapyEngineReducer(state, {
      type: ACTIONS.SUBMIT_CHOICE,
      payload: 'B',
    })

    const result = evaluateChoiceSubmission(state.currentTask, 'B')
    state = therapyEngineReducer(state, {
      type: ACTIONS.EVALUATION_COMPLETE,
      payload: result,
    })

    expect(state.lastResult?.isCorrect).toBe(true)
    expect(state.lastResult?.expected).toBe('cat')
    expect(state.score).toEqual({ correct: 1, total: 1 })
  })

  it('scores text answers with trim + case-insensitive normalization', () => {
    const loaded = therapyEngineReducer(initialState, {
      type: ACTIONS.LOAD_PLAN,
      payload: plan,
    })

    let state = runToAwaiting(loaded)
    state = therapyEngineReducer(state, { type: ACTIONS.SUBMIT_CHOICE, payload: 'B' })
    state = therapyEngineReducer(state, {
      type: ACTIONS.EVALUATION_COMPLETE,
      payload: evaluateChoiceSubmission(state.currentTask, 'B'),
    })

    state = therapyEngineReducer(state, { type: ACTIONS.NEXT })
    state = therapyEngineReducer(state, { type: ACTIONS.PRESENT_TASK })

    expect(state.currentTask?.responseMode).toBe('text')

    state = therapyEngineReducer(state, {
      type: ACTIONS.SUBMIT_TEXT,
      payload: '  PAN ',
    })

    state = therapyEngineReducer(state, {
      type: ACTIONS.EVALUATION_COMPLETE,
      payload: evaluateTextSubmission(plan.therapyBlocks[1].items[0], '  PAN '),
    })

    expect(state.lastResult?.isCorrect).toBe(true)
    expect(state.score).toEqual({ correct: 2, total: 2 })
  })

  it('ends session after final item', () => {
    const loaded = therapyEngineReducer(initialState, {
      type: ACTIONS.LOAD_PLAN,
      payload: plan,
    })

    let state = runToAwaiting(loaded)
    state = therapyEngineReducer(state, { type: ACTIONS.SUBMIT_CHOICE, payload: 'B' })
    state = therapyEngineReducer(state, {
      type: ACTIONS.EVALUATION_COMPLETE,
      payload: evaluateChoiceSubmission(state.currentTask, 'B'),
    })

    state = therapyEngineReducer(state, { type: ACTIONS.NEXT })
    state = therapyEngineReducer(state, { type: ACTIONS.PRESENT_TASK })
    state = therapyEngineReducer(state, { type: ACTIONS.SUBMIT_TEXT, payload: 'pan' })
    state = therapyEngineReducer(state, {
      type: ACTIONS.EVALUATION_COMPLETE,
      payload: evaluateTextSubmission(plan.therapyBlocks[1].items[0], 'pan'),
    })

    state = therapyEngineReducer(state, { type: ACTIONS.NEXT })
    expect(state.status).toBe('ended')
    expect(state.currentTask).toBeNull()
  })

  it('prevents double submissions for choice mode', () => {
    const loaded = therapyEngineReducer(initialState, {
      type: ACTIONS.LOAD_PLAN,
      payload: plan,
    })

    let state = runToAwaiting(loaded)
    state = therapyEngineReducer(state, { type: ACTIONS.SUBMIT_CHOICE, payload: 'A' })

    const secondSubmitAttempt = therapyEngineReducer(state, {
      type: ACTIONS.SUBMIT_CHOICE,
      payload: 'B',
    })

    expect(secondSubmitAttempt).toEqual(state)
    expect(secondSubmitAttempt.status).toBe('evaluating')
    expect(secondSubmitAttempt.pendingSubmission).toEqual({ kind: 'choice', value: 'A' })
  })
})
