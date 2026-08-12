import {
  processingMetadata,
  type EventProcessingMetrics,
} from './event-intelligence.js';

export function addEventProcessingMetrics(
  total: EventProcessingMetrics,
  result: { processingMetadata: EventProcessingMetrics },
): EventProcessingMetrics {
  const next = processingMetadata();
  for (const key of Object.keys(next) as (keyof EventProcessingMetrics)[])
    next[key] = total[key] + result.processingMetadata[key];
  return next;
}
