import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { nocTEER, ieltsBands, celpipLevels, clbLevels, tefBands, tcfBands } from '../data/crsData';
import { searchNOC } from '../data/nocCodes';
import { useLanguage } from '../i18n/LanguageContext';
import StarBorder from './StarBorder';

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
const isAdvanced = (answers) => answers.answerMode === 'advanced';

const STEPS = [
  { id: 'pathway', label: 'Pathway', title: 'Which Immigration Program Are You Applying Through?', subtitle: 'Not sure? Most skilled workers use Federal Skilled Worker (FSW). If you already work in Canada, choose Canadian Experience Class (CEC).', type: 'single', answerKey: 'pathway', options: [
    { value: 'fsw', label: 'Federal Skilled Worker (FSW)', example: 'For skilled workers outside Canada with 1+ year work experience' },
    { value: 'cec', label: 'Canadian Experience Class (CEC)', example: 'For people already working in Canada with 1+ year Canadian experience' },
    { value: 'fst', label: 'Federal Skilled Trades (FST)', example: 'For qualified tradespeople (electricians, welders, plumbers, etc.)' },
    { value: 'pnp', label: 'Provincial Nominee Program (PNP)', example: 'Nominated by a Canadian province — adds 600 CRS points' },
    { value: 'aip', label: 'Atlantic Immigration Program (AIP)', example: 'For jobs in Nova Scotia, New Brunswick, PEI, or Newfoundland' },
    { value: 'other', label: 'Other / Not Sure Yet', example: 'I\'m exploring my options' },
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
  { id: 'answerMode', label: 'Detail Mode', title: 'How detailed should this CRS assessment be?', subtitle: 'Basic mode is faster. Advanced mode includes all available CRS-impact and context branches.', type: 'single', answerKey: 'answerMode',
    condition: a => a.knowsScore !== 'yes', options: [
    { value: 'basic', label: 'Basic (faster)', example: 'Core CRS point questions only' },
    { value: 'advanced', label: 'Advanced (maximum detail)', example: 'Includes extra context branches and full profile coverage' },
  ]},
  { id: 'age', label: 'Age', title: 'Your Age at Time of Application', subtitle: 'Select your current age or age when you plan to apply.', type: 'grid', answerKey: 'age',
    condition: a => a.knowsScore !== 'yes', options: buildAgeOptions() },
  { id: 'education', label: 'Education', title: 'What Is Your Highest Level of Education?', subtitle: 'Select the Canadian equivalent of your highest completed credential. If your degree is from outside Canada, choose the closest match. You may need an Educational Credential Assessment (ECA) to verify it.', helpTip: 'An ECA (Educational Credential Assessment) is a report from a designated organization (like WES) that verifies your foreign degree is equivalent to a Canadian credential. It costs ~$200 and takes 4-8 weeks.', type: 'single', answerKey: 'education',
    condition: a => a.knowsScore !== 'yes', options: [
    { value: 'less_than_secondary', label: 'Less than High School', example: 'Did not complete secondary/high school' },
    { value: 'secondary', label: 'High School Diploma', example: 'Completed secondary school (Grade 12 / Class 12)' },
    { value: 'one_year_post', label: '1-Year Post-Secondary Certificate', example: 'College diploma or trade certificate (1 year program)' },
    { value: 'two_year_post', label: '2-Year Post-Secondary Diploma', example: 'Associate degree or 2-year college diploma' },
    { value: 'bachelors', label: "Bachelor's Degree (3+ years)", example: '3 or 4 year university degree (B.Sc., B.A., B.Tech, etc.)' },
    { value: 'two_or_more', label: 'Two or More Credentials (one 3+ yr)', example: 'E.g., Bachelor\'s degree + a diploma or second degree' },
    { value: 'masters', label: "Master's / Professional Degree", example: 'M.Sc., MBA, M.Tech, Law degree, Medical degree, etc.' },
    { value: 'doctoral', label: 'Doctoral Degree (PhD)', example: 'Ph.D. or equivalent research doctorate' },
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
  { id: 'workExp', label: 'Experience', title: 'How Many Years of Skilled Work Experience Do You Have?', subtitle: 'Count only full-time paid work (30+ hours/week) in a skilled occupation (NOC TEER 0, 1, 2, or 3). Part-time work can be combined: 2 years at 15 hrs/week = 1 year full-time.', type: 'grouped',
    condition: a => a.knowsScore !== 'yes', groups: [
    { title: 'Years of Work Outside Canada', answerKey: 'foreignWorkExp', type: 'grid-wide', options: workOpts },
    { title: 'Years of Work Inside Canada', answerKey: 'canadianWorkExp', type: 'grid-wide', options: workOpts },
  ]},
  { id: 'firstOfficialLanguage', label: 'Official Lang', title: 'Which is your FIRST official language for CRS?', subtitle: 'CRS first-language points can come from either English or French.', type: 'single', answerKey: 'firstOfficialLanguage',
    condition: a => a.knowsScore !== 'yes', options: [
    { value: 'english', label: 'English is my first official language' },
    { value: 'french', label: 'French is my first official language' },
  ]},
  { id: 'hasEnglishSecond', label: 'Second Lang', title: 'Do you also have English test results (as second official language)?', subtitle: 'This can add second-official-language points when French is your first official language.', type: 'single', answerKey: 'hasEnglishSecond',
    condition: a => a.knowsScore !== 'yes' && a.firstOfficialLanguage === 'french', options: [
    { value: 'yes', label: 'Yes — I have IELTS/CELPIP results' },
    { value: 'no', label: 'No — only French results for now' },
  ]},
  { id: 'nocTeer', label: 'Occupation', title: 'What Is the Skill Level of Your Job?', subtitle: 'Canada classifies jobs using NOC TEER levels (0-5). If you\'re not sure, search your job title on the Canada NOC website. Only TEER 0-3 qualify for Express Entry.', helpTip: 'NOC (National Occupational Classification) is Canada\'s system for classifying jobs. TEER levels range from 0 (management) to 5 (labour). Only TEER 0-3 qualify for Express Entry. Search your job title below to find your level.', type: 'single', answerKey: 'nocTeer', hasNOCSearch: true,
    condition: a => a.knowsScore !== 'yes' && isAdvanced(a), options: nocTEER.map(n => ({ value: n.value, label: n.label, example: n.examples })) },
  { id: 'occupationCategory', label: 'Job Category', title: 'Which Category Best Describes Your Occupation?', subtitle: 'Canada runs special "category-based" draws with LOWER cutoff scores for certain occupations. This helps us check if you qualify for any of these draws.', type: 'single', answerKey: 'occupationCategory',
    condition: a => a.knowsScore !== 'yes' && isAdvanced(a), options: [
    { value: 'healthcare', label: 'Healthcare & Social Services', example: 'Nurses, doctors, pharmacists, dentists, physiotherapists, social workers, medical lab technicians' },
    { value: 'stem', label: 'STEM (Science, Technology, Engineering, Math)', example: 'Software developers, engineers, data scientists, architects, biologists, mathematicians' },
    { value: 'trade', label: 'Skilled Trades', example: 'Electricians, plumbers, welders, carpenters, heavy equipment operators, millwrights' },
    { value: 'transport', label: 'Transport', example: 'Truck drivers, bus drivers, pilots, railway workers, delivery drivers' },
    { value: 'agriculture', label: 'Agriculture & Agri-food', example: 'Farm workers, food processing, butchers/meat cutters, greenhouse workers, agriculture managers' },
    { value: 'other', label: 'Other / None of the Above', example: 'My job doesn\'t fit any of the categories above' },
  ]},
  { id: 'langTestType', label: 'English Test', title: 'Which English Language Test Did You Take (or Plan to Take)?', subtitle: 'Use IELTS General Training or CELPIP General. Results are valid for 2 years.', helpTip: 'CLB (Canadian Language Benchmarks) is used by IRCC. Higher CLB in your language profile can add substantial CRS points.', type: 'single', answerKey: 'langTestType',
    condition: a => a.knowsScore !== 'yes' && (a.firstOfficialLanguage !== 'french' || a.hasEnglishSecond === 'yes'), options: [
    { value: 'ielts', label: 'IELTS General Training', example: 'Most popular worldwide — scored 0 to 9 in each ability' },
    { value: 'celpip', label: 'CELPIP General', example: 'Canadian test — scored M, 1 to 12 in each ability' },
    { value: 'none', label: "I haven't taken a test yet", example: 'Your score will be calculated as CLB 0 for language' },
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
  { id: 'hasFrench', label: 'French', title: 'Do You Have French Test Results for Second Official Language?', subtitle: 'If English is your first official language, French can add second-language and additional points.', type: 'single', answerKey: 'hasFrench',
    condition: a => a.knowsScore !== 'yes' && a.firstOfficialLanguage !== 'french', options: [
    { value: 'yes', label: 'Yes — I have TEF or TCF results', example: 'I have taken a French language test' },
    { value: 'no', label: 'No — I don\'t have French test results', example: 'I haven\'t taken a French test (no penalty)' },
  ]},
  { id: 'frenchTestType', label: 'French Test', title: 'Which French Language Test Did You Take?', subtitle: 'Select your French test. We convert scores to NCLC automatically.', type: 'single', answerKey: 'frenchTestType',
    condition: a => a.knowsScore !== 'yes' && (a.firstOfficialLanguage === 'french' || a.hasFrench === 'yes'), options: [
    { value: 'tef', label: 'TEF Canada', example: 'Test d\'évaluation de français — scored by number of points per section' },
    { value: 'tcf', label: 'TCF Canada', example: 'Test de connaissance du français — scored by levels and points' },
    { value: 'clb', label: 'I know my NCLC/CLB levels directly', example: 'I already know my NCLC level for each ability' },
  ]},
  { id: 'tefScores', label: 'TEF Scores', title: 'TEF Canada Scores', subtitle: 'Select your TEF score range for each ability. We convert these to NCLC levels.', type: 'grouped',
    condition: a => a.knowsScore !== 'yes' && (a.firstOfficialLanguage === 'french' || a.hasFrench === 'yes') && a.frenchTestType === 'tef', groups: [
    { title: 'Compréhension orale (Listening)', answerKey: 'tef_listening', type: 'grid-wide', options: bandOpts(tefBands.listening, '') },
    { title: 'Compréhension écrite (Reading)', answerKey: 'tef_reading', type: 'grid-wide', options: bandOpts(tefBands.reading, '') },
    { title: 'Expression écrite (Writing)', answerKey: 'tef_writing', type: 'grid-wide', options: bandOpts(tefBands.writing, '') },
    { title: 'Expression orale (Speaking)', answerKey: 'tef_speaking', type: 'grid-wide', options: bandOpts(tefBands.speaking, '') },
  ]},
  { id: 'tcfScores', label: 'TCF Scores', title: 'TCF Canada Scores', subtitle: 'Select your TCF score range for each ability. We convert these to NCLC levels.', type: 'grouped',
    condition: a => a.knowsScore !== 'yes' && (a.firstOfficialLanguage === 'french' || a.hasFrench === 'yes') && a.frenchTestType === 'tcf', groups: [
    { title: 'Compréhension orale (Listening)', answerKey: 'tcf_listening', type: 'grid-wide', options: bandOpts(tcfBands.listening, '') },
    { title: 'Compréhension écrite (Reading)', answerKey: 'tcf_reading', type: 'grid-wide', options: bandOpts(tcfBands.reading, '') },
    { title: 'Expression écrite (Writing)', answerKey: 'tcf_writing', type: 'grid-wide', options: bandOpts(tcfBands.writing, '') },
    { title: 'Expression orale (Speaking)', answerKey: 'tcf_speaking', type: 'grid-wide', options: bandOpts(tcfBands.speaking, '') },
  ]},
  { id: 'frenchScores', label: 'French CLB', title: 'French Language – NCLC/CLB Levels', subtitle: 'Enter your NCLC (Niveaux de compétence linguistique canadiens) level for each ability. CLB 7+ in all four = eligible for French category draws.', type: 'grouped',
    condition: a => a.knowsScore !== 'yes' && (a.firstOfficialLanguage === 'french' || a.hasFrench === 'yes') && a.frenchTestType === 'clb', groups: [
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
  { id: 'hasJobOffer', label: 'Job Offer', title: 'Do You Have a Valid Job Offer from a Canadian Employer?', subtitle: 'A valid Canadian job offer can still help with program eligibility, but IRCC removed CRS additional points for arranged employment on March 25, 2025.', helpTip: 'An LMIA (Labour Market Impact Assessment) is a document your employer gets from Service Canada proving no Canadian worker is available for the job. It may still matter for eligibility in some pathways, but it no longer gives CRS additional points.', type: 'single', answerKey: 'hasJobOffer',
    condition: a => a.knowsScore !== 'yes' && isAdvanced(a), options: [
    { value: 'yes', label: 'Yes — I have a valid Canadian job offer' },
    { value: 'no', label: "No — I don't have a Canadian job offer" },
  ]},
  { id: 'hasCertificate', label: 'Trade Cert.', title: 'Do You Have a Canadian Certificate of Qualification?', subtitle: 'A trade certificate issued by a Canadian province or territory.', type: 'single', answerKey: 'hasCertificate',
    condition: a => a.knowsScore !== 'yes' && a.pathway === 'fst', options: [
    { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' },
  ]},
  { id: 'hasPNP', label: 'PNP', title: 'Do You Have a Provincial Nomination?', subtitle: 'A Provincial Nominee Program (PNP) nomination adds 600 CRS points — this virtually guarantees an Invitation to Apply. Each province has its own requirements.', helpTip: 'PNP is the most powerful CRS boost (+600 points). Provinces like Ontario, BC, Alberta, and Saskatchewan actively nominate Express Entry candidates. Some send Notifications of Interest (NOIs) to candidates in the pool — you don\'t always need to apply first.', type: 'single', answerKey: 'hasPNP',
    condition: a => a.knowsScore !== 'yes', options: [
    { value: 'yes', label: 'Yes — I have been nominated by a province', example: 'Ontario, BC, Alberta, Saskatchewan, Manitoba, etc.' },
    { value: 'no', label: 'No — I have not received a PNP nomination' },
  ]},
  { id: 'hasSibling', label: 'Sibling', title: 'Do You Have a Brother or Sister Living in Canada?', subtitle: 'Having a sibling (brother or sister) who is a Canadian citizen or permanent resident and is 18 years or older adds 15 CRS points.', type: 'single', answerKey: 'hasSibling',
    condition: a => a.knowsScore !== 'yes', options: [
    { value: 'yes', label: 'Yes — I have a sibling who is a Canadian citizen or PR' },
    { value: 'no', label: 'No' },
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

/* ─── Step Progress Bar (Uiverse by rust_1966) ─── */
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

/* ─── HelpTip ─── */
function HelpTip({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="help-tip-wrap">
      <button className="help-tip-btn" onClick={() => setOpen(!open)} aria-label="More info" type="button">?</button>
      {open && <div className="help-tip-bubble" onClick={() => setOpen(false)}>{text}</div>}
    </span>
  );
}

/* ─── NOC Search ─── */
function NOCSearch({ onSelect }) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchNOC(query), [query]);
  return (
    <div className="noc-search">
      <input
        className="noc-input"
        type="text"
        placeholder="Search your job title (e.g. Software Developer, Nurse)..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        aria-label="Search NOC job titles"
      />
      {results.length > 0 && (
        <div className="noc-results">
          {results.map(r => (
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
export default function Wizard({ onFinish, onProgress, initialAnswers }) {
  const { t } = useLanguage();
  const [answers, setAnswers] = useState(initialAnswers || {});
  const [currentIdx, setCurrentIdx] = useState(() => {
    const init = initialAnswers || {};
    for (let i = 0; i < STEPS.length; i++) if (isApplicable(STEPS[i], init)) return i;
    return 0;
  });
  const [history, setHistory] = useState([]);
  const [direction, setDirection] = useState(1);

  const step = STEPS[currentIdx];

  const handleAnswer = useCallback((key, value) => {
    setAnswers(prev => {
      const next = { ...prev, [key]: value };
      if (onProgress) onProgress(next);
      return next;
    });
  }, [onProgress]);

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
      role="form"
      aria-label="CRS Calculator wizard"
    >
      {/* Step Progress Bar */}
      <div className="progress-bar-wrap">
        <div className="progress-info">
          <span>{t('wizard.step')} {visibleNum} {t('wizard.of')} {visibleCount}</span>
        </div>
        <StepProgressBar pct={pct} />
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
          <h2 className="step-title">{step.title} {step.helpTip && <HelpTip text={step.helpTip} />}</h2>
          {step.subtitle && <p className="step-subtitle">{step.subtitle}</p>}

          {step.hasNOCSearch && (
            <NOCSearch onSelect={(teer) => handleAnswer(step.answerKey, teer)} />
          )}

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
          <motion.button className="btn-back" onClick={goBack} whileHover={{ x: -3 }} whileTap={{ scale: 0.95 }} aria-label="Go back">
            {t('wizard.back')}
          </motion.button>
        )}
        <StarBorder color="var(--primary)" speed="5s">
          <motion.button
            className={`btn-next${isLastVisible ? ' finish' : ''}`}
            disabled={!complete}
            onClick={goNext}
            whileHover={complete ? { scale: 1.02 } : {}}
            whileTap={complete ? { scale: 0.97 } : {}}
            aria-label={isLastVisible ? 'Calculate score' : 'Next step'}
          >
            {isLastVisible ? t('wizard.calculate') : t('wizard.next')}
          </motion.button>
        </StarBorder>
      </div>
    </motion.div>
  );
}
