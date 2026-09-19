import { record } from '../types';
import type { Rule } from '../types';
export type QuestionRule = Pick<Rule, 'id' | 'instructions' | 'trueCriteria' | 'falseCriteria'> & {
  enabled?: boolean;
};
export type Questions = Record<
  string,
  { type: 'noul'; instructions: string; criteria: { true: string; false: string } }
>;
function buildQuestions(rules: QuestionRule[]) {
  return (rules || []).reduce<Questions>((questions, rule) => {
    questions[rule.id] = {
      type: 'noul',
      instructions: rule.instructions,
      criteria: {
        true: rule.trueCriteria || '内容符合该规则描述。',
        false: rule.falseCriteria || '内容不符合该规则描述。',
      },
    };
    return questions;
  }, {});
}

function getProbability(value: unknown) {
  const answer = record(value);
  if (!answer || typeof answer !== 'object') return null;
  const candidates = [
    answer.pTrue,
    answer.noul,
    record(answer.probabilities).true,
    record(answer.probabilities).yes,
  ];
  return (
    candidates.find(
      (value): value is number =>
        typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ) ?? null
  );
}

function readAnswers(value: unknown) {
  const payload = record(value);
  if (!payload || typeof payload !== 'object') return {};
  return payload.answers ? record(payload.answers) : payload;
}

function readScores(response: unknown, rules: QuestionRule[]) {
  const answers = readAnswers(response);
  return Object.fromEntries(
    (rules || [])
      .filter((rule) => rule.enabled !== false)
      .map((rule) => {
        const score = getProbability(answers[rule.id]);
        if (score === null)
          throw Object.assign(new Error('Invalid Jev response'), { code: 'API_INVALID_RESPONSE' });
        return [rule.id, score];
      })
  );
}

export { buildQuestions, readScores };
