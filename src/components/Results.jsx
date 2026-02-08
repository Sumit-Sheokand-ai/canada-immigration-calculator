import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { calculate, recalcWith } from '../scoring/scoring';
import { generateSuggestions, estimateTimeline } from '../scoring/suggestions';
import { latestDraws, pathways, categoryBasedInfo } from '../data/crsData';
import { useLanguage } from '../i18n/LanguageContext';
import { encodeAnswers } from '../App';

const stagger = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } };
const fadeUp = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 100, damping: 18 } } };

/* ── Animated counter ── */
function AnimatedNumber({ value, duration = 1.2 }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const end = value;
    const startTime = performance.now();
    const tick = (now) => {
      const elapsed = (now - startTime) / (duration * 1000);
      if (elapsed >= 1) { setDisplay(end); return; }
      const ease = 1 - Math.pow(1 - elapsed, 3);
      setDisplay(Math.round(end * ease));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [value, duration]);
  return <>{display}</>;
}

/* ── Score Gauge SVG ── */
function ScoreGauge({ score, statusColor }) {
  const r = 54, circ = 2 * Math.PI * r;
  const pct = Math.min(score / 1200, 1);
  return (
    <div className="score-gauge" aria-label={`CRS Score: ${score} out of 1200`}>
      <svg viewBox="0 0 120 120" width="180" height="180">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="8" />
        <motion.circle
          cx="60" cy="60" r={r} fill="none" stroke={statusColor} strokeWidth="8"
          strokeLinecap="round" transform="rotate(-90 60 60)"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - pct * circ }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="gauge-text">
        <div className="gauge-number" aria-live="polite"><AnimatedNumber value={score} /></div>
        <div className="gauge-max">/ 1,200</div>
      </div>
    </div>
  );
}

/* ── Breakdown Bar ── */
function BreakdownItem({ icon, label, value, max, note }) {
  const pct = Math.round((value / max) * 100);
  return (
    <motion.div className="bd-item" variants={fadeUp}>
      <span className="bd-icon">{icon}</span>
      <div className="bd-info">
        <div className="bd-top">
          <span className="bd-label">{label}{note && <small className="bd-note"> ({note})</small>}</span>
          <span className="bd-pts">{value} <small>/ {max}</small></span>
        </div>
        <div className="bd-bar-bg">
          <motion.div
            className="bd-bar-fill"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.8, delay: 0.3, ease: 'easeOut' }}
          />
        </div>
      </div>
    </motion.div>
  );
}

/* ── Draw Row ── */
function DrawRow({ draw, userScore }) {
  const above = userScore >= draw.score;
  return (
    <div className={`draw-row ${above ? 'draw-above' : 'draw-below'}`}>
      <span className="draw-date">{draw.date}</span>
      <span className="draw-program">{draw.program}</span>
      <span className="draw-score">{draw.score}</span>
    </div>
  );
}

/* ── What-If Comparison ── */
const wiEducationOpts = [
  { value: 'secondary', label: 'High School' },
  { value: 'one_year_post', label: '1-Year Diploma' },
  { value: 'two_year_post', label: '2-Year Diploma' },
  { value: 'bachelors', label: "Bachelor's" },
  { value: 'two_or_more', label: '2+ Credentials' },
  { value: 'masters', label: "Master's" },
  { value: 'doctoral', label: 'PhD' },
];

