import { useState, useCallback, useMemo, useEffect, useId } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { searchNOC } from '../data/nocCodes';
import { fallbackQuestionBank } from '../data/questionBank';
import { useLanguage } from '../i18n/LanguageContext';
import StarBorder from './StarBorder';
import { getQuestionBank } from '../utils/questionDataSource';

function useDebouncedValue(value, delay = 220) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

function doesRuleMatch(rule, answers) {
  if (!rule || !rule.key) return true;
  const lhs = answers?.[rule.key];
  const rhs = rule.value;
  switch (rule.op) {
    case 'eq':
      return lhs === rhs;
    case 'neq':
      return lhs !== rhs;
    case 'in':
      return Array.isArray(rhs) ? rhs.includes(lhs) : false;
    case 'not_in':
      return Array.isArray(rhs) ? !rhs.includes(lhs) : true;
    case 'exists':
      return lhs !== undefined && lhs !== null && lhs !== '';
    case 'not_exists':
      return lhs === undefined || lhs === null || lhs === '';
    default:
      return lhs === rhs;
  }
}

function isApplicable(step, answers) {
  const visibility = step?.visibility;
  if (!visibility) return true;
  const all = Array.isArray(visibility.all) ? visibility.all : [];
  const any = Array.isArray(visibility.any) ? visibility.any : [];
  const none = Array.isArray(visibility.none) ? visibility.none : [];

  const allPass = all.every((rule) => doesRuleMatch(rule, answers));
  const anyPass = any.length === 0 || any.some((rule) => doesRuleMatch(rule, answers));
  const nonePass = none.every((rule) => !doesRuleMatch(rule, answers));
  return allPass && anyPass && nonePass;
}

function isComplete(step, answers) {
  if (!step) return false;
  if (step.type === 'grouped') {
    return step.groups.every((group) => !!answers[group.answerKey]);
  }
  return !!answers[step.answerKey];
}

function getFirstApplicableIndex(steps, answers) {
  for (let i = 0; i < steps.length; i += 1) {
    if (isApplicable(steps[i], answers)) return i;
  }
  return 0;
}

function getLayoutFromType(type, fallback = 'list') {
  if (type === 'grid') return 'grid';
  if (type === 'grid-wide') return 'grid-wide';
  if (type === 'single') return fallback;
  return fallback;
}

