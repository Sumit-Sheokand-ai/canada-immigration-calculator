import { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { calculate, recalcWith } from '../scoring/scoring';
import { generateSuggestions, estimateTimeline } from '../scoring/suggestions';
import { pathways } from '../data/crsData';
import { recommendProvinces } from '../data/provinceData';
import { useLanguage } from '../i18n/LanguageContext';
import { listSavedProfiles, saveProfileLocal } from '../utils/profileStore';
import { readAccountSettings, saveAccountSettings } from '../utils/accountSettings';
import { isCloudProfilesEnabled, listProfilesForUser, upsertProfileCloud } from '../utils/cloudProfiles';
import { getFallbackCategoryDrawInfo, getFallbackLatestDraws } from '../utils/drawDataSource';
import { useAuth } from '../context/AuthContext';
import Loader from './Loader';
const PathCoach = lazy(() => import('./PathCoach'));

const stagger = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } };
const fadeUp = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 100, damping: 18 } } };

function getDrawSourceLabel(source) {
  if (source === 'supabase') return 'Live sync';
  return 'Local fallback';
}

function getDrawSourceClass(source) {
  return source === 'supabase' ? 'draw-source-live' : 'draw-source-fallback';
}
function parseIsoDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function describeFreshness(value) {
  const date = parseIsoDate(value);
  if (!date) return { tier: 'unknown', label: 'Freshness unknown', dateLabel: value || '—' };
  const now = new Date();
  const diffMs = Math.max(now.getTime() - date.getTime(), 0);
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const label = days === 0 ? 'Updated today' : days === 1 ? 'Updated 1 day ago' : `Updated ${days} days ago`;
  if (days <= 2) return { tier: 'fresh', label, dateLabel: date.toLocaleDateString() };
  if (days <= 14) return { tier: 'recent', label, dateLabel: date.toLocaleDateString() };
  return { tier: 'stale', label, dateLabel: date.toLocaleDateString() };
}
function summarizeProfileAnswers(profileAnswers = {}) {
  return [
    { label: 'Age', value: profileAnswers.age || '—' },
    { label: 'Education', value: profileAnswers.education || '—' },
    { label: 'Language test', value: profileAnswers.langTestType || '—' },
    { label: 'Canadian work', value: profileAnswers.canadianWorkExp || '0' },
    { label: 'Program', value: profileAnswers.pathway || '—' },
  ];
}

function AnimatedNumber({ value, duration = 1.2, reduceMotion = false }) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    if (reduceMotion) return undefined;
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
  }, [value, duration, reduceMotion]);
  if (reduceMotion) return <>{value}</>;
  return <>{display}</>;
}
function ScoreGauge({ score, statusColor, reduceMotion = false }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(score / 1200, 1);
  return (
    <div className="score-gauge" aria-label={`CRS Score: ${score} out of 1200`}>
      <svg viewBox="0 0 120 120" width="180" height="180">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="8" />
        <motion.circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={statusColor}
          strokeWidth="8"
          strokeLinecap="round"
          transform="rotate(-90 60 60)"
          strokeDasharray={circ}
          initial={reduceMotion ? false : { strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - pct * circ }}
          transition={reduceMotion ? { duration: 0 } : { duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="gauge-text">
        <div className="gauge-number" aria-live="polite"><AnimatedNumber value={score} reduceMotion={reduceMotion} /></div>
        <div className="gauge-max">/ 1,200</div>
      </div>
    </div>
  );
}

function SectionToggleHeader({ id, label, open, onToggle }) {
  return (
    <h3 className="section-toggle-heading">
      <button
        type="button"
        className="section-toggle"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={id}
      >
        <span>{label}</span>
        <span className="toggle-arrow" aria-hidden="true">▾</span>
      </button>
    </h3>
  );
}

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
          <motion.div className="bd-bar-fill" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, delay: 0.3, ease: 'easeOut' }} />
        </div>
      </div>
    </motion.div>
  );
}

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

