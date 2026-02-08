import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { nocTEER, ieltsBands, celpipLevels, clbLevels } from '../data/crsData';

/* ─── Step definitions ─── */
function buildAgeOptions() {
  const opts = [{ value: '17', label: 'Under 18' }];
  for (let a = 18; a <= 47; a++) opts.push({ value: String(a), label: `${a} years` });
  opts.push({ value: '48', label: '48 or older' });
  return opts;
}

const bandOpts = (arr, prefix = '') => arr.map(b => ({ value: String(b), label: `${prefix}${b}` }));
const clbOpts = bandOpts(clbLevels, 'CLB ');
const workOpts = [
  { value: '0', label: 'None' }, { value: '1', label: '1 year' },
  { value: '2', label: '2 years' }, { value: '3', label: '3 years' },
  { value: '4', label: '4 years' }, { value: '5', label: '5+ years' }
];

const STEPS = [
  { id: 'pathway', label: 'Pathway', title: 'Select Your Immigration Pathway', subtitle: 'Which program are you applying through?', type: 'single', answerKey: 'pathway', options: [
    { value: 'fsw', label: 'Express Entry – Federal Skilled Worker (FSW)' },
    { value: 'cec', label: 'Express Entry – Canadian Experience Class (CEC)' },
    { value: 'fst', label: 'Express Entry – Federal Skilled Trades (FST)' },
    { value: 'pnp', label: 'Provincial Nominee Program (PNP)' },
    { value: 'aip', label: 'Atlantic Immigration Program (AIP)' },
    { value: 'other', label: 'Other Work / Study Pathways' },
  ]},
  { id: 'knowsScore', label: 'Known Score', title: 'Do You Know Your Current CRS Points?', subtitle: 'If you\'ve already calculated your score, select Yes.', type: 'single', answerKey: 'knowsScore', options: [
    { value: 'yes', label: 'Yes, I know my approximate score' },
    { value: 'no', label: 'No, help me calculate' },
  ]},
  { id: 'scoreRange', label: 'Score Range', title: 'Select Your Approximate Score Range', type: 'single', answerKey: 'scoreRange',
    condition: a => a.knowsScore === 'yes', options: [
    { value: '325', label: '300 – 349' }, { value: '375', label: '350 – 399' },
    { value: '425', label: '400 – 449' }, { value: '475', label: '450 – 499' },
    { value: '525', label: '500 – 549' }, { value: '575', label: '550+' },
  ]},
  { id: 'age', label: 'Age', title: 'Your Age at Time of Application', subtitle: 'Select your current age or age when you plan to apply.', type: 'grid', answerKey: 'age',
    condition: a => a.knowsScore !== 'yes', options: buildAgeOptions() },
  { id: 'education', label: 'Education', title: 'Highest Level of Education', subtitle: 'Select the Canadian equivalent of your highest completed credential.', type: 'single', answerKey: 'education',
    condition: a => a.knowsScore !== 'yes', options: [
    { value: 'less_than_secondary', label: 'Less than High School' },
    { value: 'secondary', label: 'High School Diploma' },
    { value: 'one_year_post', label: '1-Year Post-Secondary Certificate' },
    { value: 'two_year_post', label: '2-Year Post-Secondary Diploma' },
    { value: 'bachelors', label: "Bachelor's Degree (3+ years)" },
    { value: 'two_or_more', label: 'Two or More Credentials (one 3+ yr)' },
    { value: 'masters', label: "Master's / Professional Degree" },
    { value: 'doctoral', label: 'Doctoral Degree (PhD)' },
  ]},
  { id: 'canadianEducation', label: 'Canadian Ed.', title: 'Do You Have a Canadian Education Credential?', subtitle: 'Completed at a Canadian institution.', type: 'single', answerKey: 'canadianEducation',
    condition: a => a.knowsScore !== 'yes', options: [
    { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' },
  ]},
  { id: 'canadianEduType', label: 'Credential Type', title: 'Canadian Education Credential Type', type: 'single', answerKey: 'canadianEduType',
    condition: a => a.knowsScore !== 'yes' && a.canadianEducation === 'yes', options: [
    { value: 'short', label: '1-2 Year Credential (certificate/diploma)' },
    { value: 'long', label: '3+ Year Credential or Graduate Degree' },
  ]},
  { id: 'workExp', label: 'Experience', title: 'Work Experience', subtitle: 'Select years of skilled work experience.', type: 'grouped',
    condition: a => a.knowsScore !== 'yes', groups: [
    { title: 'Work Experience Outside Canada', answerKey: 'foreignWorkExp', type: 'grid-wide', options: workOpts },
    { title: 'Work Experience Inside Canada', answerKey: 'canadianWorkExp', type: 'grid-wide', options: workOpts },
  ]},
  { id: 'nocTeer', label: 'Occupation', title: 'Job Type – NOC TEER Level', subtitle: 'Select the skill level of your primary occupation.', type: 'single', answerKey: 'nocTeer',
    condition: a => a.knowsScore !== 'yes', options: nocTEER.map(n => ({ value: n.value, label: n.label, example: n.examples })) },
  { id: 'langTestType', label: 'Language Test', title: 'Which English Language Test Did You Take?', subtitle: 'Select the test you have results for (or plan to take).', type: 'single', answerKey: 'langTestType',
    condition: a => a.knowsScore !== 'yes', options: [
    { value: 'ielts', label: 'IELTS General Training' },
    { value: 'celpip', label: 'CELPIP General' },
    { value: 'none', label: "I haven't taken a test yet" },
  ]},
  { id: 'ielts', label: 'IELTS Scores', title: 'IELTS General Training Scores', subtitle: 'Select your band score for each ability.', type: 'grouped',
    condition: a => a.knowsScore !== 'yes' && a.langTestType === 'ielts', groups: [
    { title: 'Listening', answerKey: 'ielts_listening', type: 'grid', options: bandOpts(ieltsBands) },
    { title: 'Reading', answerKey: 'ielts_reading', type: 'grid', options: bandOpts(ieltsBands) },
    { title: 'Writing', answerKey: 'ielts_writing', type: 'grid', options: bandOpts(ieltsBands) },
    { title: 'Speaking', answerKey: 'ielts_speaking', type: 'grid', options: bandOpts(ieltsBands) },
  ]},
  { id: 'celpip', label: 'CELPIP Scores', title: 'CELPIP General Scores', subtitle: 'Select your CELPIP level (M, 1–12) for each ability.', type: 'grouped',
    condition: a => a.knowsScore !== 'yes' && a.langTestType === 'celpip', groups: [
    { title: 'Listening', answerKey: 'celpip_listening', type: 'grid', options: bandOpts(celpipLevels) },
    { title: 'Reading', answerKey: 'celpip_reading', type: 'grid', options: bandOpts(celpipLevels) },
    { title: 'Writing', answerKey: 'celpip_writing', type: 'grid', options: bandOpts(celpipLevels) },
    { title: 'Speaking', answerKey: 'celpip_speaking', type: 'grid', options: bandOpts(celpipLevels) },
  ]},
  { id: 'hasFrench', label: 'French', title: 'Do You Have a French Language Test Result?', subtitle: 'TEF Canada, TCF Canada, or equivalent.', type: 'single', answerKey: 'hasFrench',
    condition: a => a.knowsScore !== 'yes', options: [
    { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' },
  ]},
  { id: 'frenchScores', label: 'French CLB', title: 'French Language – CLB Levels', subtitle: 'Select your CLB level for each ability.', type: 'grouped',
    condition: a => a.knowsScore !== 'yes' && a.hasFrench === 'yes', groups: [
    { title: 'Listening', answerKey: 'french_listening', type: 'grid', options: clbOpts },
    { title: 'Reading', answerKey: 'french_reading', type: 'grid', options: clbOpts },
    { title: 'Writing', answerKey: 'french_writing', type: 'grid', options: clbOpts },
    { title: 'Speaking', answerKey: 'french_speaking', type: 'grid', options: clbOpts },
  ]},
  { id: 'hasSpouse', label: 'Spouse', title: 'Do You Have a Spouse or Common-Law Partner?', type: 'single', answerKey: 'hasSpouse',
    condition: a => a.knowsScore !== 'yes', options: [
    { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' },
  ]},
  { id: 'spouseIsCanadian', label: 'Spouse Status', title: 'Is Your Spouse a Canadian Citizen or PR?', type: 'single', answerKey: 'spouseIsCanadian',
    condition: a => a.knowsScore !== 'yes' && a.hasSpouse === 'yes', options: [
    { value: 'yes', label: 'Yes – Canadian Citizen or Permanent Resident' },
    { value: 'no', label: 'No' },
  ]},
  { id: 'spouseAccompanying', label: 'Accompanying', title: 'Will Your Spouse Come With You to Canada?', subtitle: 'An accompanying spouse changes how your score is calculated.', type: 'single', answerKey: 'spouseAccompanying',
    condition: a => a.knowsScore !== 'yes' && a.hasSpouse === 'yes' && a.spouseIsCanadian !== 'yes', options: [
    { value: 'yes', label: 'Yes – They will accompany me' },
    { value: 'no', label: 'No – They will stay behind' },
  ]},
  { id: 'spouseDetails', label: 'Spouse Details', title: 'Spouse / Partner Details', subtitle: "Your accompanying spouse's qualifications affect your CRS score.", type: 'grouped',
    condition: a => a.knowsScore !== 'yes' && a.hasSpouse === 'yes' && a.spouseIsCanadian !== 'yes' && a.spouseAccompanying === 'yes',
    groups: [
      { title: "Spouse's Highest Education", answerKey: 'spouseEducation', type: 'single', options: [
        { value: 'less_than_secondary', label: 'Less than High School' },
        { value: 'secondary', label: 'High School' },
        { value: 'one_year_post', label: '1-Year Post-Secondary' },
        { value: 'two_year_post', label: '2-Year Post-Secondary' },
        { value: 'bachelors', label: "Bachelor's Degree" },
        { value: 'two_or_more', label: 'Two or More Credentials' },
        { value: 'masters', label: "Master's / Professional" },
        { value: 'doctoral', label: 'Doctoral (PhD)' },
      ]},
      { title: "Spouse CLB – Listening", answerKey: 'spouseLang_listening', type: 'grid', options: clbOpts },
      { title: "Spouse CLB – Reading", answerKey: 'spouseLang_reading', type: 'grid', options: clbOpts },
      { title: "Spouse CLB – Writing", answerKey: 'spouseLang_writing', type: 'grid', options: clbOpts },
      { title: "Spouse CLB – Speaking", answerKey: 'spouseLang_speaking', type: 'grid', options: clbOpts },
      { title: "Spouse's Canadian Work Experience", answerKey: 'spouseCanadianWork', type: 'grid-wide', options: workOpts },
    ]},
  { id: 'hasJobOffer', label: 'Job Offer', title: 'Do You Have a Valid Job Offer from a Canadian Employer?', subtitle: 'Must be supported by a Labour Market Impact Assessment (LMIA).', type: 'single', answerKey: 'hasJobOffer',
    condition: a => a.knowsScore !== 'yes', options: [
    { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' },
  ]},
  { id: 'jobOfferTeer', label: 'Job TEER', title: 'Job Offer – NOC TEER Level', type: 'single', answerKey: 'jobOfferTeer',
    condition: a => a.knowsScore !== 'yes' && a.hasJobOffer === 'yes',
    options: nocTEER.map(n => ({ value: n.value, label: n.label })) },
  { id: 'jobOfferMajorGroup00', label: 'Senior Mgmt', title: 'Is the Job Offer for Senior Management (Major Group 00)?', subtitle: 'E.g., Legislators, Senior government managers, Senior business executives.', type: 'single', answerKey: 'jobOfferMajorGroup00',
    condition: a => a.knowsScore !== 'yes' && a.hasJobOffer === 'yes' && a.jobOfferTeer === 'teer_0', options: [
    { value: 'yes', label: 'Yes – Senior Management (Major Group 00)' },
    { value: 'no', label: 'No – Other Management' },
  ]},
  { id: 'hasCertificate', label: 'Trade Cert.', title: 'Do You Have a Canadian Certificate of Qualification?', subtitle: 'A trade certificate issued by a Canadian province or territory.', type: 'single', answerKey: 'hasCertificate',
    condition: a => a.knowsScore !== 'yes' && a.pathway === 'fst', options: [
    { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' },
  ]},
  { id: 'hasPNP', label: 'PNP', title: 'Do You Have a Provincial Nomination (PNP)?', type: 'single', answerKey: 'hasPNP',
    condition: a => a.knowsScore !== 'yes', options: [
    { value: 'yes', label: 'Yes – I have a provincial nomination' },
    { value: 'no', label: 'No' },
  ]},
  { id: 'hasSibling', label: 'Sibling', title: 'Do You Have a Sibling in Canada?', subtitle: 'A brother or sister who is a Canadian citizen or permanent resident.', type: 'single', answerKey: 'hasSibling',
    condition: a => a.knowsScore !== 'yes', options: [
    { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' },
  ]},
];

/* ─── Helpers ─── */
function isApplicable(step, answers) {
  return !step.condition || step.condition(answers);
}

function isComplete(step, answers) {
  if (step.type === 'grouped') {
    return step.groups.every(g => !!answers[g.answerKey]);
  }
  return !!answers[step.answerKey];
}

/* ─── Animation variants ─── */
const pageVariants = {
  enter: dir => ({ x: dir > 0 ? 80 : -80, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: dir => ({ x: dir > 0 ? -80 : 80, opacity: 0 }),
};

/* ─── OptionButton ─── */
function OptionButton({ opt, selected, layout, onSelect }) {
  return (
    <motion.button
      className={`opt-btn${selected ? ' selected' : ''} ${layout}`}
      onClick={onSelect}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
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

/* ─── OptionList ─── */
function OptionList({ options, answerKey, layout, answers, onAnswer }) {
  return (
    <div className={`opt-${layout}`}>
      {options.map(opt => (
        <OptionButton
          key={opt.value}
          opt={opt}
          selected={answers[answerKey] === opt.value}
          layout={layout}
          onSelect={() => onAnswer(answerKey, opt.value)}
        />
      ))}
    </div>
  );
}

/* ─── Wizard ─── */
export default function Wizard({ onFinish }) {
  const [answers, setAnswers] = useState({});
  const [currentIdx, setCurrentIdx] = useState(() => {
    for (let i = 0; i < STEPS.length; i++) if (isApplicable(STEPS[i], {})) return i;
    return 0;
  });
  const [history, setHistory] = useState([]);
  const [direction, setDirection] = useState(1);

  const step = STEPS[currentIdx];

  const handleAnswer = useCallback((key, value) => {
    setAnswers(prev => ({ ...prev, [key]: value }));
  }, []);

  const visibleCount = useMemo(() => STEPS.filter(s => isApplicable(s, answers)).length, [answers]);
  const visibleNum = useMemo(() => {
    let n = 0;
    for (let i = 0; i <= currentIdx; i++) if (isApplicable(STEPS[i], answers)) n++;
    return n;
  }, [currentIdx, answers]);
  const pct = Math.round((visibleNum / visibleCount) * 100);

  const isLastVisible = useMemo(() => {
    for (let i = currentIdx + 1; i < STEPS.length; i++) if (isApplicable(STEPS[i], answers)) return false;
    return true;
  }, [currentIdx, answers]);

  const goNext = useCallback(() => {
    if (!isComplete(step, answers)) return;
    setDirection(1);
    setHistory(prev => [...prev, currentIdx]);
    let next = currentIdx + 1;
    while (next < STEPS.length && !isApplicable(STEPS[next], answers)) next++;
    if (next >= STEPS.length) {
      onFinish(answers);
    } else {
      setCurrentIdx(next);
    }
  }, [step, answers, currentIdx, onFinish]);

  const goBack = useCallback(() => {
    if (history.length === 0) return;
    setDirection(-1);
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setCurrentIdx(prev);
  }, [history]);

  const complete = isComplete(step, answers);

  return (
    <motion.div
      className="wizard"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -30, transition: { duration: 0.25 } }}
    >
      {/* Progress */}
      <div className="progress-bar-wrap">
        <div className="progress-info">
          <span>Step {visibleNum} of {visibleCount}</span>
          <span>{pct}%</span>
        </div>
        <div className="progress-track">
          <motion.div
            className="progress-fill"
            animate={{ width: `${pct}%` }}
            transition={{ type: 'spring', stiffness: 80, damping: 20 }}
          />
        </div>
      </div>

      {/* Step content */}
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={step.id}
          className="step-wrap"
          custom={direction}
          variants={pageVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ type: 'spring', stiffness: 200, damping: 26 }}
        >
          <span className="step-label">{step.label}</span>
          <h2 className="step-title">{step.title}</h2>
          {step.subtitle && <p className="step-subtitle">{step.subtitle}</p>}

          {step.type === 'single' && (
            <OptionList options={step.options} answerKey={step.answerKey} layout="list" answers={answers} onAnswer={handleAnswer} />
          )}
          {step.type === 'grid' && (
            <OptionList options={step.options} answerKey={step.answerKey} layout="grid" answers={answers} onAnswer={handleAnswer} />
          )}
          {step.type === 'grouped' && step.groups.map(g => (
            <div className="question-group" key={g.answerKey}>
              <h3>{g.title}</h3>
              <OptionList
                options={g.options}
                answerKey={g.answerKey}
                layout={g.type === 'grid' ? 'grid' : g.type === 'grid-wide' ? 'grid-wide' : 'list'}
                answers={answers}
                onAnswer={handleAnswer}
              />
            </div>
          ))}
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="wizard-nav">
        {history.length > 0 && (
          <motion.button className="btn-back" onClick={goBack} whileHover={{ x: -3 }} whileTap={{ scale: 0.95 }}>
            ← Back
          </motion.button>
        )}
        <motion.button
          className={`btn-next${isLastVisible ? ' finish' : ''}`}
          disabled={!complete}
          onClick={goNext}
          whileHover={complete ? { scale: 1.02 } : {}}
          whileTap={complete ? { scale: 0.97 } : {}}
        >
          {isLastVisible ? 'Calculate Score ✓' : 'Next →'}
        </motion.button>
      </div>
    </motion.div>
  );
}
