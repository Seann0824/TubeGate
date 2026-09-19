import type { PageContext } from '../../types';
import { registry } from '../../core/adapters';
import { normalizeContent } from '../../core/content';
import { normalizeText } from '../../shared/core';
import { matches, pageContext, postIdFromUrl } from './urls';

const CARD = 'article[data-testid="tweet"]';
const QUOTED = '[data-testid="quoteTweet"], [data-testid="card.wrapper"], div[role="link"]';

// An embedded quote must never supply its parent's identity or author.
function belongsToPost(node: Element, card: HTMLElement): boolean {
  return node.closest(CARD) === card && !node.closest(QUOTED) && !node.closest('[data-smg-ui]');
}

function ownNode(card: HTMLElement, selector: string): HTMLElement | undefined {
  return Array.from(card.querySelectorAll<HTMLElement>(selector)).find((node) =>
    belongsToPost(node, card)
  );
}

function postId(card: HTMLElement): string | null {
  const author = ownNode(card, '[data-testid="User-Name"]');
  if (!author) return null;
  for (const time of author.querySelectorAll('time')) {
    const link = time.closest<HTMLAnchorElement>('a[href]');
    if (!link || !belongsToPost(link, card)) continue;
    const id = postIdFromUrl(link.href);
    if (id) return id;
  }
  // No timestamp permalink: skip instead of guessing from quoted posts or action links.
  return null;
}

function isInScope(card: HTMLElement, context: PageContext | null): boolean {
  if (!context || !card.isConnected || !card.matches(CARD)) return false;
  if (!card.closest('[data-testid="primaryColumn"]')) return false;
  if (
    card.closest(
      '[hidden], [aria-hidden="true"], [role="dialog"], [data-testid="placementTracking"]'
    )
  )
    return false;
  if (card.querySelector('[data-testid="promotedIndicator"]')) return false;
  if (
    Array.from(card.ownerDocument.querySelectorAll<HTMLElement>('[role="dialog"]')).some(
      (dialog) =>
        dialog.getClientRects().length > 0 && !dialog.closest('[hidden], [aria-hidden="true"]')
    )
  )
    return false;
  const id = postId(card);
  return Boolean(id && id !== context.focusedContentId);
}

function extract(card: HTMLElement, context: PageContext | null) {
  if (!isInScope(card, context)) return null;
  const id = postId(card);
  const textNode = ownNode(card, '[data-testid="tweetText"]');
  if (!id || !textNode) return null;
  const copy = textNode.cloneNode(true) as HTMLElement;
  // X renders some emoji as images. Read their text alternatives, never image URLs.
  copy.querySelectorAll('img').forEach((image) => image.replaceWith(image.alt));
  copy.querySelectorAll('br').forEach((line) => line.replaceWith('\n'));
  const text = normalizeText(copy.textContent);
  if (!text) return null;
  return normalizeContent({
    source: 'twitter',
    type: 'post',
    id,
    title: '',
    author: ownNode(card, '[data-testid="User-Name"]')?.textContent || '',
    text,
  });
}

export const twitterAdapter = registry.register({
  id: 'twitter',
  itemLabel: '帖子',
  matches,
  getContext: pageContext,
  collect(documentRoot, context) {
    return Array.from(documentRoot.querySelectorAll<HTMLElement>(CARD)).filter(
      (card) => !card.parentElement?.closest(CARD) && isInScope(card, context)
    );
  },
  extract,
  isInScope,
  observedAttributes: ['href', 'hidden', 'aria-hidden', 'data-testid', 'aria-selected'],
});
