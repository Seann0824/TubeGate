(function (root) {
  'use strict';
  const E = root.SocialMediaGate || require('../shared/core.js');

  // Provider-neutral: the only accepted input is {ruleId: probability}.
  function decide(scores, rules) {
    const results = {};
    const matches = [];
    for (const rule of (rules || []).filter((item) => item.enabled !== false)) {
      const probability = scores && scores[rule.id];
      if (typeof probability !== 'number' || !Number.isFinite(probability) || probability < 0 || probability > 1) {
        throw Object.assign(new Error('Invalid classification scores'), { code: 'API_INVALID_RESPONSE' });
      }
      results[rule.id] = probability;
      const threshold = E.normalizeThreshold(rule.threshold);
      if (probability >= threshold) matches.push({ ruleId: rule.id, name: rule.name, probability, threshold });
    }
    matches.sort((a, b) => b.probability - a.probability);
    return { results, matches, shouldHide: matches.length > 0 };
  }

  root.TubeGateDecision = { decide };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.TubeGateDecision;
})(globalThis);