function WhatIfPanel({ answers, originalScore, t }) {
  const [wiAge, setWiAge] = useState(answers.age || '');
  const [wiEdu, setWiEdu] = useState(answers.education || '');
  const [wiCWE, setWiCWE] = useState(answers.canadianWorkExp || '0');
  const [wiCLB, setWiCLB] = useState('');

  const projected = useMemo(() => {
    const overrides = {};
    if (wiAge && wiAge !== answers.age) overrides.age = wiAge;
    if (wiEdu && wiEdu !== answers.education) overrides.education = wiEdu;
    if (wiCWE && wiCWE !== answers.canadianWorkExp) overrides.canadianWorkExp = wiCWE;
    if (wiCLB) {
      const skills = ['listening', 'reading', 'writing', 'speaking'];
      const prefix = answers.langTestType === 'celpip' ? 'celpip' : 'ielts';
      for (const s of skills) {
        const key = `${prefix}_${s}`;
        if (answers.langTestType === 'celpip') {
          overrides[key] = String(Math.max(parseInt(answers[key]) || 0, parseInt(wiCLB)));
        } else {
          overrides[key] = String(Math.max(parseFloat(answers[key]) || 0, parseFloat(wiCLB)));
        }
      }
    }
    if (Object.keys(overrides).length === 0) return null;
    return recalcWith(answers, overrides);
  }, [answers, wiAge, wiEdu, wiCWE, wiCLB]);

  const delta = projected ? projected.total - originalScore : 0;

  return (
    <div className="whatif-panel">
      <div className="wi-grid">
        <label className="wi-field">
          <span>Age</span>
          <select value={wiAge} onChange={e => setWiAge(e.target.value)}>
            <option value="">Current</option>
            {Array.from({ length: 30 }, (_, i) => i + 18).map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
        <label className="wi-field">
          <span>Education</span>
          <select value={wiEdu} onChange={e => setWiEdu(e.target.value)}>
            <option value="">Current</option>
            {wiEducationOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="wi-field">
          <span>Canadian Work (yrs)</span>
          <select value={wiCWE} onChange={e => setWiCWE(e.target.value)}>
            {[0,1,2,3,4,5].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label className="wi-field">
          <span>Min Language CLB</span>
          <select value={wiCLB} onChange={e => setWiCLB(e.target.value)}>
            <option value="">Current</option>
            {[5,6,7,8,9,10].map(c => <option key={c} value={c}>CLB {c}+</option>)}
          </select>
        </label>
      </div>
      {projected && (
        <motion.div className="wi-result" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="wi-scores">
            <div className="wi-score-block">
              <small>{t('results.original')}</small>
              <strong>{originalScore}</strong>
            </div>
            <span className="wi-arrow">→</span>
            <div className="wi-score-block projected">
              <small>{t('results.projected')}</small>
              <strong>{projected.total}</strong>
            </div>
            <span className={`wi-delta ${delta > 0 ? 'pos' : delta < 0 ? 'neg' : ''}`}>
              {delta > 0 ? '+' : ''}{delta} pts
            </span>
          </div>
        </motion.div>
      )}
    </div>
  );
}

/* ── Loading Screen ── */
const LOAD_PHASES = [
  'Analyzing profile',
  'Calculating core factors',
  'Evaluating language scores',
  'Computing skill transferability',
  'Checking eligibility',
  'Finalizing CRS score',
];

function LoadingScreen() {
  const [progress, setProgress] = useState(0);
  const [phaseIdx, setPhaseIdx] = useState(0);

  useEffect(() => {
    let raf;
    const start = performance.now();
    const dur = 2200;
    const tick = (now) => {
      const t = Math.min((now - start) / dur, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setProgress(Math.round(ease * 100));
      setPhaseIdx(Math.min(Math.floor(ease * LOAD_PHASES.length), LOAD_PHASES.length - 1));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* Zigzag tube: 8 segments, each ~53px long, total ~425 */
  const tube = 'M 0,45 L 40,10 L 80,45 L 120,10 L 160,45 L 200,10 L 240,45 L 280,10 L 320,45';
  const tubeLen = 425;
  const off = tubeLen * (1 - progress / 100);

  return (
    <motion.div className="loading-screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.3 } }}>
      <div className="loader-pulse" />

      {/* Percentage */}
      <div className="loader-pct-wrap">
        <span className="loader-num">{progress}</span>
        <span className="loader-pct-sign">%</span>
      </div>

      {/* 3D Zigzag Glass Tube */}
      <div className="tube-perspective">
        <svg viewBox="-4 -4 328 58" className="tube-svg" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="tubeGlass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="white" stopOpacity="0.18" />
              <stop offset="40%" stopColor="white" stopOpacity="0.04" />
              <stop offset="100%" stopColor="white" stopOpacity="0.10" />
            </linearGradient>
            <linearGradient id="waterGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--primary)" />
              <stop offset="50%" stopColor="var(--accent)" />
              <stop offset="100%" stopColor="var(--primary)" />
            </linearGradient>
            <linearGradient id="waterShine" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="white" stopOpacity="0.35" />
              <stop offset="50%" stopColor="white" stopOpacity="0" />
              <stop offset="100%" stopColor="white" stopOpacity="0.08" />
            </linearGradient>
            <filter id="tubeGlow">
              <feGaussianBlur stdDeviation="4" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="innerShadow">
              <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur" />
              <feOffset dx="0" dy="2" result="shifted" />
              <feComposite in2="SourceAlpha" operator="arithmetic" k2="-1" k3="1" result="shadow" />
              <feFlood floodColor="black" floodOpacity="0.2" result="color" />
              <feComposite in="color" in2="shadow" operator="in" />
            </filter>
          </defs>

          {/* 3D Shadow underneath */}
          <path d={tube} fill="none" stroke="var(--surface-3)" strokeWidth="14"
            strokeLinecap="round" strokeLinejoin="round"
            opacity="0.12" transform="translate(3, 5)" />

          {/* Glass tube outer wall */}
          <path d={tube} fill="none" stroke="var(--surface-2)" strokeWidth="14"
            strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />

          {/* Glass tube inner highlight (top reflection) */}
          <path d={tube} fill="none" stroke="url(#tubeGlass)" strokeWidth="12"
            strokeLinecap="round" strokeLinejoin="round" />

          {/* Water fill — glow layer */}
          <path d={tube} fill="none" stroke="url(#waterGrad)" strokeWidth="10"
            strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray={tubeLen} strokeDashoffset={off}
            filter="url(#tubeGlow)" opacity="0.4" className="tube-water" />

          {/* Water fill — main */}
          <path d={tube} fill="none" stroke="url(#waterGrad)" strokeWidth="8"
            strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray={tubeLen} strokeDashoffset={off}
            className="tube-water" />

          {/* Water fill — specular highlight on top */}
          <path d={tube} fill="none" stroke="url(#waterShine)" strokeWidth="4"
            strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray={tubeLen} strokeDashoffset={off}
            className="tube-water" style={{ transform: 'translateY(-1.5px)' }} />

          {/* Glass tube top reflection streak */}
          <path d={tube} fill="none" stroke="white" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round"
            opacity="0.12" style={{ transform: 'translateY(-5px)' }} />
        </svg>
      </div>

      {/* Phase text */}
      <AnimatePresence mode="wait">
        <motion.p key={phaseIdx} className="loader-phase"
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
          {LOAD_PHASES[phaseIdx]}
        </motion.p>
      </AnimatePresence>

      {/* Step dots */}
      <div className="loader-dots">
        {LOAD_PHASES.map((_, i) => (
          <div key={i} className={`loader-dot${i <= phaseIdx ? ' active' : ''}`} />
        ))}
      </div>
    </motion.div>
  );
}

/* ── Main Results ── */
export default function Results({ answers, onRestart }) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [showMoreSuggestions, setShowMoreSuggestions] = useState(false);
  const [drawsOpen, setDrawsOpen] = useState(false);
  const [whatifOpen, setWhatifOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 2500);
    return () => clearTimeout(timer);
  }, []);

  const result = useMemo(() => {
    if (answers.knowsScore === 'yes') {
      const approxScore = parseInt(answers.scoreRange) || 400;
      return {
        total: approxScore,
        breakdown: { coreHumanCapital: approxScore, spouseFactors: 0, skillTransferability: 0, additionalPoints: 0 },
        details: { age: 0, education: 0, firstLanguage: 0, secondLanguage: 0, canadianWork: 0, foreignWork: 0, spouseTotal: 0, skillTotal: 0, additionalTotal: 0 }
      };
    }
    return calculate(answers);
  }, [answers]);

  const isSelfCalc = answers.knowsScore !== 'yes';
  const score = result.total;
  const cutoff = latestDraws.averageCutoff;
  const diff = score - cutoff;

  const status = diff >= 20
    ? { cls: 'above', marker: '+', title: 'Great News!', desc: `Your score is ${diff} points above the recent cut-off (${cutoff}). You have a strong chance of receiving an Invitation to Apply.`, color: '#22c55e' }
    : diff >= -10
    ? { cls: 'close', marker: '~', title: 'Almost There!', desc: `You're just ${Math.abs(diff)} points ${diff >= 0 ? 'above' : 'below'} the recent cut-off (${cutoff}). A few small improvements could make the difference.`, color: '#f59e0b' }
    : { cls: 'below', marker: '—', title: 'Room to Improve', desc: `You're ${Math.abs(diff)} points below the recent cut-off (${cutoff}). Don't worry — see the suggestions below to boost your score.`, color: '#ef4444' };

  const suggestions = useMemo(() => generateSuggestions(answers, result), [answers, result]);
  const timeline = useMemo(() => estimateTimeline(result), [result]);
  const d = result.details;

  const breakdownItems = useMemo(() => {
    const items = [
      { icon: 'A', label: 'Age', value: d.age, max: 110 },
      { icon: 'E', label: 'Education', value: d.education, max: 150 },
      { icon: 'L', label: 'English Language', value: d.firstLanguage, max: 136 },
      { icon: 'W', label: 'Canadian Work', value: d.canadianWork, max: 80 },
    ];
    if (d.secondLanguage > 0) items.splice(3, 0, { icon: 'F', label: 'French', value: d.secondLanguage, max: 24 });
    if (d.foreignWork > 0) items.push({ icon: 'S', label: t('results.foreignWork'), value: d.skillTotal, max: 100, note: 'via skill transferability' });
    else items.push({ icon: 'S', label: 'Skill Bonus', value: d.skillTotal, max: 100 });
    if (d.spouseTotal > 0) items.push({ icon: 'P', label: 'Spouse', value: d.spouseTotal, max: 40 });
    if (d.additionalTotal > 0) items.push({ icon: '+', label: 'Bonus Points', value: d.additionalTotal, max: 600 });
    return items;
  }, [d, t]);

  const topSuggestions = suggestions.slice(0, 3);
  const moreSuggestions = suggestions.slice(3);
  const pw = answers.pathway;
  const pwInfo = pathways[pw];

  // Share link
  const shareUrl = `${window.location.origin}${window.location.pathname}#${encodeAnswers(answers)}`;

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'My CRS Score', text: `My CRS score is ${score}/1200!`, url: shareUrl });
        return;
      }
    } catch {}
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // Fallback for HTTP / older browsers
      const ta = document.createElement('textarea');
      ta.value = shareUrl;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePDF = () => window.print();

  if (loading) return <LoadingScreen />;

  return (
    <motion.div className="results" variants={stagger} initial="hidden" animate="show" exit={{ opacity: 0, transition: { duration: 0.2 } }}>
      {/* Score Hero */}
      <motion.div className="score-hero" variants={fadeUp}>
        <ScoreGauge score={score} statusColor={status.color} />
      </motion.div>

      {/* Action Buttons */}
      <motion.div className="result-actions" variants={fadeUp}>
        <button className="action-btn" onClick={handleShare} aria-label="Share results">
          {copied ? '✓ Copied!' : t('results.share')}
        </button>
        <button className="action-btn" onClick={handlePDF} aria-label="Download PDF">
          {t('results.pdf')}
        </button>
      </motion.div>

      {/* Status Card */}
      <motion.div className={`card status-card ${status.cls}-card`} variants={fadeUp}>
        <div className="status-header"><span className={`status-marker ${status.cls}`}>{status.marker}</span> <strong>{status.title}</strong></div>
        <p className="status-desc">{status.desc}</p>
        <div className="cutoff-compare">
          <CutoffBar label="Your Score" value={score} max={Math.max(score, cutoff, 600)} color="var(--primary)" />
          <CutoffBar label="Cut-off" value={cutoff} max={Math.max(score, cutoff, 600)} color="var(--surface-3)" />
        </div>
      </motion.div>

      {/* Breakdown */}
      {isSelfCalc && (
        <motion.div className="card" variants={fadeUp}>
          <h3>{t('results.breakdown')}</h3>
          <motion.div className="breakdown-grid" variants={stagger} initial="hidden" animate="show">
            {breakdownItems.map(it => <BreakdownItem key={it.label} {...it} />)}
          </motion.div>
          <div className="bd-total">
            <span>Total CRS Score</span>
            <span className="bd-total-num">{score}</span>
          </div>
        </motion.div>
      )}

      {/* What-If */}
      {isSelfCalc && (
        <motion.div className="card whatif-card" variants={fadeUp}>
          <h3 className="draws-toggle" onClick={() => setWhatifOpen(!whatifOpen)}>
            {t('results.whatif')} <span className="toggle-arrow">{whatifOpen ? '▲' : '▼'}</span>
          </h3>
          {whatifOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <p className="cat-intro">{t('results.whatifDesc')}</p>
              <WhatIfPanel answers={answers} originalScore={score} t={t} />
            </motion.div>
          )}
        </motion.div>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <motion.div className="card" variants={fadeUp}>
          <h3>{t('results.improve')}</h3>
          {topSuggestions.map((sug, i) => (
            <motion.div className="action-card" key={i} variants={fadeUp}>
              <div className="action-rank">{i + 1}</div>
              <div className="action-body">
                <div className="action-title">
                  {sug.title}
                  {sug.potentialGain > 0 && <span className="action-badge">+{sug.potentialGain} pts</span>}
                </div>
                <div className="action-desc">{sug.description}</div>
                <div className="action-meta">
                  <span className="action-time">{sug.timeframe}</span>
                  <span className={`action-diff diff-${sug.difficulty.toLowerCase()}`}>{sug.difficulty}</span>
                </div>
              </div>
            </motion.div>
          ))}
          {moreSuggestions.length > 0 && (
            <>
              {showMoreSuggestions && moreSuggestions.map((sug, i) => (
                <motion.div className="action-card" key={i + 3} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="action-rank">{i + 4}</div>
                  <div className="action-body">
                    <div className="action-title">
                      {sug.title}
                      {sug.potentialGain > 0 && <span className="action-badge">+{sug.potentialGain} pts</span>}
                    </div>
                    <div className="action-desc">{sug.description}</div>
                    <div className="action-meta">
                      <span className="action-time">{sug.timeframe}</span>
                      <span className={`action-diff diff-${sug.difficulty.toLowerCase()}`}>{sug.difficulty}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
              <button className="btn-toggle" onClick={() => setShowMoreSuggestions(!showMoreSuggestions)}>
                {showMoreSuggestions ? 'Show fewer ▲' : `Show ${moreSuggestions.length} more suggestions ▼`}
              </button>
            </>
          )}
        </motion.div>
      )}

      {/* Category Draws */}
      {isSelfCalc && (
        <motion.div className="card" variants={fadeUp}>
          <h3>{t('results.category')}</h3>
          <p className="cat-intro">{t('results.catIntro')}</p>
          <div className="cat-grid">
            {categoryBasedInfo.map(cat => {
              const eligible = cat.check(answers);
              const aboveCutoff = eligible && score >= cat.recentCutoff;
              return (
                <motion.div key={cat.id} className={`cat-card ${eligible ? (aboveCutoff ? 'cat-above' : 'cat-eligible') : 'cat-na'}`} variants={fadeUp}>
                  <div className="cat-header">
                    <span className="cat-icon">{cat.icon}</span>
                    <div>
                      <strong className="cat-name">{cat.name}</strong>
                    {eligible && <span className={`cat-badge ${aboveCutoff ? 'badge-above' : 'badge-eligible'}`}>{aboveCutoff ? 'Above Cutoff' : 'Eligible'}</span>}
                      {!eligible && <span className="cat-badge badge-na">Not Eligible</span>}
                    </div>
                  </div>
                  <p className="cat-desc">{cat.description}</p>
                  <div className="cat-cutoff">
                    <span>Recent cutoff: <strong>{cat.recentCutoff}</strong></span>
                    <span className="cat-range">Range: {cat.cutoffRange}</span>
                  </div>
                  {eligible && (
                    <div className="cat-compare">
                      <div className="cat-bar-wrap">
                        <motion.div className={`cat-bar ${aboveCutoff ? 'bar-above' : 'bar-below'}`} initial={{ width: 0 }}
                          animate={{ width: `${Math.min((score / Math.max(score, cat.recentCutoff + 50)) * 100, 100)}%` }}
                          transition={{ duration: 0.8, ease: 'easeOut' }} />
                        <div className="cat-marker" style={{ left: `${(cat.recentCutoff / Math.max(score, cat.recentCutoff + 50)) * 100}%` }} />
                      </div>
                      <div className="cat-labels">
                        <span>Your score: {score}</span>
                        <span>Cutoff: {cat.recentCutoff}</span>
                      </div>
                    </div>
                  )}
                  {!eligible && <p className="cat-req">{cat.eligibility}</p>}
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Timeline */}
      <motion.div className="card" variants={fadeUp}>
        <h3>{t('results.timeline')}</h3>
        <div className={`timeline-badge tl-${status.cls}`}>
          <strong>{timeline.label}</strong> — est. {timeline.months} months
        </div>
        <p className="timeline-desc">{timeline.description}</p>
      </motion.div>

      {/* Recent Draws */}
      <motion.div className="card" variants={fadeUp}>
        <h3 className="draws-toggle" onClick={() => setDrawsOpen(!drawsOpen)}>
          {t('results.draws')} <span className="toggle-arrow">{drawsOpen ? '▲' : '▼'}</span>
        </h3>
        {drawsOpen && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="draws-content">
            <h4 className="draws-subhead">General / CEC Draws</h4>
            {latestDraws.generalProgram.slice(0, 4).map((dr, i) => <DrawRow key={`g${i}`} draw={dr} userScore={score} />)}
            <h4 className="draws-subhead">Category-Based Draws</h4>
            {latestDraws.categoryBased.slice(0, 4).map((dr, i) => <DrawRow key={`c${i}`} draw={dr} userScore={score} />)}
            {latestDraws.pnpDraws?.length > 0 && (
              <>
                <h4 className="draws-subhead">Provincial Nominee (PNP)</h4>
                {latestDraws.pnpDraws.slice(0, 3).map((dr, i) => <DrawRow key={`p${i}`} draw={dr} userScore={score} />)}
              </>
            )}
          </motion.div>
        )}
      </motion.div>

      {/* Pathway Info */}
      {pwInfo && (
        <motion.div className="card" variants={fadeUp}>
          <h3>{pwInfo.name} Requirements</h3>
          <ul className="pathway-list">{pwInfo.requirements.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </motion.div>
      )}

      {/* Disclaimer */}
      <motion.div className="card disclaimer" variants={fadeUp}>
        <p><strong>Disclaimer:</strong> {t('results.disclaimer')} <a href="https://www.canada.ca/en/immigration-refugees-citizenship.html" target="_blank" rel="noopener noreferrer">canada.ca</a></p>
      </motion.div>

      {/* Restart */}
      <motion.button className="btn-restart" onClick={onRestart} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }} variants={fadeUp}>
        {t('results.restart')}
      </motion.button>
    </motion.div>
  );
}

function CutoffBar({ label, value, max, color }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="cutoff-row">
      <span className="cutoff-label">{label}</span>
      <div className="cutoff-bar-wrap">
        <motion.div className="cutoff-bar" style={{ background: color }} initial={{ width: 0 }}
          animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: 'easeOut' }}>
          {value}
        </motion.div>
      </div>
    </div>
  );
}
