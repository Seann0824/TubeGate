import { record } from '../types';
import type { ClassificationRequest, Classifier } from '../types';
import * as E from '../shared/core';
import * as C from '../core/content';
import * as P from './jev-protocol';

class JevClassifier implements Classifier {
  readonly id: string;
  private fetch: typeof fetch;
  private timeoutMs: number;
  constructor({
    fetchImpl = (...args) => globalThis.fetch(...args),
    timeoutMs = 12000,
  }: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}) {
    this.id = 'jev';
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async request({
    apiKey,
    model,
    state,
    questions,
  }: {
    apiKey: string;
    model: string;
    state: { content: string };
    questions: P.Questions;
  }): Promise<unknown> {
    if (!apiKey) throw Object.assign(new Error('Missing API key'), { code: 'API_KEY_MISSING' });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      // One call per classification. Retries must not silently bypass quota accounting.
      const response = await this.fetch(E.API_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, state, questions }),
        signal: controller.signal,
      });
      if (!response.ok)
        throw Object.assign(new Error('Jev request failed'), { status: response.status });
      try {
        return JSON.parse(await response.text());
      } catch (error) {
        if (record(error).name === 'AbortError') throw error;
        throw Object.assign(new Error('Invalid Jev response'), { code: 'API_INVALID_RESPONSE' });
      }
    } finally {
      clearTimeout(timer);
    }
  }

  async classify({ apiKey, model, content, rules }: ClassificationRequest) {
    const started = performance.now();
    const response = await this.request({
      apiKey,
      model,
      state: { content: C.serializeContent(content) },
      questions: P.buildQuestions(rules),
    });
    return {
      scores: P.readScores(response, rules),
      latencyMs: Math.round(performance.now() - started),
    };
  }

  async testConnection({ apiKey, model }: { apiKey: string; model: string }) {
    const started = performance.now();
    const rule = {
      id: 'connection_ok',
      enabled: true,
      instructions: 'Is this a connection test?',
      trueCriteria: 'This is a connection test.',
      falseCriteria: 'This is not a connection test.',
    };
    const response = await this.request({
      apiKey,
      model,
      state: { content: 'connection test' },
      questions: P.buildQuestions([rule]),
    });
    P.readScores(response, [rule]);
    return Math.round(performance.now() - started);
  }
}

export default JevClassifier;
