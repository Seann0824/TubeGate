(function (root) {
  'use strict';
  const E = root.SocialMediaGate || require('../shared/core.js');

  /** @typedef {{source:string, id:string, type:string, title:string, author:string, text:string}} ContentItem */

  function normalizeContent(input) {
    const invalid = () => { throw Object.assign(new Error('Invalid content item'), { code: 'INVALID_CONTENT' }); };
    if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid();
    for (const name of ['source', 'id', 'type']) {
      if (typeof input[name] !== 'string' || !input[name].trim()) return invalid();
    }
    if (!/^[a-z][a-z0-9_-]{0,39}$/.test(input.source) || !/^[a-z][a-z0-9_-]{0,39}$/.test(input.type) || input.id.length > 200) return invalid();
    for (const name of ['title', 'author', 'text']) {
      if (input[name] !== undefined && typeof input[name] !== 'string') return invalid();
    }
    const item = {
      source: input.source, id: input.id.trim(), type: input.type,
      title: E.normalizeText(input.title).slice(0, 1000),
      author: E.normalizeText(input.author).slice(0, 300),
      text: E.normalizeText(input.text).slice(0, 2000)
    };
    if (!item.title && !item.text) return invalid();
    // Explicit fields only: never carry DOM nodes, URLs, credentials or adapter extras.
    return item;
  }

  function serializeContent(input) {
    const { source, type, title, author, text } = normalizeContent(input);
    // JSON keeps field boundaries unambiguous; IDs remain local.
    return JSON.stringify({ source, type, title, author, text });
  }

  function identity(input) {
    const item = normalizeContent(input);
    return JSON.stringify([item.source, item.type, item.id]);
  }

  function revision(input) {
    return `${identity(input)}:${serializeContent(input)}`;
  }

  const exported = { normalizeContent, serializeContent, identity, revision };
  root.TubeGateContent = exported;
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
})(globalThis);
