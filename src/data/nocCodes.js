/**
 * Common NOC (National Occupational Classification) codes
 * with job titles and TEER levels for search functionality.
 */
export const nocCodes = [
  // TEER 0 – Management
  { noc: '00010', title: 'Financial Manager', teer: 'teer_0', keywords: 'finance banking accounting' },
  { noc: '00012', title: 'Human Resources Manager', teer: 'teer_0', keywords: 'hr personnel staffing' },
  { noc: '00013', title: 'Purchasing Manager', teer: 'teer_0', keywords: 'procurement supply chain' },
  { noc: '00015', title: 'Senior Government Manager', teer: 'teer_0', keywords: 'government public administration' },
  { noc: '10010', title: 'Engineering Manager', teer: 'teer_0', keywords: 'engineering technical director' },
  { noc: '10019', title: 'IT Manager', teer: 'teer_0', keywords: 'technology information systems director CTO' },
  { noc: '10020', title: 'Construction Manager', teer: 'teer_0', keywords: 'building project site superintendent' },
  { noc: '10029', title: 'Restaurant Manager', teer: 'teer_0', keywords: 'food service hospitality hotel' },
  { noc: '20010', title: 'Sales Manager', teer: 'teer_0', keywords: 'marketing retail business development' },

  // TEER 1 – Professional
  { noc: '21210', title: 'Software Developer', teer: 'teer_1', keywords: 'programmer coder web app frontend backend fullstack' },
  { noc: '21211', title: 'Data Scientist', teer: 'teer_1', keywords: 'machine learning AI analytics big data' },
  { noc: '21220', title: 'Cybersecurity Analyst', teer: 'teer_1', keywords: 'security information network' },
  { noc: '21230', title: 'Systems Analyst', teer: 'teer_1', keywords: 'IT consultant business analyst ERP' },
  { noc: '21310', title: 'Civil Engineer', teer: 'teer_1', keywords: 'structural infrastructure roads bridges' },
  { noc: '21311', title: 'Mechanical Engineer', teer: 'teer_1', keywords: 'machines HVAC automotive manufacturing' },
  { noc: '21320', title: 'Electrical Engineer', teer: 'teer_1', keywords: 'electronics power systems circuits' },
  { noc: '21321', title: 'Chemical Engineer', teer: 'teer_1', keywords: 'process plant petroleum refinery' },
  { noc: '31100', title: 'Registered Nurse', teer: 'teer_1', keywords: 'RN nursing hospital patient care' },
  { noc: '31110', title: 'Physician / Doctor', teer: 'teer_1', keywords: 'MD medical general practitioner specialist' },
  { noc: '31120', title: 'Pharmacist', teer: 'teer_1', keywords: 'pharmacy medication dispensing' },
  { noc: '31121', title: 'Dentist', teer: 'teer_1', keywords: 'dental oral surgeon teeth' },
  { noc: '31200', title: 'Physiotherapist', teer: 'teer_1', keywords: 'physical therapy rehabilitation' },
  { noc: '41200', title: 'Accountant', teer: 'teer_1', keywords: 'CPA auditor bookkeeper tax financial' },
  { noc: '41210', title: 'Financial Analyst', teer: 'teer_1', keywords: 'investment banking equity research' },
  { noc: '41300', title: 'Architect', teer: 'teer_1', keywords: 'building design urban planning' },
  { noc: '41400', title: 'University Professor', teer: 'teer_1', keywords: 'teacher lecturer academic research' },
  { noc: '41401', title: 'Secondary School Teacher', teer: 'teer_1', keywords: 'high school education teaching' },
  { noc: '41301', title: 'Graphic Designer', teer: 'teer_1', keywords: 'visual UI UX creative design' },
  { noc: '21234', title: 'Web Developer', teer: 'teer_1', keywords: 'website html css javascript react node' },
  { noc: '21223', title: 'Database Analyst', teer: 'teer_1', keywords: 'SQL database administrator DBA' },

  // TEER 2 – Technical / Skilled Trades
  { noc: '22100', title: 'Electrician', teer: 'teer_2', keywords: 'electrical wiring power installation' },
  { noc: '22101', title: 'Plumber', teer: 'teer_2', keywords: 'plumbing pipes water gas fitting' },
  { noc: '22110', title: 'Welder', teer: 'teer_2', keywords: 'welding fabrication metal joining' },
  { noc: '22111', title: 'Carpenter', teer: 'teer_2', keywords: 'woodwork framing construction cabinetry' },
  { noc: '22210', title: 'Paralegal', teer: 'teer_2', keywords: 'legal assistant law clerk' },
  { noc: '22300', title: 'Dental Hygienist', teer: 'teer_2', keywords: 'teeth cleaning oral health' },
  { noc: '22301', title: 'Medical Lab Technician', teer: 'teer_2', keywords: 'laboratory blood test specimen' },
  { noc: '22220', title: 'HVAC Technician', teer: 'teer_2', keywords: 'heating ventilation air conditioning refrigeration' },
  { noc: '22230', title: 'Heavy Equipment Mechanic', teer: 'teer_2', keywords: 'machinery diesel repair maintenance' },
  { noc: '22310', title: 'Automotive Mechanic', teer: 'teer_2', keywords: 'car vehicle repair service technician' },

  // TEER 3 – Intermediate
  { noc: '33100', title: 'Dental Assistant', teer: 'teer_3', keywords: 'dentistry chairside oral' },
  { noc: '33101', title: 'Nurse Aide / Orderly', teer: 'teer_3', keywords: 'healthcare support patient nursing assistant' },
  { noc: '33102', title: 'Pharmacy Technician', teer: 'teer_3', keywords: 'medication dispensing prescription' },
  { noc: '33110', title: 'Baker', teer: 'teer_3', keywords: 'bakery pastry bread baking' },
  { noc: '33111', title: 'Butcher / Meat Cutter', teer: 'teer_3', keywords: 'meat processing cutting food' },
  { noc: '33200', title: 'Cook / Chef', teer: 'teer_3', keywords: 'cooking kitchen restaurant food preparation' },
  { noc: '73300', title: 'Truck Driver', teer: 'teer_3', keywords: 'transport delivery long haul commercial driving' },
  { noc: '73301', title: 'Bus Driver', teer: 'teer_3', keywords: 'transit public transport passenger' },
  { noc: '84100', title: 'Farm Worker', teer: 'teer_3', keywords: 'agriculture livestock crop harvesting' },
  { noc: '84120', title: 'Landscaping Worker', teer: 'teer_3', keywords: 'gardening grounds maintenance outdoor' },
];

/**
 * Search NOC codes by keyword.
 * Returns matching entries sorted by relevance.
 */
export function searchNOC(query) {
  if (!query || query.trim().length < 2) return [];
  const terms = query.toLowerCase().split(/\s+/);
  const scored = nocCodes
    .map(entry => {
      let score = 0;
      for (const term of terms) {
        if (entry.title.toLowerCase().includes(term)) score += 3;
        else if (entry.keywords.toLowerCase().includes(term)) score += 2;
        else if (entry.noc.includes(term)) score += 1;
      }
      return { ...entry, score };
    })
    .filter(e => e.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, 8);
}
