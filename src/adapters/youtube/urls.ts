import type { PageContext } from '../../types';
function videoIdFromUrl(value: string, base = 'https://www.youtube.com/') {
  try {
    const url = new URL(value, base);
    if (url.protocol !== 'https:' || url.hostname !== 'www.youtube.com') return null;
    const id =
      url.pathname === '/watch'
        ? url.searchParams.get('v')
        : url.pathname.match(/^\/shorts\/([^/]+)\/?$/)?.[1];
    return /^[\w-]{11}$/.test(id || '') ? id! : null;
  } catch (_) {
    return null;
  }
}

function pageContext(value: string): PageContext | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'www.youtube.com') return null;
    if (url.pathname === '/') return { kind: 'home', key: 'home', videoId: null };
    if (url.pathname === '/results')
      return {
        kind: 'search',
        key: `search:${url.searchParams.get('search_query') || ''}:${url.searchParams.get('sp') || ''}`,
        videoId: null,
      };
    const videoId = videoIdFromUrl(url.href);
    if (url.pathname === '/watch' && videoId)
      return { kind: 'watch', key: `watch:${videoId}`, videoId };
    return null;
  } catch (_) {
    return null;
  }
}

export { videoIdFromUrl, pageContext };
