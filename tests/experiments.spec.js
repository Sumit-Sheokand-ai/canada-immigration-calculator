import { describe, expect, it } from 'vitest';
import { computeExperimentVariant, EXPERIMENT_DEFINITIONS, getExperimentAssignment } from '../src/utils/experiments';

describe('experiments utility', () => {
  it('returns deterministic variants for a stable visitor id', () => {
    const first = computeExperimentVariant('pricing_layout_v1', 'visitor_abc');
    const second = computeExperimentVariant('pricing_layout_v1', 'visitor_abc');
    expect(first).toBe(second);
    const knownVariants = EXPERIMENT_DEFINITIONS.pricing_layout_v1.variants.map((variant) => variant.id);
    expect(knownVariants).toContain(first);
  });

  it('falls back gracefully for unknown experiment keys', () => {
    const assignment = getExperimentAssignment('unknown_experiment_key');
    expect(assignment.experimentKey).toBe('unknown_experiment_key');
    expect(assignment.variant).toBe('control');
  });
});
