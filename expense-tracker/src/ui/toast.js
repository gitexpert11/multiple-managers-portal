import { h, icon } from './dom.js';

const MAX_VISIBLE = 3;

/** Non-blocking notifications with an optional action (used for Undo). */
export function createToaster(container) {
  const region = h('div', { class: 'toast-region', role: 'status', 'aria-live': 'polite' });
  container.append(region);

  function show(message, { action, onAction, duration = 5000, tone = 'neutral' } = {}) {
    let timer;
    const dismiss = () => {
      clearTimeout(timer);
      toast.classList.add('toast--leaving');
      setTimeout(() => toast.remove(), 150);
    };
    const toast = h(
      'div',
      { class: `toast toast--${tone}` },
      h('span', { class: 'toast__message' }, message),
      action &&
        h(
          'button',
          {
            class: 'toast__action',
            type: 'button',
            onclick: () => {
              onAction?.();
              dismiss();
            },
          },
          icon('undo', 16),
          action,
        ),
      h('button', { class: 'toast__close', type: 'button', 'aria-label': 'Dismiss', onclick: dismiss }, icon('x', 14)),
    );
    // Keep the stack short so rapid entry doesn't flood the screen.
    while (region.children.length >= MAX_VISIBLE) region.firstElementChild.remove();
    region.append(toast);
    timer = setTimeout(dismiss, duration);
    return dismiss;
  }

  return { show };
}
