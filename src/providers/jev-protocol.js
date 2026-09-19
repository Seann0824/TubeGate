(function (root) {
  'use strict';
  function buildQuestions(rules) {
    return (rules || []).reduce((questions, rule) => {
      questions[rule.id] = {
        type: 'noul',
        instructions: rule.instructions,
        criteria: {
          true: rule.trueCriteria || '内容符合该规则描述。',
          false: rule.falseCriteria || '内容不符合该规则描述。'
        }
      };
      return questions;
    }, {});
  }

  function getProbability(answer) {
    if (!answer || typeof answer !== 'object') return null;
    const candidates = [answer.pTrue, answer.noul, answer.probabilities && answer.probabilities.true, answer.probabilities && answer.probabilities.yes];
    return candidates.find((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1) ?? null;
  }

  function readAnswers(payload) {
    if (!payload || typeof payload !== 'object') return {};
    return payload.answers && typeof payload.answers === 'object' ? payload.answers : payload;
  }

  function readScores(response, rules) {
    const answers = readAnswers(response);
    return Object.fromEntries((rules || []).filter((rule) => rule.enabled !== false).map((rule) => {
      const score = getProbability(answers[rule.id]);
      if (score === null) throw Object.assign(new Error('Invalid Jev response'), { code: 'API_INVALID_RESPONSE' });
      return [rule.id, score];
    }));
  }

  const exported = { buildQuestions, readScores };
  root.TubeGateJevProtocol = exported;
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
})(globalThis);