const scenarioEducationOpts = [
  { value: 'secondary', label: 'High School' },
  { value: 'one_year_post', label: '1-Year Diploma' },
  { value: 'two_year_post', label: '2-Year Diploma' },
  { value: 'bachelors', label: "Bachelor's" },
  { value: 'two_or_more', label: '2+ Credentials' },
  { value: 'masters', label: "Master's" },
  { value: 'doctoral', label: 'PhD' },
];

function createScenario(id, label, answers) {
  return {
    id,
    label,
    age: answers.age || '',
    education: answers.education || '',
    canadianWorkExp: answers.canadianWorkExp || '0',
    minClb: '',
  };
}

function ieltsBandForClb(clb) {
  const map = { 5: 5.0, 6: 5.5, 7: 6.0, 8: 6.5, 9: 7.0, 10: 7.5 };
  return map[clb] || 0;
}

function projectScenario(answers, scenario) {
  const overrides = {};
  if (scenario.age && scenario.age !== answers.age) overrides.age = scenario.age;
  if (scenario.education && scenario.education !== answers.education) overrides.education = scenario.education;
  if (scenario.canadianWorkExp && scenario.canadianWorkExp !== answers.canadianWorkExp) overrides.canadianWorkExp = scenario.canadianWorkExp;
  if (scenario.minClb) {
    const targetClb = parseInt(scenario.minClb, 10);
    const skills = ['listening', 'reading', 'writing', 'speaking'];
    if (answers.langTestType === 'celpip') {
      for (const s of skills) {
        const key = `celpip_${s}`;
        overrides[key] = String(Math.max(parseInt(answers[key], 10) || 0, targetClb));
      }
    } else {
      const targetBand = ieltsBandForClb(targetClb);
      for (const s of skills) {
        const key = `ielts_${s}`;
        overrides[key] = String(Math.max(parseFloat(answers[key]) || 0, targetBand));
      }
    }
  }
  if (Object.keys(overrides).length === 0) return null;
  return recalcWith(answers, overrides);
}

function ScenarioComparePanel({ answers, originalScore, t }) {
  const [scenarios, setScenarios] = useState(() => [
    createScenario('a', 'Scenario A', answers),
    createScenario('b', 'Scenario B', answers),
  ]);

  const addScenario = () => {
    if (scenarios.length >= 3) return;
    setScenarios(prev => [...prev, createScenario('c', 'Scenario C', answers)]);
  };
  const removeScenario = (id) => {
    if (scenarios.length <= 2) return;
    setScenarios(prev => prev.filter(s => s.id !== id));
  };
  const updateScenario = (id, patch) => {
    setScenarios(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)));
  };

  return (
    <div className="scenario-panel">
      <div className="scenario-grid">
        {scenarios.map((scenario) => {
          const projected = projectScenario(answers, scenario);
          const delta = projected ? projected.total - originalScore : 0;
          return (
            <div className="scenario-card" key={scenario.id}>
              <div className="scenario-head">
                <strong>{scenario.label}</strong>
                {scenario.id === 'c' && (
                  <button type="button" className="scenario-remove" onClick={() => removeScenario(scenario.id)}>Remove</button>
                )}
              </div>
              <div className="wi-grid">
                <label className="wi-field">
                  <span>Age</span>
                  <select value={scenario.age} onChange={e => updateScenario(scenario.id, { age: e.target.value })}>
                    <option value="">Current</option>
                    {Array.from({ length: 30 }, (_, i) => i + 18).map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </label>
                <label className="wi-field">
                  <span>Education</span>
                  <select value={scenario.education} onChange={e => updateScenario(scenario.id, { education: e.target.value })}>
                    <option value="">Current</option>
                    {scenarioEducationOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
                <label className="wi-field">
                  <span>Canadian Work (yrs)</span>
                  <select value={scenario.canadianWorkExp} onChange={e => updateScenario(scenario.id, { canadianWorkExp: e.target.value })}>
                    {[0, 1, 2, 3, 4, 5].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </label>
                <label className="wi-field">
                  <span>Min Language CLB</span>
                  <select value={scenario.minClb} onChange={e => updateScenario(scenario.id, { minClb: e.target.value })}>
                    <option value="">Current</option>
                    {[5, 6, 7, 8, 9, 10].map(c => <option key={c} value={c}>CLB {c}+</option>)}
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
        })}
      </div>
      {scenarios.length < 3 && (
        <button type="button" className="btn-toggle scenario-add-btn" onClick={addScenario}>
          Add Scenario C ▼
        </button>
      )}
    </div>
  );
}

function LoadingScreen() {
  return (
    <motion.div className="loading-screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.3 } }}>
      <Loader />
    </motion.div>
  );
}

function useConfetti(trigger) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!trigger) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const colors = ['#22c55e', '#4CC9F0', '#7C3AED', '#f59e0b', '#ec4899', '#3A0CA3'];
    const pieces = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      w: Math.random() * 8 + 4,
      h: Math.random() * 6 + 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 4,
      vy: Math.random() * 3 + 2,
      rot: Math.random() * 360,
      rv: (Math.random() - 0.5) * 8,
    }));
    let raf;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      for (const p of pieces) {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.rv;
        p.vy += 0.05;
        if (p.y < canvas.height + 20) alive = true;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (alive) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    const cleanup = setTimeout(() => {
      cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }, 4000);
    return () => { cancelAnimationFrame(raf); clearTimeout(cleanup); };
  }, [trigger]);
  return canvasRef;
}


