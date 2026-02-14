import { describe, expect, it } from 'vitest';
import {
  buildTrackingFromPlan,
  estimateTrackingCompletion,
  getDailyProgressStats,
  getTrackingProgress,
  toggleDailyTask,
  toggleMilestone,
} from '../src/utils/pathTrackingStore.js';

function samplePlan() {
  return {
    id: 'english-accelerator',
    estimatedMonths: 4,
    checks: { targetScore: 510, currentScore: 452 },
    milestones: [
      {
        id: 'm1',
        title: 'Baseline audit',
        details: 'Identify weakest abilities and set study baseline.',
        etaWeeks: 2,
        expectedGain: 4,
      },
      {
        id: 'm2',
        title: 'Focused skill sprint',
        details: 'Practice weakest modules with timed drills.',
        etaWeeks: 4,
        expectedGain: 10,
      },
    ],
  };
}

describe('path tracking store', () => {
  it('builds tracking with daily tasks and computed stats', () => {
    const tracking = buildTrackingFromPlan(samplePlan(), 452, 510);
    expect(tracking.status).toBe('active');
    expect(Array.isArray(tracking.milestones)).toBe(true);
    expect(Array.isArray(tracking.dailyTasks)).toBe(true);
    expect(tracking.dailyTasks.length).toBeGreaterThan(tracking.milestones.length);

    const stats = getDailyProgressStats(tracking);
    expect(stats.totalTasks).toBe(tracking.dailyTasks.length);
    expect(stats.completedTasks).toBe(0);
  });

  it('updates daily stats after toggling a daily task', () => {
    const tracking = buildTrackingFromPlan(samplePlan(), 452, 510);
    const firstTask = tracking.dailyTasks[0];
    const next = toggleDailyTask(tracking, firstTask.id);

    const stats = getDailyProgressStats(next);
    expect(stats.completedTasks).toBe(1);
    expect(getTrackingProgress(next)).toBeGreaterThan(0);
  });

  it('completion projection adjusts when pace improves', () => {
    const tracking = buildTrackingFromPlan(samplePlan(), 452, 510);
    const slowProjection = estimateTrackingCompletion(tracking);
    expect(slowProjection).toBeTruthy();
    expect(slowProjection.projectedDays).toBeGreaterThanOrEqual(slowProjection.baselineDays);

    const firstTask = tracking.dailyTasks[0];
    const improvedTracking = toggleDailyTask(tracking, firstTask.id);
    const improvedProjection = estimateTrackingCompletion(improvedTracking);
    expect(improvedProjection.projectedDays).toBeLessThanOrEqual(slowProjection.projectedDays);
  });

  it('milestone toggle contributes to overall progress', () => {
    const tracking = buildTrackingFromPlan(samplePlan(), 452, 510);
    const next = toggleMilestone(tracking, 'm1');
    expect(next.milestones.find((milestone) => milestone.id === 'm1')?.done).toBe(true);
    expect(getTrackingProgress(next)).toBeGreaterThan(0);
  });
});
