import { useEffect } from 'react'
import therapyPlan from '../TherapySessionPlanExample.json'
import './App.css'
import TherapySession from './components/TherapySession'
import { useTherapyEngine } from './therapyEngine/useTherapyEngine'

function App() {
  const engine = useTherapyEngine()

  useEffect(() => {
    engine.actions.loadPlan(therapyPlan)
  }, [engine.actions])

  return <TherapySession engine={engine} />
}

export default App
