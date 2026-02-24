/**
 * Canada Immigration CRS Data — ES Module
 * All scoring tables, conversion functions, and draw data.
 */

// Age Points [withoutSpouse, withSpouse]
export const agePoints = {
  17:[0,0],18:[99,90],19:[105,95],
  20:[110,100],21:[110,100],22:[110,100],23:[110,100],24:[110,100],
  25:[110,100],26:[110,100],27:[110,100],28:[110,100],29:[110,100],
  30:[105,95],31:[99,90],32:[94,85],33:[88,80],34:[83,75],
  35:[77,70],36:[72,65],37:[66,60],38:[61,55],39:[55,50],
  40:[50,45],41:[39,35],42:[28,25],43:[17,15],44:[6,5],
  45:[0,0],46:[0,0],47:[0,0]
};

export const educationPoints = {
  less_than_secondary:[0,0], secondary:[30,28],
  one_year_post:[90,84], two_year_post:[98,91],
  bachelors:[120,112], two_or_more:[128,119],
  masters:[135,126], doctoral:[150,140]
};

export const educationLabels = {
  less_than_secondary:"Less than High School",
  secondary:"High School Diploma",
  one_year_post:"1-Year Post-Secondary Certificate",
  two_year_post:"2-Year Post-Secondary Diploma",
  bachelors:"Bachelor's Degree (3+ years)",
  two_or_more:"Two or More Certificates (one 3+ yr)",
  masters:"Master's / Professional Degree",
  doctoral:"Doctoral Degree (PhD)"
};

// First Official Language per ability [without, with]
export const firstLangPoints = {
  0:[0,0],1:[0,0],2:[0,0],3:[0,0],
  4:[6,6],5:[6,6],6:[9,8],7:[17,16],
  8:[23,22],9:[31,29],10:[34,32],11:[34,32],12:[34,32]
};

export const secondLangPoints = {
  0:[0,0],1:[0,0],2:[0,0],3:[0,0],4:[0,0],
  5:[1,1],6:[1,1],7:[3,3],8:[3,3],
  9:[6,6],10:[6,6],11:[6,6],12:[6,6]
};

export const canadianWorkPoints = {
  0:[0,0],1:[40,35],2:[53,46],3:[64,56],4:[72,63],5:[80,70]
};

// Spouse Factors
export const spouseEducationPoints = {
  less_than_secondary:0,secondary:2,one_year_post:6,
  two_year_post:7,bachelors:8,two_or_more:9,masters:10,doctoral:10
};
export const spouseLangPoints = {
  0:0,1:0,2:0,3:0,4:1,5:1,6:1,7:3,8:3,9:5,10:5,11:5,12:5
};
export const spouseWorkPoints = {0:0,1:5,2:7,3:8,4:9,5:10};

// IELTS to CLB
const ieltsToCLBMap = {
  reading:  [{min:8.0,clb:10},{min:7.0,clb:9},{min:6.5,clb:8},{min:6.0,clb:7},{min:5.0,clb:6},{min:4.0,clb:5},{min:3.5,clb:4}],
  writing:  [{min:7.5,clb:10},{min:7.0,clb:9},{min:6.5,clb:8},{min:6.0,clb:7},{min:5.5,clb:6},{min:5.0,clb:5},{min:4.0,clb:4}],
  listening:[{min:8.5,clb:10},{min:8.0,clb:9},{min:7.5,clb:8},{min:6.0,clb:7},{min:5.5,clb:6},{min:5.0,clb:5},{min:4.5,clb:4}],
  speaking: [{min:7.5,clb:10},{min:7.0,clb:9},{min:6.5,clb:8},{min:6.0,clb:7},{min:5.5,clb:6},{min:5.0,clb:5},{min:4.0,clb:4}]
};

export function convertIELTStoCLB(skill, band) {
  const thresholds = ieltsToCLBMap[skill];
  if (!thresholds) return 0;
  for (const t of thresholds) {
    if (band >= t.min) return t.clb;
  }
  return 0;
}

