import { useState } from 'react'

export default function TherapySession({ engine }) {
  const { state, actions } = engine
  const [inputValue, setInputValue] = useState('')

  const canStart = state.status === 'loaded'
  const canSubmit = state.status === 'awaitingAnswer'
  const canNext = state.status === 'showingFeedback'
  const isChoiceMode = state.currentTask?.responseMode === 'choice'

  const submit = (event) => {
    event.preventDefault()
    if (!canSubmit || isChoiceMode) {
      return
    }
    actions.submitText(inputValue)
    setInputValue('')
  }

  const playPromptAudio = () => {
    if (!state.currentTask?.promptAudioUrl) {
      return
    }
    const audio = new Audio(state.currentTask.promptAudioUrl)
    audio.play().catch(() => {})
  }

  return (
    <section>
      <h1>Therapy Session MVP</h1>

      <p>Status: {state.status}</p>
      <p>
        Progress: Block {state.progress.blockNumber}/{state.progress.blockCount} | Item{' '}
        {state.progress.itemNumber}/{state.progress.itemCountInBlock}
      </p>
      <p>
        Score: {state.score.correct}/{state.score.total}
      </p>

      {state.status === 'error' && <p role="alert">{state.error || 'Something went wrong.'}</p>}
      {canStart && <button onClick={actions.start}>Start Session</button>}

      {state.currentTask && (
        <div>
          <p>Block Type: {state.currentTask.blockType}</p>
          <p>Topic: {state.currentTask.topic}</p>
          <p>Difficulty: {state.currentTask.difficulty}</p>
          <p>Prompt: {state.currentTask.promptText}</p>

          {state.currentTask.promptAudioUrl && (
            <button type="button" onClick={playPromptAudio}>
              Play Prompt Audio
            </button>
          )}

          {isChoiceMode && (
            <div className="choice-grid">
              {state.currentTask.choices.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  className="choice-card"
                  onClick={() => actions.submitChoice(choice.id)}
                  disabled={!canSubmit}
                >
                  <img src={choice.imageUrl} alt={choice.label} loading="lazy" />
                  <span>{choice.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!isChoiceMode && (
        <form onSubmit={submit}>
          <label htmlFor="therapyAnswer">Your answer</label>
          <input
            id="therapyAnswer"
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            disabled={!canSubmit}
          />
          <button type="submit" disabled={!canSubmit}>
            Submit
          </button>
        </form>
      )}

      {state.lastResult && (
        <div>
          <p>Input: {state.lastResult.input}</p>
          <p>Expected: {state.lastResult.expected || 'n/a'}</p>
          <p>Correct: {state.lastResult.isCorrect ? 'Yes' : 'No'}</p>
          <p>Feedback: {state.lastResult.feedbackText}</p>
        </div>
      )}

      {canNext && (
        <button type="button" onClick={actions.next}>
          Next
        </button>
      )}

      {(state.status === 'awaitingAnswer' ||
        state.status === 'showingFeedback' ||
        state.status === 'evaluating') && (
        <button type="button" onClick={actions.end}>
          End Session
        </button>
      )}

      {state.status === 'ended' && (
        <div>
          <p>Session complete.</p>
          <p>
            Final Score: {state.score.correct}/{state.score.total}
          </p>
        </div>
      )}
    </section>
  )
}
