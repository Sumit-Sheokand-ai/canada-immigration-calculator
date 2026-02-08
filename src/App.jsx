import { useState, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import Header from './components/Header';
import WelcomeScreen from './components/WelcomeScreen';
import Wizard from './components/Wizard';
import Results from './components/Results';
import './App.css';

export default function App() {
  const [mode, setMode] = useState('welcome');
  const [answers, setAnswers] = useState({});

  const handleStart = useCallback(() => setMode('wizard'), []);

  const handleFinish = useCallback((ans) => {
    setAnswers(ans);
    setMode('results');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleRestart = useCallback(() => {
    setAnswers({});
    setMode('welcome');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <div className="app">
      <Header />
      <main className="main">
        <AnimatePresence mode="wait">
          {mode === 'welcome' && <WelcomeScreen key="welcome" onStart={handleStart} />}
          {mode === 'wizard' && <Wizard key="wizard" onFinish={handleFinish} />}
          {mode === 'results' && <Results key="results" answers={answers} onRestart={handleRestart} />}
        </AnimatePresence>
      </main>
      <footer className="footer">
        <p>© {new Date().getFullYear()} CRS Calculator · Not affiliated with IRCC</p>
      </footer>
    </div>
  );
}