// Skill Transferability
export const eduRank = {
  less_than_secondary:0,secondary:0,one_year_post:1,
  two_year_post:2,bachelors:3,two_or_more:3,masters:3,doctoral:3
};
export const eduLangTransfer = [[0,0,0],[0,13,25],[0,25,50],[0,25,50]];
export const eduCWETransfer  = [[0,0,0],[0,13,25],[0,25,50],[0,25,50]];
export const fweLangTransfer = [[0,0,0],[0,13,25],[0,25,50]];
export const fweCWETransfer  = [[0,0,0],[0,13,25],[0,25,50]];
export const certLangTransfer = [0,25,50];

export const additionalPointsTable = {
  // IRCC removed arranged employment CRS additional points on 2025-03-25.
  pnp_nomination:600, job_offer_00:0, job_offer_other:0,
  canadian_edu_short:15, canadian_edu_long:30,
  sibling_in_canada:15,
  // IRCC: French NCLC 7+ with English CLB 4 or less = 25 pts
  // IRCC: French NCLC 7+ with English CLB 5+ = 50 pts
  french_strong_weak_english:25, french_strong_strong_english:50
};

// Category-based selection draws (IRCC introduced June 2023)
// Each category has eligibility criteria and recent cutoff ranges
export const categoryBasedInfo = [
  {
    id: 'french',
    name: 'French-Language Proficiency',
    icon: 'FR',
    description: 'For candidates with strong French language skills. Cutoffs are significantly lower than general draws.',
    eligibility: 'You need NCLC/CLB 7 or higher in ALL four French abilities (listening, reading, writing, speaking).',
    recentCutoff: 400,
    cutoffRange: '379–416',
    check: (answers) => {
      if (!(answers.firstOfficialLanguage === 'french' || answers.hasFrench === 'yes')) return false;
      const skills = ['listening','reading','writing','speaking'];
      return skills.every(s => (parseInt(answers[`french_${s}`]) || 0) >= 7);
    }
  },
  {
    id: 'healthcare',
    name: 'Healthcare Occupations',
    icon: 'HC',
    description: 'For candidates working in healthcare and social services (nurses, doctors, pharmacists, medical technicians, etc.).',
    eligibility: 'Your primary occupation must be in a healthcare or social services NOC code (e.g., NOC 31, 32, 33).',
    recentCutoff: 476,
    cutoffRange: '422–476',
    check: (answers) => answers.occupationCategory === 'healthcare'
  },
  {
    id: 'stem',
    name: 'STEM Occupations',
    icon: 'ST',
    description: 'For candidates in Science, Technology, Engineering, and Mathematics fields (software developers, engineers, data scientists, etc.).',
    eligibility: 'Your primary occupation must be in a STEM-related NOC code (e.g., NOC 21, 22).',
    recentCutoff: 481,
    cutoffRange: '470–500',
    check: (answers) => answers.occupationCategory === 'stem'
  },
  {
    id: 'trade',
    name: 'Trade Occupations',
    icon: 'TR',
    description: 'For candidates in skilled trades (electricians, plumbers, welders, carpenters, etc.).',
    eligibility: 'Your primary occupation must be in a trade-related NOC code (e.g., NOC 72, 73).',
    recentCutoff: 433,
    cutoffRange: '388–433',
    check: (answers) => answers.occupationCategory === 'trade'
  },
  {
    id: 'transport',
    name: 'Transport Occupations',
    icon: 'TP',
    description: 'For candidates in transport occupations (truck drivers, pilots, railway workers, etc.).',
    eligibility: 'Your primary occupation must be in a transport-related NOC code (e.g., NOC 73, 75).',
    recentCutoff: 435,
    cutoffRange: '410–435',
    check: (answers) => answers.occupationCategory === 'transport'
  },
  {
    id: 'agriculture',
    name: 'Agriculture & Agri-food',
    icon: 'AG',
    description: 'For candidates in agriculture and agri-food occupations (farm workers, food processing, meat cutters, etc.).',
    eligibility: 'Your primary occupation must be in an agriculture or agri-food NOC code (e.g., NOC 82, 84, 85).',
    recentCutoff: 440,
    cutoffRange: '354–440',
    check: (answers) => answers.occupationCategory === 'agriculture'
  }
];