const pageVariants = {
  enter: (dir) => ({ x: dir > 0 ? 80 : -80, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir) => ({ x: dir > 0 ? -80 : 80, opacity: 0 }),
};

function StepProgressBar({ pct }) {
  return (
    <div className="wiz-progress-container">
      <div className="uv-progress-bar" style={{ width: `${pct}%` }} />
      <div className="uv-progress-text">{pct}%</div>
      <div className="uv-particles">
        <div className="uv-particle" />
        <div className="uv-particle" />
        <div className="uv-particle" />
        <div className="uv-particle" />
        <div className="uv-particle" />
      </div>
    </div>
  );
}

function OptionButton({ opt, selected, layout, onSelect, reducedMotion = false }) {
  return (
    <motion.button
      type="button"
      className={`opt-btn${selected ? ' selected' : ''} ${layout}`}
      onClick={onSelect}
      aria-pressed={selected}
      whileHover={reducedMotion ? undefined : { scale: 1.02 }}
      whileTap={reducedMotion ? undefined : { scale: 0.97 }}
      layout
    >
      {layout === 'list' && <span className="radio-dot" />}
      <span className="opt-content">
        <span className="opt-label">{opt.label}</span>
        {opt.example && <span className="opt-example">{opt.example}</span>}
      </span>
    </motion.button>
  );
}

function HelpTip({ text }) {
  const [open, setOpen] = useState(false);
  const bubbleId = useId();
  return (
    <span className="help-tip-wrap">
      <button
        className="help-tip-btn"
        onClick={() => setOpen(!open)}
        aria-label="More info"
        aria-expanded={open}
        aria-controls={bubbleId}
        type="button"
      >
        ?
      </button>
      {open && <div id={bubbleId} className="help-tip-bubble" onClick={() => setOpen(false)}>{text}</div>}
    </span>
  );
}

function NOCSearch({ onSelect }) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 240);
  const results = useMemo(() => searchNOC(debouncedQuery), [debouncedQuery]);
  return (
    <div className="noc-search">
      <div className="option-search-wrap glass-search">
        <span className="option-search-icon">⌕</span>
        <input
          className="option-search-input"
          type="text"
          placeholder="Search your job title (e.g. Software Developer, Nurse)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search NOC job titles"
        />
      </div>
      {results.length > 0 && (
        <div className="noc-results">
          {results.map((r) => (
            <button key={r.noc} className="noc-result" onClick={() => { onSelect(r.teer); setQuery(''); }} type="button">
              <span className="noc-code">{r.noc}</span>
              <span className="noc-title">{r.title}</span>
              <span className="noc-teer">{r.teer.replace('teer_', 'TEER ')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function OptionList({
  options,
  answerKey,
  layout,
  answers,
  onAnswer,
  searchable = false,
  searchPlaceholder = 'Search options...',
  reducedMotion = false,
}) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 180);
  const searchEnabled = searchable || options.length >= 12;

  const filteredOptions = useMemo(() => {
    if (!searchEnabled || !debouncedQuery.trim()) return options;
    const needle = debouncedQuery.trim().toLowerCase();
    return options.filter((opt) => {
      const haystack = [
        opt.label,
        opt.example || '',
        ...(Array.isArray(opt.keywords) ? opt.keywords : []),
      ].join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }, [debouncedQuery, options, searchEnabled]);

  return (
    <>
      {searchEnabled && (
        <div className="option-search-wrap glass-search">
          <span className="option-search-icon">⌕</span>
          <input
            className="option-search-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={`Search options for ${answerKey}`}
          />
        </div>
      )}
      <div className={`opt-${layout}`}>
        {filteredOptions.map((opt) => (
          <OptionButton
            key={opt.value}
            opt={opt}
            selected={answers[answerKey] === opt.value}
            layout={layout}
            onSelect={() => onAnswer(answerKey, opt.value)}
            reducedMotion={reducedMotion}
          />
        ))}
      </div>
      {searchEnabled && filteredOptions.length === 0 && (
        <p className="option-search-empty">No options matched your search.</p>
      )}
    </>
  );
}

export default function Wizard({ onFinish, onProgress, initialAnswers }) {
  const { t } = useLanguage();
  const prefersReducedMotion = useReducedMotion();
  const initialAnswerState = useMemo(() => (initialAnswers || {}), [initialAnswers]);
  const [answers, setAnswers] = useState(initialAnswerState);
  const [steps, setSteps] = useState(() => fallbackQuestionBank);
  const [currentIdx, setCurrentIdx] = useState(() => getFirstApplicableIndex(fallbackQuestionBank, initialAnswerState));
  const [history, setHistory] = useState([]);
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    let active = true;
    getQuestionBank()
      .then((res) => {
        if (!active) return;
        const nextSteps = Array.isArray(res?.data) && res.data.length > 0 ? res.data : fallbackQuestionBank;
        setSteps(nextSteps);
        setHistory([]);
        setCurrentIdx(getFirstApplicableIndex(nextSteps, initialAnswerState));
      })
      .catch(() => {
        if (!active) return;
        setSteps(fallbackQuestionBank);
      });
    return () => {
      active = false;
    };
  }, [initialAnswerState]);

  const step = steps[currentIdx];

  const handleAnswer = useCallback((key, value) => {
    setAnswers((prev) => {
      const next = { ...prev, [key]: value };
      if (onProgress) onProgress(next);
      return next;
    });
  }, [onProgress]);

  const visibleCount = useMemo(() => Math.max(1, steps.filter((s) => isApplicable(s, answers)).length), [answers, steps]);
  const visibleNum = useMemo(() => {
    let n = 0;
    for (let i = 0; i <= currentIdx; i += 1) {
      if (isApplicable(steps[i], answers)) n += 1;
    }
    return Math.max(1, n);
  }, [answers, currentIdx, steps]);
  const pct = Math.round((visibleNum / visibleCount) * 100);

  const isLastVisible = useMemo(() => {
    if (!step) return false;
    for (let i = currentIdx + 1; i < steps.length; i += 1) {
      if (isApplicable(steps[i], answers)) return false;
    }
    return true;
  }, [answers, currentIdx, step, steps]);

  const goNext = useCallback(() => {
    if (!step || !isComplete(step, answers)) return;
    setDirection(1);
    setHistory((prev) => [...prev, currentIdx]);
    let next = currentIdx + 1;
    while (next < steps.length && !isApplicable(steps[next], answers)) next += 1;
    if (next >= steps.length) {
      onFinish(answers);
    } else {
      setCurrentIdx(next);
    }
  }, [answers, currentIdx, onFinish, step, steps]);

  const goBack = useCallback(() => {
    if (history.length === 0) return;
    setDirection(-1);
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setCurrentIdx(prev);
  }, [history]);

  if (!step) {
    return (
      <div className="card">
        <h3>Question set unavailable</h3>
        <p>Please refresh and try again.</p>
      </div>
    );
  }

  const complete = isComplete(step, answers);
  const stepLayout = getLayoutFromType(step.type, step.layout || 'list');

  return (
    <motion.div
      className="wizard"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -30, transition: { duration: 0.25 } }}
      role="form"
      aria-label="CRS Calculator wizard"
    >

      <div className="progress-bar-wrap">
        <div className="progress-info">
          <span>{t('wizard.step')} {visibleNum} {t('wizard.of')} {visibleCount}</span>
        </div>
        <StepProgressBar pct={pct} />
      </div>

      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={step.id}
          className="step-wrap"
          custom={direction}
          variants={pageVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 200, damping: 26 }}
        >
          <span className="step-label">{step.label}</span>
          <h2 className="step-title">{step.title} {step.helpTip && <HelpTip text={step.helpTip} />}</h2>
          {step.subtitle && <p className="step-subtitle">{step.subtitle}</p>}

          {step.hasNOCSearch && (
            <NOCSearch onSelect={(teer) => handleAnswer(step.answerKey, teer)} />
          )}

          {(step.type === 'single' || step.type === 'grid' || step.type === 'grid-wide') && (
            <OptionList
              options={step.options}
              answerKey={step.answerKey}
              layout={stepLayout}
              answers={answers}
              onAnswer={handleAnswer}
              searchable={step.searchable}
              searchPlaceholder={step.searchPlaceholder}
              reducedMotion={prefersReducedMotion}
            />
          )}

          {step.type === 'grouped' && step.groups.map((group) => (
            <div className="question-group" key={group.answerKey}>
              <h3>{group.title}</h3>
              <OptionList
                options={group.options}
                answerKey={group.answerKey}
                layout={getLayoutFromType(group.type, 'list')}
                answers={answers}
                onAnswer={handleAnswer}
                searchable={group.searchable}
                searchPlaceholder={group.searchPlaceholder}
                reducedMotion={prefersReducedMotion}
              />
            </div>
          ))}
        </motion.div>
      </AnimatePresence>

      <div className="wizard-nav">
        {history.length > 0 && (
          <motion.button type="button" className="btn-back" onClick={goBack} whileHover={prefersReducedMotion ? undefined : { x: -3 }} whileTap={prefersReducedMotion ? undefined : { scale: 0.95 }} aria-label="Go back">
            {t('wizard.back')}
          </motion.button>
        )}
        <StarBorder color="var(--primary)" speed="5s">
          <motion.button
            type="button"
            className={`btn-next${isLastVisible ? ' finish' : ''}`}
            disabled={!complete}
            onClick={goNext}
            whileHover={complete && !prefersReducedMotion ? { scale: 1.02 } : undefined}
            whileTap={complete && !prefersReducedMotion ? { scale: 0.97 } : undefined}
            aria-label={isLastVisible ? 'Calculate score' : 'Next step'}
          >
            {isLastVisible ? t('wizard.calculate') : t('wizard.next')}
          </motion.button>
        </StarBorder>
      </div>
    </motion.div>
  );
}

