(function (root) {
  'use strict';
  const E = root.SocialMediaGate;
  const C = root.TubeGateContent;
  const Y = root.TubeGateYouTubeUrls;
  const CARD = 'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-reel-item-renderer, yt-lockup-view-model, ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2';
  function extract(card, context) {
    const links = Array.from(card.querySelectorAll('a[href]'));
    const link = links.find((item) => item.matches('a#video-title, a#video-title-link, a.yt-lockup-metadata-view-model__title, a.shortsLockupViewModelHostEndpoint') && Y.videoIdFromUrl(item.href))
      || links.find((item) => Y.videoIdFromUrl(item.href));
    if (!link) return null;
    const videoId = Y.videoIdFromUrl(link.href);
    if (videoId === context?.videoId) return null;
    const titleNode = card.querySelector('#video-title, #video-title-link, .yt-lockup-metadata-view-model__title, .shortsLockupViewModelHostMetadataTitle, .shortsLockupViewModelHostMetadataTitleV2, h3');
    const title = E.normalizeText(titleNode?.getAttribute('title') || titleNode?.textContent || link.getAttribute('title'));
    if (!title) return null;
    const channelNode = card.querySelector('#channel-name a, #channel-name, #byline-container a, a[href^="/@"], a[href^="/channel/"], a[href^="/c/"]');
    const descriptionNode = card.querySelector('#description-text, .metadata-snippet-text, #description');
    return C.normalizeContent({ source: 'youtube', id: videoId, type: 'video', title,
      author: channelNode?.textContent || '', text: descriptionNode?.textContent || '' });
  }

  function isInScope(card, context) {
    if (!context || !card.isConnected) return false;
    if (card.closest('ytd-ad-slot-renderer, ytd-promoted-video-renderer, ytd-display-ad-renderer, [is-ad]')) return false;
    if (card.closest('[hidden], [aria-hidden="true"]')) return false;
    if (context.kind === 'watch') return Boolean(card.closest('#related'));
    if (context.kind === 'search') return Boolean(card.closest('ytd-search'));
    return Boolean(card.closest('ytd-browse[page-subtype="home"]'));
  }


  root.TubeGateAdapters.register({
    id: 'youtube', itemLabel: '视频',
    matches(url) {
      try { const parsed = new URL(url); return parsed.protocol === 'https:' && parsed.hostname === 'www.youtube.com'; }
      catch (_) { return false; }
    },
    getContext: Y.pageContext,
    collect(documentRoot, context) {
      return Array.from(documentRoot.querySelectorAll(CARD)).filter((card) => !card.parentElement?.closest(CARD) && isInScope(card, context));
    },
    extract, isInScope,
    navigation: { start: ['yt-navigate-start'], finish: ['yt-navigate-finish'] },
    observedAttributes: ['href', 'title', 'hidden', 'aria-hidden']
  });
})(globalThis);
