import { computeStrategicInsights } from '../utils/strategyHub';

self.onmessage = (event) => {
  const payload = event?.data || {};
  const requestId = payload.id;
  try {
    const computed = computeStrategicInsights(payload.input || {});
    self.postMessage({
      id: requestId,
      status: 'ok',
      data: computed,
    });
  } catch (error) {
    self.postMessage({
      id: requestId,
      status: 'error',
      error: String(error?.message || 'Worker computation failed'),
    });
  }
};
