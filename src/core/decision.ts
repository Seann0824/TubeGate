import { record } from '../types';
import type { Rule, Decision, Match } from '../types';
import * as E from '../shared/core';

// Provider-neutral: the only accepted input is {ruleId: probability}.
function decide(input: unknown, rules: Rule[]): Decision {
  const scores = record(input);
  const results: Record<string, number> = {};
  const matches: Match[] = [];
  for (const rule of (rules || []).filter((item) => item.enabled !== false)) {
    const probability = scores && scores[rule.id];
    if (
      typeof probability !== 'number' ||
      !Number.isFinite(probability) ||
      probability < 0 ||
      probability > 1
    ) {
      throw Object.assign(new Error('Invalid classification scores'), {
        code: 'API_INVALID_RESPONSE',
      });
    }
    results[rule.id] = probability;
    const threshold = E.normalizeThreshold(rule.threshold);
    if (probability >= threshold)
      matches.push({ ruleId: rule.id, name: rule.name, probability, threshold });
  }
  matches.sort((a, b) => b.probability - a.probability);
  return { results, matches, shouldHide: matches.length > 0 };
}

export { decide };
