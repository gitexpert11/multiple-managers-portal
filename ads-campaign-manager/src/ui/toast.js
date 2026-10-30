import { h, icon } from './dom.js';

const MAX_VISIBLE = 3;

/** Non-blocking notifications with an optional action (used for Undo). */
export function createToaster(container) {
  const region = h('div', { class: 'ads-toast-region', role: 'status', 'aria-live': 'polite' });
  container.append(region);

  function show(message, { action, onAction, actionIcon = 'undo', duration = 5000, tone = 'neutral' } = {}) {
    let timer;
    const dismiss = () => {
      clearTimeout(timer);
      toast.classList.add('ads-toast--leaving');
      setTimeout(() => toast.remove(), 150);
    };
    const toast = h(
      'div',
      { class: `ads-toast ads-toast--${tone}` },
      h('span', { class: 'ads-toast__message' }, message),
      action &&
        h(
          'button',
          {
            class: 'ads-toast__action',
            type: 'button',
            onclick: () => {
              onAction?.();
              dismiss();
            },
          },
          icon(actionIcon, 16),
          action,
        ),
      h('button', { class: 'ads-toast__close', type: 'button', 'aria-label': 'Dismiss', onclick: dismiss }, icon('x', 14)),
    );
    while (region.children.length >= MAX_VISIBLE) region.firstElementChild.remove();
    region.append(toast);
    timer = setTimeout(dismiss, duration);
    return dismiss;
  }

  return { show };
}
