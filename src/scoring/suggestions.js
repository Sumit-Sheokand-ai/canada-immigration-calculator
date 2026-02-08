import { calculate, recalcWith, getMinCLB, getMinFrenchCLB, hasAccompanyingSpouse } from './scoring.js';

function makeSuggestion(title, description, potentialGain, difficulty, timeframe, icon) {
  return { title, description, potentialGain, difficulty, timeframe, icon };
}

export function generateSuggestions(answers, result) {
  const suggestions = [];
  const minCLB = getMinCLB(answers);

  // Language improvement
  if (minCLB < 10) {
    const target = Math.min(minCLB + 1, 10);
    const testType = answers.langTestType === 'celpip' ? 'CELPIP' : 'IELTS';
    const overrides = {};
    const skills = ['listening', 'reading', 'writing', 'speaking'];
    for (const s of skills) {
      const key = answers.langTestType === 'celpip' ? `celpip_${s}` : `ielts_${s}`;
      const cur = answers.langTestType === 'celpip'
        ? parseInt(answers[key]) || 0
        : parseFloat(answers[key]) || 0;
      if (answers.langTestType === 'celpip') {
        overrides[key] = Math.max(cur, target);
      } else {
        // rough IELTS bump
        overrides[key] = Math.max(cur, cur + 0.5);
      }
    }
    const newResult = recalcWith(answers, overrides);
    const gain = newResult.total - result.total;
    if (gain > 0) {
      suggestions.push(makeSuggestion(
        `Improve ${testType} Scores`,
        `Raising your weakest ${testType} skill to CLB ${target} could add significant points. Focus on your lowest band.`,
        gain, 'Medium', '2-4 months', 'language'
      ));
    }
  }

  // Education upgrade
  const eduOrder = ['none', 'secondary', 'oneYear', 'twoYear', 'bachelors', 'twoOrMoreCreds', 'masters', 'doctoral'];
  const curIdx = eduOrder.indexOf(answers.education);
  if (curIdx >= 0 && curIdx < eduOrder.length - 1) {
    const nextEdu = eduOrder[curIdx + 1];
    const newResult = recalcWith(answers, { education: nextEdu });
    const gain = newResult.total - result.total;
    if (gain > 0) {
      const labels = {
        secondary: 'high school diploma', oneYear: '1-year diploma', twoYear: '2-year diploma',
        bachelors: "bachelor's degree", twoOrMoreCreds: 'two credentials', masters: "master's degree", doctoral: 'doctoral degree'
      };
      suggestions.push(makeSuggestion(
        'Higher Education',
        `Completing a ${labels[nextEdu] || 'higher credential'} could boost your score.`,
        gain, 'Hard', '1-4 years', 'education'
      ));
    }
  }

  // Canadian work experience
  const cwe = parseInt(answers.canadianWorkExp) || 0;
  if (cwe < 5) {
    const newResult = recalcWith(answers, { canadianWorkExp: String(cwe + 1) });
    const gain = newResult.total - result.total;
    if (gain > 0) {
      suggestions.push(makeSuggestion(
        'Gain Canadian Work Experience',
        `An additional year of Canadian work experience adds points across multiple categories including skill transferability.`,
        gain, 'Hard', '1 year', 'work'
      ));
    }
  }

  // French language
  if (answers.hasFrench !== 'yes') {
    const frOverrides = { hasFrench: 'yes', french_listening: '7', french_reading: '7', french_writing: '7', french_speaking: '7' };
    const newResult = recalcWith(answers, frOverrides);
    const gain = newResult.total - result.total;
    if (gain > 0) {
      suggestions.push(makeSuggestion(
        'Learn French (TEF/TCF)',
        `Strong French skills (CLB 7+) earn additional points, especially combined with good English.`,
        gain, 'Hard', '6-12 months', 'french'
      ));
    }
  }

  // PNP nomination
  if (answers.hasPNP !== 'yes') {
    suggestions.push(makeSuggestion(
      'Provincial Nominee Program',
      `A PNP nomination adds 600 points, virtually guaranteeing an ITA. Explore programs in provinces like Ontario, BC, Alberta and Saskatchewan.`,
      600, 'Hard', '3-12 months', 'province'
    ));
  }

  // Job offer
  if (answers.hasJobOffer !== 'yes') {
    const newResult = recalcWith(answers, { hasJobOffer: 'yes', jobOfferTeer: 'teer_0' });
    const gain = newResult.total - result.total;
    if (gain > 0) {
      suggestions.push(makeSuggestion(
        'Obtain LMIA-Backed Job Offer',
        `A valid job offer with LMIA in a TEER 0-3 occupation adds 50-200 points.`,
        gain, 'Hard', '3-6 months', 'job'
      ));
    }
  }

  // Canadian education
  if (answers.canadianEducation !== 'yes') {
    suggestions.push(makeSuggestion(
      'Study in Canada',
      `A Canadian credential (1-2 year program) adds 15 points, or 30 points for a 3+ year program.`,
      30, 'Hard', '1-3 years', 'study'
    ));
  }

  // Sibling in Canada
  if (answers.hasSibling !== 'yes') {
    suggestions.push(makeSuggestion(
      'Sibling in Canada (If Applicable)',
      `If you have a sibling who is a Canadian citizen or PR, this adds 15 points. Check if any siblings qualify.`,
      15, 'Easy', 'N/A', 'family'
    ));
  }

  // Spouse language improvement
  if (hasAccompanyingSpouse(answers)) {
    const skills = ['listening', 'reading', 'writing', 'speaking'];
    let minSpouse = 99;
    for (const s of skills) {
      const v = parseInt(answers[`spouseLang_${s}`]) || 0;
      if (v < minSpouse) minSpouse = v;
    }
    if (minSpouse < 9) {
      const target = Math.min(minSpouse + 1, 9);
      const overrides = {};
      for (const s of skills) overrides[`spouseLang_${s}`] = String(Math.max(parseInt(answers[`spouseLang_${s}`]) || 0, target));
      const newResult = recalcWith(answers, overrides);
      const gain = newResult.total - result.total;
      if (gain > 0) {
        suggestions.push(makeSuggestion(
          "Improve Spouse's Language Scores",
          `Your spouse's language improvement to CLB ${target} could add points.`,
          gain, 'Medium', '2-4 months', 'language'
        ));
      }
    }
  }

  // Sort by potential gain descending
  suggestions.sort((a, b) => b.potentialGain - a.potentialGain);
  return suggestions;
}

export function estimateTimeline(result) {
  const score = result.total;
  if (score >= 500) return { label: 'Very Strong', months: '1-3', description: 'You are very likely to receive an ITA in the next few draws.' };
  if (score >= 470) return { label: 'Strong', months: '3-6', description: 'Your score is competitive. An ITA is likely within a few months.' };
  if (score >= 440) return { label: 'Moderate', months: '6-12', description: 'Your score is near recent cutoffs. Category-based draws may help.' };
  if (score >= 400) return { label: 'Below Average', months: '12-18', description: 'You may need to improve your profile or target a category-based draw.' };
  return { label: 'Needs Improvement', months: '18+', description: 'Significant profile improvements are recommended before applying.' };
}