export default function Results({ answers, onRestart, drawData, drawSource = 'local-fallback', categoryInfo, motionIntensity = 'full' }) {
  const { t } = useLanguage();
  const prefersReducedMotion = useReducedMotion() || motionIntensity === 'off';
  const { user, isAuthenticated } = useAuth();
  const accountSettings = useMemo(() => readAccountSettings(), []);
  const activeDraws = drawData || getFallbackLatestDraws();
  const activeCategoryInfo = useMemo(
    () => (Array.isArray(categoryInfo) && categoryInfo.length > 0 ? categoryInfo : getFallbackCategoryDrawInfo()),
    [categoryInfo]
  );
  const [loading, setLoading] = useState(true);
  const [showMoreSuggestions, setShowMoreSuggestions] = useState(false);
  const [drawsOpen, setDrawsOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [provOpen, setProvOpen] = useState(false);
  const [profileCompareOpen, setProfileCompareOpen] = useState(false);
  const [savedProfiles, setSavedProfiles] = useState(() => listSavedProfiles());
  const [profileAId, setProfileAId] = useState('__current__');
  const [profileBId, setProfileBId] = useState(() => listSavedProfiles()[0]?.id || '__current__');

  const [saveName, setSaveName] = useState(() => accountSettings.profileName || '');
  const [saveEmail, setSaveEmail] = useState(() => accountSettings.contactEmail || '');
  const [saveAlerts, setSaveAlerts] = useState(() => !!accountSettings.defaultDrawAlerts);
  const [saveStatus, setSaveStatus] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [syncedProfiles, setSyncedProfiles] = useState([]);
  const [syncedProfilesStatus, setSyncedProfilesStatus] = useState('idle');
  const shouldAutoSync = accountSettings.autoSyncProfiles !== false;

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    setSavedProfiles(listSavedProfiles());
  }, []);

  const result = useMemo(() => {
    if (answers.knowsScore === 'yes') {
      const approxScore = parseInt(answers.scoreRange, 10) || 400;
      return {
        total: approxScore,
        breakdown: { coreHumanCapital: approxScore, spouseFactors: 0, skillTransferability: 0, additionalPoints: 0 },
        details: { age: 0, education: 0, firstLanguage: 0, secondLanguage: 0, canadianWork: 0, foreignWork: 0, spouseTotal: 0, skillTotal: 0, additionalTotal: 0 },
      };
    }
    return calculate(answers);
  }, [answers]);

  const isSelfCalc = answers.knowsScore !== 'yes';
  const score = result.total;
  const cutoff = activeDraws.averageCutoff;
  const diff = score - cutoff;
  const cloudEnabled = isCloudProfilesEnabled();
  const drawFreshness = useMemo(() => describeFreshness(activeDraws.lastUpdated), [activeDraws.lastUpdated]);
  const categoryFreshness = useMemo(() => {
    const newestCategoryIso = activeCategoryInfo
      .map((cat) => cat?.updatedAt)
      .filter(Boolean)
      .map((value) => parseIsoDate(value))
      .filter(Boolean)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    return describeFreshness(newestCategoryIso ? newestCategoryIso.toISOString() : activeDraws.lastUpdated);
  }, [activeCategoryInfo, activeDraws.lastUpdated]);
  const categorySource = useMemo(
    () => (activeCategoryInfo.some((cat) => cat?.source === 'supabase') ? 'Live sync' : 'Local fallback'),
    [activeCategoryInfo]
  );
  const profileOptions = useMemo(
    () => [
      { id: '__current__', name: 'Current profile', score, answers },
      ...savedProfiles.map((profile) => ({
        id: profile.id,
        name: profile.name || profile.id,
        score: Number(profile.score) || 0,
        answers: profile.answers || {},
      })),
    ],
    [answers, savedProfiles, score]
  );
  const profileA = useMemo(
    () => profileOptions.find((profile) => profile.id === profileAId),
    [profileAId, profileOptions]
  );
  const profileB = useMemo(
    () => profileOptions.find((profile) => profile.id === profileBId),
    [profileBId, profileOptions]
  );
  const canCompareProfiles = !!profileA && !!profileB && profileA.id !== profileB.id;
  const profileDelta = canCompareProfiles ? profileB.score - profileA.score : 0;
  const profileAFields = useMemo(
    () => summarizeProfileAnswers(profileA?.answers || answers),
    [answers, profileA?.answers]
  );
  const profileBFields = useMemo(
    () => summarizeProfileAnswers(profileB?.answers || answers),
    [answers, profileB?.answers]
  );
  useEffect(() => {
    const hasA = profileOptions.some((profile) => profile.id === profileAId);
    const hasB = profileOptions.some((profile) => profile.id === profileBId);
    if (!hasA) setProfileAId('__current__');
    if (!hasB) {
      const nextB = profileOptions.find((profile) => profile.id !== profileAId)?.id || '__current__';
      setProfileBId(nextB);
    }
  }, [profileAId, profileBId, profileOptions]);

  useEffect(() => {
    if (!isAuthenticated || !cloudEnabled || !user?.id) {
      setSyncedProfiles([]);
      setSyncedProfilesStatus('idle');
      return;
    }
    let active = true;
    setSyncedProfilesStatus('loading');
    listProfilesForUser(user.id)
      .then((res) => {
        if (!active) return;
        if (res.status === 'ok') {
          setSyncedProfiles(res.data || []);
          setSyncedProfilesStatus('ready');
        } else {
          setSyncedProfiles([]);
          setSyncedProfilesStatus('empty');
        }
      })
      .catch(() => {
        if (!active) return;
        setSyncedProfilesStatus('error');
      });
    return () => { active = false; };
  }, [cloudEnabled, isAuthenticated, user?.id]);

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
  const pwInfo = pathways[answers.pathway];
  const provinces = useMemo(() => (isSelfCalc ? recommendProvinces(answers) : []), [answers, isSelfCalc]);
  const showConfetti = !prefersReducedMotion && !loading && diff >= 20;
  const confettiRef = useConfetti(showConfetti);


  const handleSaveProfile = async () => {
    const email = saveEmail.trim() || user?.email || '';
    if (saveAlerts && !email) {
      setSaveStatus('Add an email to enable draw alerts (or sign in).');
      return;
    }
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      setSaveStatus('Please enter a valid email address.');
      return;
    }

    const local = saveProfileLocal({
      name: saveName.trim(),
      answers,
      score,
      email,
      alertOptIn: !!saveAlerts && !!email,
    });
    setSavedProfiles(listSavedProfiles());
    const latestSettings = readAccountSettings();
    saveAccountSettings({
      ...latestSettings,
      profileName: saveName.trim(),
      contactEmail: email,
      defaultDrawAlerts: !!saveAlerts,
    });
    setSavingProfile(true);

    try {
      if (shouldAutoSync && (email || saveAlerts)) {
        const cloud = await upsertProfileCloud(local, { userId: user?.id || null });
        if (cloud.status === 'ok') {
          if (isAuthenticated && user?.id) {
            const profileRows = await listProfilesForUser(user.id);
            if (profileRows.status === 'ok') {
              setSyncedProfiles(profileRows.data || []);
              setSyncedProfilesStatus('ready');
            }
          }
          setSaveStatus(saveAlerts
            ? 'Profile saved, synced, and draw alerts subscribed.'
            : 'Profile saved and synced with your account.'
          );
        } else {
          setSaveStatus('Profile saved locally. Configure Supabase env vars to enable cloud sync/alerts.');
        }
      } else {
        setSaveStatus(shouldAutoSync
          ? 'Profile saved locally.'
          : 'Profile saved locally. Auto-sync is off in account settings.'
        );
      }
    } catch (err) {
      setSaveStatus(`Profile saved locally, but cloud sync failed: ${err.message}`);
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePDF = () => window.print();
  const scrollToSection = (sectionId) => {
    const element = document.getElementById(sectionId);
    if (!element) return;
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (loading) return <LoadingScreen />;

  return (
    <motion.div className="results" variants={stagger} initial="hidden" animate="show" exit={{ opacity: 0, transition: { duration: 0.2 } }}>
      {showConfetti && <canvas ref={confettiRef} className="confetti-canvas" />}

      <motion.div className="score-hero" variants={fadeUp}>
        <ScoreGauge score={score} statusColor={status.color} reduceMotion={prefersReducedMotion} />
      </motion.div>
      <motion.div className="result-actions" variants={fadeUp}>
        <button type="button" className="action-btn" onClick={handlePDF} aria-label="Download PDF">
          {t('results.pdf')}
        </button>
      </motion.div>

      <motion.div className="card quick-nav-card" variants={fadeUp}>
        <h3>Quick navigation</h3>
        <div className="quick-nav-grid">
          <button type="button" className="action-btn" onClick={() => scrollToSection('section-save')}>Save profile</button>
          <button type="button" className="action-btn" onClick={() => scrollToSection('section-profile-compare')}>Profile compare</button>
          {isSelfCalc && <button type="button" className="action-btn" onClick={() => scrollToSection('section-breakdown')}>Score breakdown</button>}
          {isSelfCalc && <button type="button" className="action-btn" onClick={() => scrollToSection('section-improve')}>Improve score</button>}
          {isSelfCalc && <button type="button" className="action-btn" onClick={() => scrollToSection('section-coach')}>Expert strategy</button>}
          {isSelfCalc && <button type="button" className="action-btn" onClick={() => scrollToSection('section-category')}>Category draws</button>}
          <button type="button" className="action-btn" onClick={() => scrollToSection('section-timeline')}>Timeline</button>
          <button type="button" className="action-btn" onClick={() => scrollToSection('section-draws')}>Recent draws</button>
        </div>
      </motion.div>

      <motion.div className={`card status-card ${status.cls}-card`} variants={fadeUp}>
        <div className="status-header"><span className={`status-marker ${status.cls}`}>{status.marker}</span> <strong>{status.title}</strong></div>
        <p className="status-desc">{status.desc}</p>
        <div className={`draw-source-pill ${getDrawSourceClass(drawSource)}`}>
          Draw data source: {getDrawSourceLabel(drawSource)} · Updated {activeDraws.lastUpdated || '—'}
          <span className={`freshness-pill freshness-${drawFreshness.tier}`}>{drawFreshness.label}</span>
        </div>
        <div className="cutoff-compare">
          <CutoffBar label="Your Score" value={score} max={Math.max(score, cutoff, 600)} color="var(--primary)" />
          <CutoffBar label="Cut-off" value={cutoff} max={Math.max(score, cutoff, 600)} color="var(--surface-3)" />
        </div>
      </motion.div>

      <motion.div className="card save-profile-card" variants={fadeUp} id="section-save">
        <h3>Save your profile</h3>
        <p className="cat-intro">Save this result and optionally subscribe to draw alerts.</p>
        {isAuthenticated ? (
          <p className="save-note">Signed in as {user.email}. Saves are synced across your devices.</p>
        ) : (
          <p className="save-note">Tip: sign in to sync profiles and score tracking across devices.</p>
        )}
        <div className="save-grid">
          <label className="wi-field">
            <span>Profile name (optional)</span>
            <input type="text" value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="e.g., Feb 2026 Profile" />
          </label>
          <label className="wi-field">
            <span>Email (optional)</span>
            <input type="email" value={saveEmail} onChange={e => setSaveEmail(e.target.value)} placeholder="you@example.com" />
          </label>
        </div>
        <label className="save-alert-row">
          <input type="checkbox" checked={saveAlerts} onChange={e => setSaveAlerts(e.target.checked)} />
          <span>Notify me by email when my score is at/above the latest cutoff</span>
        </label>
        {!cloudEnabled && <p className="save-note">Cloud alerts need Supabase env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).</p>}
        <div className="save-actions">
          <button type="button" className="action-btn" onClick={handleSaveProfile} disabled={savingProfile}>
            {savingProfile ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
        {saveStatus && <p className="save-status">{saveStatus}</p>}
        {isAuthenticated && (
          <div className="save-synced-list">
            <h4>Synced profiles</h4>
            {syncedProfilesStatus === 'loading' && <p className="save-note">Loading your synced profiles...</p>}
            {syncedProfilesStatus === 'error' && <p className="save-note">Could not load synced profiles right now.</p>}
            {syncedProfilesStatus !== 'loading' && syncedProfiles.length === 0 && (
              <p className="save-note">No synced profiles yet. Save your current result to start tracking.</p>
            )}
            {syncedProfiles.length > 0 && (
              <ul className="save-synced-items">
                {syncedProfiles.slice(0, 5).map((profile) => (
                  <li key={profile.id}>
                    <span>{profile.name || profile.id}</span>
                    <strong>{profile.score}</strong>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </motion.div>
      <motion.div className="card profile-compare-card" variants={fadeUp} id="section-profile-compare">
        <SectionToggleHeader
          id="profile-compare-panel"
          label="Profile Compare Mode"
          open={profileCompareOpen}
          onToggle={() => setProfileCompareOpen(!profileCompareOpen)}
        />
        <AnimatePresence initial={false}>
          {profileCompareOpen && (
            <motion.div
              id="profile-compare-panel"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.2 }}
            >
              <p className="cat-intro">Compare your current answers with any locally saved profile to spot score gaps quickly.</p>
              <div className="profile-compare-controls wi-grid">
                <label className="wi-field">
                  <span>Profile A</span>
                  <select value={profileAId} onChange={(e) => setProfileAId(e.target.value)}>
                    {profileOptions.map((profile) => (
                      <option key={`a-${profile.id}`} value={profile.id}>
                        {profile.name} ({profile.score})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="wi-field">
                  <span>Profile B</span>
                  <select value={profileBId} onChange={(e) => setProfileBId(e.target.value)}>
                    {profileOptions.map((profile) => (
                      <option key={`b-${profile.id}`} value={profile.id}>
                        {profile.name} ({profile.score})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {!canCompareProfiles && (
                <p className="path-empty-text">Choose two different profiles to compare.</p>
              )}
              {canCompareProfiles && (
                <>
                  <div className="profile-compare-delta">
                    <strong>{profileB.name}</strong> vs <strong>{profileA.name}</strong>:
                    <span className={profileDelta > 0 ? 'delta-up' : profileDelta < 0 ? 'delta-down' : ''}>
                      {' '}{profileDelta > 0 ? '+' : ''}{profileDelta} points
                    </span>
                  </div>
                  <div className="profile-compare-grid">
                    <div className="profile-compare-column">
                      <h4>{profileA.name}</h4>
                      <strong className="profile-compare-score">{profileA.score}</strong>
                      <ul>
                        {profileAFields.map((field) => (
                          <li key={`${profileA.id}-${field.label}`}>
                            <span>{field.label}</span>
                            <strong>{field.value}</strong>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="profile-compare-column">
                      <h4>{profileB.name}</h4>
                      <strong className="profile-compare-score">{profileB.score}</strong>
                      <ul>
                        {profileBFields.map((field) => (
                          <li key={`${profileB.id}-${field.label}`}>
                            <span>{field.label}</span>
                            <strong>{field.value}</strong>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {isSelfCalc && (
        <motion.div className="card" variants={fadeUp} id="section-breakdown">
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

      {isSelfCalc && (
        <motion.div className="card whatif-card" variants={fadeUp}>
          <SectionToggleHeader
            id="scenario-compare-panel"
            label="Scenario Compare (A vs B)"
            open={compareOpen}
            onToggle={() => setCompareOpen(!compareOpen)}
          />
          <AnimatePresence initial={false}>
            {compareOpen && (
              <motion.div
                id="scenario-compare-panel"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.2 }}
              >
                <p className="cat-intro">{t('results.whatifDesc')}</p>
                <ScenarioComparePanel answers={answers} originalScore={score} t={t} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {suggestions.length > 0 && (
        <motion.div className="card" variants={fadeUp} id="section-improve">
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
                {sug.action && <div className="action-specific">{sug.action}</div>}
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
                    {sug.action && <div className="action-specific">{sug.action}</div>}
                    <div className="action-meta">
                      <span className="action-time">{sug.timeframe}</span>
                      <span className={`action-diff diff-${sug.difficulty.toLowerCase()}`}>{sug.difficulty}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
              <button type="button" className="btn-toggle" onClick={() => setShowMoreSuggestions(!showMoreSuggestions)}>
                {showMoreSuggestions ? 'Show fewer ▲' : `Show ${moreSuggestions.length} more suggestions ▼`}
              </button>
            </>
          )}
        </motion.div>
      )}

      {isSelfCalc && (
        <div id="section-coach">
          <Suspense fallback={<div className="loading-fallback"><Loader /></div>}>
            <PathCoach
              answers={answers}
              result={result}
              averageCutoff={activeDraws.averageCutoff}
              categoryInfo={activeCategoryInfo}
              motionIntensity={motionIntensity}
            />
          </Suspense>
        </div>
      )}

      {isSelfCalc && (
        <motion.div className="card" variants={fadeUp} id="section-category">
          <h3>{t('results.category')}</h3>
          <p className="cat-intro">{t('results.catIntro')}</p>
        <div className="category-meta-row">
          <span className={`draw-source-pill ${categorySource === 'Live sync' ? 'draw-source-live' : 'draw-source-fallback'}`}>
            Category config: {categorySource}
          </span>
          <span className={`freshness-pill freshness-${categoryFreshness.tier}`}>
            {categoryFreshness.label} · {categoryFreshness.dateLabel}
          </span>
        </div>
          <div className="cat-grid">
            {activeCategoryInfo.map(cat => {
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
                  {!eligible && <p className="cat-req">{cat.eligibility}</p>}
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}

      {isSelfCalc && provinces.length > 0 && (
        <motion.div className="card" variants={fadeUp}>
          <SectionToggleHeader
            id="province-recommender-panel"
            label="Province Recommender"
            open={provOpen}
            onToggle={() => setProvOpen(!provOpen)}
          />
          <AnimatePresence initial={false}>
            {provOpen && (
              <motion.div
                id="province-recommender-panel"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.2 }}
              >
                <p className="cat-intro">Based on your profile, these provinces may be good matches for Provincial Nominee Programs.</p>
                <div className="prov-grid">
                  {provinces.slice(0, 5).map(prov => (
                    <div key={prov.id} className="prov-card">
                      <div className="prov-header">
                        <span className="prov-abbr">{prov.abbr}</span>
                        <div>
                          <strong className="prov-name">{prov.name}</strong>
                          <span className={`prov-match ${prov.matchScore >= 70 ? 'match-high' : prov.matchScore >= 40 ? 'match-mid' : 'match-low'}`}>
                            {prov.matchScore}% match
                          </span>
                        </div>
                      </div>
                      <div className="prov-bar-wrap">
                        <motion.div className="prov-bar" initial={{ width: 0 }} animate={{ width: `${prov.matchScore}%` }} transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.8, ease: 'easeOut' }} style={{ background: prov.matchScore >= 70 ? '#22c55e' : prov.matchScore >= 40 ? '#f59e0b' : 'var(--surface-3)' }} />
                      </div>
                      <p className="prov-notes">{prov.notes}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      <motion.div className="card" variants={fadeUp} id="section-timeline">
        <h3>{t('results.timeline')}</h3>
        <div className={`timeline-badge tl-${status.cls}`}>
          <strong>{timeline.label}</strong> — est. {timeline.months} months
        </div>
        <p className="timeline-desc">{timeline.description}</p>
      </motion.div>

      <motion.div className="card" variants={fadeUp} id="section-draws">
        <SectionToggleHeader
          id="recent-draws-panel"
          label={t('results.draws')}
          open={drawsOpen}
          onToggle={() => setDrawsOpen(!drawsOpen)}
        />
        <div className={`draw-source-pill ${getDrawSourceClass(drawSource)}`}>
          Source: {getDrawSourceLabel(drawSource)} · Updated {activeDraws.lastUpdated || '—'}
        </div>
        <AnimatePresence initial={false}>
          {drawsOpen && (
            <motion.div
              id="recent-draws-panel"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.22 }}
              className="draws-content"
            >
              <h4 className="draws-subhead">General / CEC Draws</h4>
              {activeDraws.generalProgram.slice(0, 4).map((dr, i) => <DrawRow key={`g${i}`} draw={dr} userScore={score} />)}
              <h4 className="draws-subhead">Category-Based Draws</h4>
              {activeDraws.categoryBased.slice(0, 4).map((dr, i) => <DrawRow key={`c${i}`} draw={dr} userScore={score} />)}
              {!!activeDraws.pnpDraws?.length && (
                <>
                  <h4 className="draws-subhead">Provincial Nominee (PNP)</h4>
                  {activeDraws.pnpDraws.slice(0, 3).map((dr, i) => <DrawRow key={`p${i}`} draw={dr} userScore={score} />)}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {pwInfo && (
        <motion.div className="card" variants={fadeUp}>
          <h3>{pwInfo.name} Requirements</h3>
          <ul className="pathway-list">{pwInfo.requirements.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </motion.div>
      )}

      <motion.div className="card disclaimer" variants={fadeUp}>
        <p><strong>Disclaimer:</strong> {t('results.disclaimer')} <a href="https://www.canada.ca/en/immigration-refugees-citizenship.html" target="_blank" rel="noopener noreferrer">canada.ca</a></p>
      </motion.div>

      <motion.button
        type="button"
        className="btn-restart"
        onClick={onRestart}
        whileHover={prefersReducedMotion ? undefined : { scale: 1.03 }}
        whileTap={prefersReducedMotion ? undefined : { scale: 0.96 }}
        variants={fadeUp}
      >
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
        <motion.div className="cutoff-bar" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: 'easeOut' }}>
          {value}
        </motion.div>
      </div>
    </div>
  );
}