export const nocTEER = [
  {value:"teer_0",label:"TEER 0 – Management",examples:"Financial managers, HR managers"},
  {value:"teer_1",label:"TEER 1 – Professional",examples:"Software engineers, Accountants, Nurses"},
  {value:"teer_2",label:"TEER 2 – Technical / Skilled Trades",examples:"Electricians, Plumbers, Paralegals"},
  {value:"teer_3",label:"TEER 3 – Intermediate",examples:"Bakers, Dental assistants"},
  {value:"teer_4",label:"TEER 4 – Clerical / Service",examples:"Retail salespersons, Home care"},
  {value:"teer_5",label:"TEER 5 – Labour",examples:"Landscaping labourers, Janitors"}
];

export const latestDraws = {
  lastUpdated: "2026-02-24",
  generalProgram: [
    { date: "2026-02-17", score: 508, invitations: 6000, program: "Canadian Experience Class" },
    { date: "2026-01-21", score: 509, invitations: 6000, program: "Canadian Experience Class" },
    { date: "2026-01-07", score: 511, invitations: 8000, program: "Canadian Experience Class" },
    { date: "2025-12-16", score: 515, invitations: 5000, program: "Canadian Experience Class" },
    { date: "2025-12-10", score: 520, invitations: 6000, program: "Canadian Experience Class" },
    { date: "2025-11-26", score: 531, invitations: 1000, program: "Canadian Experience Class" },
  ],
  categoryBased: [
    { date: "2026-02-20", score: 467, invitations: 4000, program: "Healthcare and Social Services Occupations," },
    { date: "2026-02-19", score: 169, invitations: 391, program: "Physicians with Canadian Work Experience," },
    { date: "2026-02-06", score: 400, invitations: 8500, program: "French-Language proficiency" },
    { date: "2025-12-17", score: 399, invitations: 6000, program: "French language proficiency" },
    { date: "2025-12-11", score: 476, invitations: 1000, program: "Healthcare and social services occupations" },
    { date: "2025-11-28", score: 408, invitations: 6000, program: "French language proficiency" },
    { date: "2025-11-14", score: 462, invitations: 3500, program: "Healthcare and social services occupations" },
  ],
  pnpDraws: [
    { date: "2026-02-16", score: 789, invitations: 279, program: "Provincial Nominee Program" },
    { date: "2026-02-03", score: 749, invitations: 423, program: "Provincial Nominee Program" },
    { date: "2026-01-20", score: 746, invitations: 681, program: "Provincial Nominee Program" },
    { date: "2026-01-05", score: 711, invitations: 574, program: "Provincial Nominee Program" },
    { date: "2025-12-15", score: 731, invitations: 399, program: "Provincial Nominee Program" },
  ],
  pnpRanges: { low: 711, high: 789, note: "PNP candidates receive +600 CRS. Typical base: 80–250." },
  averageCutoff: 516,
};

export const pathways = {
  fsw:{name:"Federal Skilled Worker",requirements:["1+ year continuous skilled work (NOC TEER 0/1/2/3)","Language: minimum CLB 7 all abilities","Education: Canadian or equivalent foreign credential (ECA)"]},
  cec:{name:"Canadian Experience Class",requirements:["1+ year Canadian skilled work in last 3 years","Language: CLB 7 for TEER 0/1, CLB 5 for TEER 2/3"]},
  fst:{name:"Federal Skilled Trades",requirements:["2+ years skilled trade experience in last 5 years","Language: CLB 5 speaking/listening, CLB 4 reading/writing","Valid job offer or certificate of qualification"]},
  pnp:{name:"Provincial Nominee Program",requirements:["Nomination by a Canadian province/territory","Each province has own criteria","+600 CRS points upon nomination"]},
  aip:{name:"Atlantic Immigration Program",requirements:["Job offer from designated Atlantic Canada employer","1 year work experience (TEER 0-3)","Language: CLB 5 for TEER 0-3, CLB 4 for TEER 4"]}
};

