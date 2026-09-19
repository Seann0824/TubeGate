import type { PageContext } from '../../types';

export const TWITTER_HOSTS = ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'] as const;

function siteUrl(value: string, base?: string): URL | null {
  try {
    const url = new URL(value, base);
    return url.protocol === 'https:' &&
      TWITTER_HOSTS.some((host) => host === url.hostname) &&
      !url.port &&
      !url.username &&
      !url.password
      ? url
      : null;
  } catch {
    return null;
  }
}

export function matches(value: string): boolean {
  return siteUrl(value) !== null;
}

/** Only canonical post links; media, analytics and engagement subroutes aren't timelines. */
export function postIdFromUrl(value: string, base = 'https://x.com/'): string | null {
  const url = siteUrl(value, base);
  return (
    url?.pathname.match(/^\/(?:[a-zA-Z0-9_]{1,15}|i\/web)\/status\/([1-9]\d{0,24})\/?$/)?.[1] ??
    null
  );
}

export function pageContext(value: string): PageContext | null {
  const url = siteUrl(value);
  if (!url) return null;
  if (/^\/home\/?$/.test(url.pathname)) return { kind: 'home', key: 'twitter:home' };
  if (/^\/search\/?$/.test(url.pathname)) {
    const query = url.searchParams.get('q') || '';
    if (!query.trim()) return null;
    const filter = url.searchParams.get('f') || 'top';
    if (!['top', 'live', 'image', 'video'].includes(filter)) return null;
    return {
      kind: 'search',
      key: JSON.stringify([
        'twitter:search',
        query,
        filter,
        url.searchParams.get('pf') || '',
        url.searchParams.get('lf') || '',
      ]),
    };
  }
  const id = postIdFromUrl(url.href);
  return id ? { kind: 'thread', key: `twitter:thread:${id}`, focusedContentId: id } : null;
}
