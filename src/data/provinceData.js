/**
 * Provincial Nominee Program (PNP) data for the Province Recommender.
 * Each province lists key streams and criteria.
 */
export const provinces = [
  {
    id: 'on', name: 'Ontario', abbr: 'ON',
    streams: ['Human Capital Priorities', 'Skilled Trades', 'French-Speaking'],
    demandSectors: ['stem', 'healthcare', 'trade'],
    minCLB: 7, minEducation: 'bachelors', minWorkYears: 1,
    notes: 'Largest province. Strong demand for tech, healthcare, and skilled trades. Ontario often sends NOIs to Express Entry candidates with CRS 400+.',
  },
  {
    id: 'bc', name: 'British Columbia', abbr: 'BC',
    streams: ['Skills Immigration', 'Express Entry BC', 'Tech'],
    demandSectors: ['stem', 'healthcare', 'trade'],
    minCLB: 5, minEducation: 'two_year_post', minWorkYears: 1,
    notes: 'Tech hub (Vancouver). BC PNP Tech targets 29 in-demand occupations including software, data, and engineering roles.',
  },
  {
    id: 'ab', name: 'Alberta', abbr: 'AB',
    streams: ['Alberta Advantage Immigration', 'Express Entry Stream'],
    demandSectors: ['trade', 'healthcare', 'stem', 'transport'],
    minCLB: 5, minEducation: 'secondary', minWorkYears: 1,
    notes: 'Strong energy/oil sector. Growing tech scene in Calgary and Edmonton. Lower cost of living than ON/BC.',
  },
  {
    id: 'sk', name: 'Saskatchewan', abbr: 'SK',
    streams: ['International Skilled Worker', 'Express Entry'],
    demandSectors: ['agriculture', 'healthcare', 'trade', 'transport'],
    minCLB: 4, minEducation: 'secondary', minWorkYears: 1,
    notes: 'In-Demand Occupations list is broad. One of the easiest PNPs to qualify for. Agriculture and mining are key industries.',
  },
  {
    id: 'mb', name: 'Manitoba', abbr: 'MB',
    streams: ['Skilled Workers Overseas', 'Skilled Workers in Manitoba'],
    demandSectors: ['healthcare', 'agriculture', 'trade', 'transport'],
    minCLB: 5, minEducation: 'one_year_post', minWorkYears: 1,
    notes: 'Welcoming to newcomers. Strong need for healthcare workers and tradespeople. Lower CRS requirements than federal draws.',
  },
  {
    id: 'ns', name: 'Nova Scotia', abbr: 'NS',
    streams: ['Labour Market Priorities', 'Skilled Worker', 'Physician'],
    demandSectors: ['healthcare', 'trade', 'stem'],
    minCLB: 5, minEducation: 'one_year_post', minWorkYears: 1,
    notes: 'Part of Atlantic Immigration Program. Growing tech sector in Halifax. Healthcare workers are highly sought after.',
  },
  {
    id: 'nb', name: 'New Brunswick', abbr: 'NB',
    streams: ['Express Entry Labour Market', 'Skilled Workers with Employer Support'],
    demandSectors: ['healthcare', 'trade', 'agriculture'],
    minCLB: 5, minEducation: 'secondary', minWorkYears: 1,
    notes: 'Bilingual province (English/French). Part of Atlantic Immigration Program. Francophone candidates get priority.',
  },
  {
    id: 'pe', name: 'Prince Edward Island', abbr: 'PE',
    streams: ['Express Entry', 'Labour Impact'],
    demandSectors: ['agriculture', 'healthcare', 'trade'],
    minCLB: 5, minEducation: 'two_year_post', minWorkYears: 2,
    notes: 'Small province with lower competition. Agriculture and tourism are key industries.',
  },
  {
    id: 'nl', name: 'Newfoundland & Labrador', abbr: 'NL',
    streams: ['Express Entry', 'Skilled Worker', 'Priority Skills'],
    demandSectors: ['healthcare', 'trade', 'stem'],
    minCLB: 5, minEducation: 'one_year_post', minWorkYears: 1,
    notes: 'Part of Atlantic Immigration Program. Growing need for healthcare and tech workers. Oil and gas sector.',
  },
  {
    id: 'yt', name: 'Yukon', abbr: 'YT',
    streams: ['Yukon Express Entry', 'Skilled Worker'],
    demandSectors: ['trade', 'healthcare', 'transport'],
    minCLB: 4, minEducation: 'secondary', minWorkYears: 1,
    notes: 'Territory with small population. Job offer typically required. Good for tradespeople and healthcare workers.',
  },
];

const eduRank = {
  less_than_secondary: 0, secondary: 1, one_year_post: 2, two_year_post: 3,
  bachelors: 4, two_or_more: 5, masters: 6, doctoral: 7,
};

function eduMeetsMin(userEdu, minEdu) {
  return (eduRank[userEdu] || 0) >= (eduRank[minEdu] || 0);
}

/**
 * Score each province against the user's profile.
 * Returns sorted array with match percentage.
 */
export function recommendProvinces(answers) {
  const userCLB = getUserCLB(answers);
  const userEdu = answers.education || 'secondary';
  const userWorkYears = Math.max(
    parseInt(answers.canadianWorkExp) || 0,
    parseInt(answers.foreignWorkExp) || 0
  );
  const userSector = answers.occupationCategory || 'other';
  const hasFrench = answers.hasFrench === 'yes';

  return provinces
    .map(prov => {
      let score = 0;
      const maxScore = 100;

      // CLB match (30 pts)
      if (userCLB >= prov.minCLB) {
        score += 20;
        if (userCLB >= prov.minCLB + 2) score += 10;
      }

      // Education match (20 pts)
      if (eduMeetsMin(userEdu, prov.minEducation)) {
        score += 15;
        if ((eduRank[userEdu] || 0) >= 4) score += 5; // bachelor's+
      }

      // Work experience (20 pts)
      if (userWorkYears >= prov.minWorkYears) {
        score += 15;
        if (userWorkYears >= 3) score += 5;
      }

      // Sector demand (25 pts)
      if (prov.demandSectors.includes(userSector)) {
        score += 25;
      }

      // French bonus (5 pts)
      if (hasFrench && (prov.id === 'nb' || prov.id === 'on')) {
        score += 5;
      }

      const pct = Math.min(Math.round((score / maxScore) * 100), 100);
      return { ...prov, matchScore: pct };
    })
    .sort((a, b) => b.matchScore - a.matchScore);
}

function getUserCLB(answers) {
  if (answers.langTestType === 'celpip') {
    const skills = ['listening', 'reading', 'writing', 'speaking'];
    const vals = skills.map(s => parseInt(answers[`celpip_${s}`]) || 0);
    return Math.min(...vals);
  }
  if (answers.langTestType === 'ielts') {
    // Approximate: IELTS 6.0 ≈ CLB 7, 5.0 ≈ CLB 5
    const skills = ['listening', 'reading', 'writing', 'speaking'];
    const vals = skills.map(s => {
      const band = parseFloat(answers[`ielts_${s}`]) || 0;
      if (band >= 8.0) return 10;
      if (band >= 7.0) return 9;
      if (band >= 6.5) return 8;
      if (band >= 6.0) return 7;
      if (band >= 5.5) return 6;
      if (band >= 5.0) return 5;
      if (band >= 4.0) return 4;
      return 0;
    });
    return Math.min(...vals);
  }
  return 0;
}