export const ieltsBands = ["0","0.5","1.0","1.5","2.0","2.5","3.0","3.5","4.0","4.5","5.0","5.5","6.0","6.5","7.0","7.5","8.0","8.5","9.0"];
export const celpipLevels = ["M","1","2","3","4","5","6","7","8","9","10","11","12"];
export const clbLevels = ["1","2","3","4","5","6","7","8","9","10","11","12"];

// TEF Canada score ranges (display values for wizard grid)
export const tefBands = {
  listening: ["145","181","217","249","280","298","316","334","349","360"],
  reading:  ["121","151","181","207","233","248","263","278","294","310"],
  writing:  ["181","226","271","310","349","371","393","415","437","450"],
  speaking: ["181","226","271","310","349","371","393","415","437","450"]
};

// TEF → NCLC conversion
const tefToNCLCMap = {
  listening: [{min:360,nclc:10},{min:349,nclc:9},{min:334,nclc:8},{min:316,nclc:7},{min:298,nclc:6},{min:280,nclc:5},{min:249,nclc:4},{min:217,nclc:3},{min:181,nclc:2},{min:145,nclc:1}],
  reading:  [{min:310,nclc:10},{min:294,nclc:9},{min:278,nclc:8},{min:263,nclc:7},{min:248,nclc:6},{min:233,nclc:5},{min:207,nclc:4},{min:181,nclc:3},{min:151,nclc:2},{min:121,nclc:1}],
  writing:  [{min:450,nclc:10},{min:437,nclc:9},{min:415,nclc:8},{min:393,nclc:7},{min:371,nclc:6},{min:349,nclc:5},{min:310,nclc:4},{min:271,nclc:3},{min:226,nclc:2},{min:181,nclc:1}],
  speaking: [{min:450,nclc:10},{min:437,nclc:9},{min:415,nclc:8},{min:393,nclc:7},{min:371,nclc:6},{min:349,nclc:5},{min:310,nclc:4},{min:271,nclc:3},{min:226,nclc:2},{min:181,nclc:1}]
};

export function convertTEFtoNCLC(skill, score) {
  const thresholds = tefToNCLCMap[skill];
  if (!thresholds) return 0;
  for (const t of thresholds) {
    if (score >= t.min) return t.nclc;
  }
  return 0;
}

// TCF Canada score ranges
export const tcfBands = {
  listening: ["331","369","398","453","503","523","549","570","590","610"],
  reading:  ["342","375","406","453","499","524","549","575","600","625"],
  writing:  ["4","6","7","10","12","14","16","18","19","20"],
  speaking: ["4","6","7","10","12","14","16","18","19","20"]
};

// TCF → NCLC conversion
const tcfToNCLCMap = {
  listening: [{min:610,nclc:10},{min:590,nclc:9},{min:570,nclc:8},{min:549,nclc:7},{min:523,nclc:6},{min:503,nclc:5},{min:453,nclc:4},{min:398,nclc:3},{min:369,nclc:2},{min:331,nclc:1}],
  reading:  [{min:625,nclc:10},{min:600,nclc:9},{min:575,nclc:8},{min:549,nclc:7},{min:524,nclc:6},{min:499,nclc:5},{min:453,nclc:4},{min:406,nclc:3},{min:375,nclc:2},{min:342,nclc:1}],
  writing:  [{min:20,nclc:10},{min:19,nclc:9},{min:18,nclc:8},{min:16,nclc:7},{min:14,nclc:6},{min:12,nclc:5},{min:10,nclc:4},{min:7,nclc:3},{min:6,nclc:2},{min:4,nclc:1}],
  speaking: [{min:20,nclc:10},{min:19,nclc:9},{min:18,nclc:8},{min:16,nclc:7},{min:14,nclc:6},{min:12,nclc:5},{min:10,nclc:4},{min:7,nclc:3},{min:6,nclc:2},{min:4,nclc:1}]
};

export function convertTCFtoNCLC(skill, score) {
  const thresholds = tcfToNCLCMap[skill];
  if (!thresholds) return 0;
  for (const t of thresholds) {
    if (score >= t.min) return t.nclc;
  }
  return 0;
}
