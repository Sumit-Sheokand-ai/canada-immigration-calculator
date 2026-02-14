import { describe, it, expect } from 'vitest';
import * as D from '../src/data/crsData.js';
import { calculate } from '../src/scoring/scoring.js';

function baseAnswers() {
  return {
    pathway: 'fsw',
    firstOfficialLanguage: 'english',
    age: '30',
    education: 'secondary',
    langTestType: 'celpip',
    celpip_listening: '0',
    celpip_reading: '0',
    celpip_writing: '0',
    celpip_speaking: '0',
    hasFrench: 'no',
    canadianWorkExp: '0',
    foreignWorkExp: '0',
    hasSpouse: 'no',
    hasPNP: 'no',
    hasJobOffer: 'no',
    canadianEducation: 'no',
    hasSibling: 'no',
  };
}

function withAccompanyingSpouse(answers) {
  return {
    ...answers,
    hasSpouse: 'yes',
    spouseIsCanadian: 'no',
    spouseAccompanying: 'yes',
    spouseEducation: 'less_than_secondary',
    spouseLang_listening: '0',
    spouseLang_reading: '0',
    spouseLang_writing: '0',
    spouseLang_speaking: '0',
    spouseCanadianWork: '0',
  };
}

describe('CRS core scoring table rules', () => {
  it('applies every age table entry for single and accompanying spouse', () => {
    for (const [age, points] of Object.entries(D.agePoints)) {
      const single = calculate({ ...baseAnswers(), age: String(age) });
      expect(single.details.age).toBe(points[0]);

      const married = calculate(withAccompanyingSpouse({ ...baseAnswers(), age: String(age) }));
      expect(married.details.age).toBe(points[1]);
    }
  });

  it('applies every education table entry for single and accompanying spouse', () => {
    for (const [edu, points] of Object.entries(D.educationPoints)) {
      const single = calculate({ ...baseAnswers(), education: edu });
      expect(single.details.education).toBe(points[0]);

      const married = calculate(withAccompanyingSpouse({ ...baseAnswers(), education: edu }));
      expect(married.details.education).toBe(points[1]);
    }
  });

  it('applies every canadian work table entry', () => {
    for (const [years, points] of Object.entries(D.canadianWorkPoints)) {
      const single = calculate({ ...baseAnswers(), canadianWorkExp: String(years) });
      expect(single.details.canadianWork).toBe(points[0]);

      const married = calculate(withAccompanyingSpouse({ ...baseAnswers(), canadianWorkExp: String(years) }));
      expect(married.details.canadianWork).toBe(points[1]);
    }
  });

  it('applies first language table per skill (CELPIP) and four-skill sum', () => {
    for (const [clb, points] of Object.entries(D.firstLangPoints)) {
      const single = calculate({
        ...baseAnswers(),
        celpip_listening: clb,
        celpip_reading: clb,
        celpip_writing: clb,
        celpip_speaking: clb,
      });
      expect(single.details.firstLanguage).toBe(points[0] * 4);

      const married = calculate(withAccompanyingSpouse({
        ...baseAnswers(),
        celpip_listening: clb,
        celpip_reading: clb,
        celpip_writing: clb,
        celpip_speaking: clb,
      }));
      expect(married.details.firstLanguage).toBe(points[1] * 4);
    }
  });

  it('caps second language points according to single/married caps', () => {
    for (const [clb, points] of Object.entries(D.secondLangPoints)) {
      const single = calculate({
        ...baseAnswers(),
        hasFrench: 'yes',
        french_listening: clb,
        french_reading: clb,
        french_writing: clb,
        french_speaking: clb,
      });
      expect(single.details.secondLanguage).toBe(Math.min(points[0] * 4, 24));

      const married = calculate(withAccompanyingSpouse({
        ...baseAnswers(),
        hasFrench: 'yes',
        french_listening: clb,
        french_reading: clb,
        french_writing: clb,
        french_speaking: clb,
      }));
      expect(married.details.secondLanguage).toBe(Math.min(points[1] * 4, 22));
    }
  });

  it('adds +600 for PNP nomination', () => {
    const withoutPNP = calculate({ ...baseAnswers() });
    const withPNP = calculate({ ...baseAnswers(), hasPNP: 'yes' });
    expect(withPNP.details.additionalTotal - withoutPNP.details.additionalTotal).toBe(600);
  });

  it('does not add CRS points for valid job offers after policy update', () => {
    const noOffer = calculate({ ...baseAnswers(), hasJobOffer: 'no' });
    const withOffer = calculate({
      ...baseAnswers(),
      hasJobOffer: 'yes',
      jobOfferTeer: 'teer_0',
      jobOfferMajorGroup00: 'yes',
    });
    expect(withOffer.details.additionalTotal).toBe(noOffer.details.additionalTotal);
  });

  it('applies French additional points based on English strength', () => {
    const weakEnglish = calculate({
      ...baseAnswers(),
      hasFrench: 'yes',
      french_listening: '7',
      french_reading: '7',
      french_writing: '7',
      french_speaking: '7',
      celpip_listening: '4',
      celpip_reading: '4',
      celpip_writing: '4',
      celpip_speaking: '4',
    });

    const strongEnglish = calculate({
      ...baseAnswers(),
      hasFrench: 'yes',
      french_listening: '7',
      french_reading: '7',
      french_writing: '7',
      french_speaking: '7',
      celpip_listening: '9',
      celpip_reading: '9',
      celpip_writing: '9',
      celpip_speaking: '9',
    });

    expect(strongEnglish.details.additionalTotal - weakEnglish.details.additionalTotal).toBe(25);
  });

  it('supports French as first official language for first-language CRS points', () => {
    const frFirst = calculate({
      ...baseAnswers(),
      firstOfficialLanguage: 'french',
      langTestType: 'none',
      hasFrench: 'no',
      frenchTestType: 'clb',
      french_listening: '9',
      french_reading: '9',
      french_writing: '9',
      french_speaking: '9',
    });
    expect(frFirst.details.firstLanguage).toBe(D.firstLangPoints[9][0] * 4);
    expect(frFirst.details.secondLanguage).toBe(0);
  });

  it('awards second-language + French additional points when French is first official and English exists', () => {
    const frFirstWithEnglish = calculate({
      ...baseAnswers(),
      firstOfficialLanguage: 'french',
      hasFrench: 'no',
      frenchTestType: 'clb',
      french_listening: '9',
      french_reading: '9',
      french_writing: '9',
      french_speaking: '9',
      langTestType: 'celpip',
      celpip_listening: '9',
      celpip_reading: '9',
      celpip_writing: '9',
      celpip_speaking: '9',
    });
    expect(frFirstWithEnglish.details.secondLanguage).toBe(Math.min(D.secondLangPoints[9][0] * 4, 24));
    expect(frFirstWithEnglish.details.additionalTotal).toBe(50);
  });
});
