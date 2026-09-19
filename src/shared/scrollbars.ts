/** Custom vertical rails for extension-owned pages. Browser scrolling stays intact. */
export function mountScrollbars(): void {
  const page = document.documentElement;
  const targets = [
    page,
    ...document.querySelectorAll<HTMLElement>('.ew-modal, .ew-code, .ew-textarea'),
  ];
  let frame = 0;
  const updates: (() => void)[] = [];
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      updates.forEach((update) => update());
    });
  };
  const resize = new ResizeObserver(schedule);
  resize.observe(document.body);

  targets.forEach((target, index) => {
    const isPage = target === page;
    if (!target.id) target.id = `tubegate-scroll-${index}`;
    target.classList.add('tg-scroll-surface');
    const rail = document.createElement('div');
    rail.className = 'tg-scrollbar';
    rail.hidden = true;
    const thumb = document.createElement('div');
    thumb.className = 'tg-scrollbar-thumb';
    thumb.tabIndex = 0;
    thumb.setAttribute('role', 'scrollbar');
    thumb.setAttribute('aria-controls', target.id);
    thumb.setAttribute('aria-orientation', 'vertical');
    thumb.setAttribute('aria-valuemin', '0');
    thumb.setAttribute('aria-valuemax', '100');
    const label =
      target instanceof HTMLTextAreaElement ? target.labels?.[0]?.textContent?.trim() : '';
    thumb.setAttribute(
      'aria-label',
      isPage
        ? '页面滚动'
        : `${label || (target.classList.contains('ew-modal') ? '规则编辑器' : '内容')}滚动`
    );
    rail.append(thumb);
    document.body.append(rail);
    let range = 0,
      travel = 0,
      top = 0,
      thumbHeight = 0;
    let pointer: number | null = null;
    let grabOffset = 0;

    const update = () => {
      const rect = target.getBoundingClientRect();
      const modal = document.querySelector('.ew-modal-backdrop:not(.ew-hidden)');
      range = Math.max(0, target.scrollHeight - target.clientHeight);
      let bottom = isPage ? innerHeight - 6 : Math.min(innerHeight - 6, rect.bottom - 8);
      top = isPage ? 6 : Math.max(6, rect.top + 8);
      // A textarea can itself be clipped by the scrolling rule editor.
      let parent = target.parentElement?.closest<HTMLElement>('.tg-scroll-surface');
      while (parent && parent !== page) {
        const bounds = parent.getBoundingClientRect();
        top = Math.max(top, bounds.top + 8);
        bottom = Math.min(bottom, bounds.bottom - 8);
        parent = parent.parentElement?.closest<HTMLElement>('.tg-scroll-surface');
      }
      const height = Math.max(0, bottom - top);
      rail.hidden =
        !range ||
        height < 36 ||
        !target.getClientRects().length ||
        (!isPage && rect.width === 0) ||
        Boolean(modal && !modal.contains(target));
      if (rail.hidden) return;
      thumbHeight = Math.min(
        height,
        Math.max(32, (height * target.clientHeight) / target.scrollHeight)
      );
      travel = height - thumbHeight;
      rail.style.top = `${top}px`;
      rail.style.height = `${height}px`;
      rail.style.left = `${isPage ? innerWidth - 15 : Math.min(innerWidth - 15, rect.right - 16)}px`;
      thumb.style.height = `${thumbHeight}px`;
      thumb.style.transform = `translateY(${travel * Math.min(1, Math.max(0, target.scrollTop / range))}px)`;
      thumb.setAttribute('aria-valuenow', String(Math.round((100 * target.scrollTop) / range)));
    };
    const move = (clientY: number) => {
      if (!travel) return;
      target.scrollTo({
        top: Math.max(0, Math.min(1, (clientY - top - grabOffset) / travel)) * range,
        behavior: 'instant',
      });
      schedule();
    };
    rail.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      update();
      grabOffset =
        event.target === thumb
          ? event.clientY - thumb.getBoundingClientRect().top
          : thumbHeight / 2;
      pointer = event.pointerId;
      rail.dataset.dragging = 'true';
      rail.setPointerCapture(pointer);
      thumb.focus({ preventScroll: true });
      move(event.clientY);
    });
    rail.addEventListener('pointermove', (event) => {
      if (pointer === event.pointerId) move(event.clientY);
    });
    const release = () => {
      pointer = null;
      delete rail.dataset.dragging;
    };
    rail.addEventListener('pointerup', release);
    rail.addEventListener('pointercancel', release);
    rail.addEventListener('lostpointercapture', release);
    rail.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? target.clientHeight : 1;
        target.scrollTo({ top: target.scrollTop + event.deltaY * unit, behavior: 'instant' });
      },
      { passive: false }
    );
    thumb.addEventListener('keydown', (event) => {
      const positions: Record<string, number> = {
        ArrowDown: target.scrollTop + 48,
        ArrowUp: target.scrollTop - 48,
        PageDown: target.scrollTop + target.clientHeight * 0.85,
        PageUp: target.scrollTop - target.clientHeight * 0.85,
        Home: 0,
        End: range,
      };
      const position = positions[event.key];
      if (position === undefined) return;
      event.preventDefault();
      target.scrollTo({ top: position, behavior: 'instant' });
    });
    updates.push(update);
    resize.observe(target);
  });
  // Cover async rule rendering, modal visibility, textarea editing and resizing.
  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'open'],
  });
  document.addEventListener('scroll', schedule, { capture: true, passive: true });
  document.addEventListener('input', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  schedule();
}
