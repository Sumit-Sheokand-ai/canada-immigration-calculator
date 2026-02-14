import * as D from '../data/crsData.js';

export const CRS_POLICY_VERSION = 'ircc-2025-03-25-v2';
export const CRS_POLICY_EFFECTIVE_DATE = '2025-03-25';

export const crsPolicy = {
  version: CRS_POLICY_VERSION,
  effectiveDate: CRS_POLICY_EFFECTIVE_DATE,
  notes: [
    'Arranged-employment CRS additional points removed effective March 25, 2025.',
    'PNP nomination remains +600 additional points.',
    'French additional points depend on both French and English thresholds.',
  ],
  tables: {
    agePoints: D.agePoints,
    educationPoints: D.educationPoints,
    firstLangPoints: D.firstLangPoints,
    secondLangPoints: D.secondLangPoints,
    canadianWorkPoints: D.canadianWorkPoints,
    spouseEducationPoints: D.spouseEducationPoints,
    spouseLangPoints: D.spouseLangPoints,
    spouseWorkPoints: D.spouseWorkPoints,
    eduRank: D.eduRank,
    eduLangTransfer: D.eduLangTransfer,
    eduCWETransfer: D.eduCWETransfer,
    fweLangTransfer: D.fweLangTransfer,
    fweCWETransfer: D.fweCWETransfer,
    certLangTransfer: D.certLangTransfer,
    additionalPointsTable: D.additionalPointsTable,
  },
  converters: {
    ieltsToCLB: D.convertIELTStoCLB,
    tefToNCLC: D.convertTEFtoNCLC,
    tcfToNCLC: D.convertTCFtoNCLC,
  },
  caps: {
    secondLanguageNoSpouse: 24,
    secondLanguageWithSpouse: 22,
    spouseTotal: 40,
    skillTransferabilityTotal: 100,
    additionalPointsTotal: 600,
    crsTotal: 1200,
  },
};
