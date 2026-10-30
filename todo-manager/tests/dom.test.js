import { describe, expect, it, vi } from 'vitest';
import { append, clear, h, icon, replaceChildren } from '../src/ui/dom.js';

describe('h()', () => {
  it('positive: sets class, plain attributes, boolean attributes, dataset and listeners', () => {
    const onclick = vi.fn();
    const el = h('button', { class: 'btn', type: 'button', 'aria-label': 'Go', hidden: true, dataset: { id: '42' }, onclick }, 'Go');
    expect(el.className).toBe('btn');
    expect(el.getAttribute('type')).toBe('button');
    expect(el.getAttribute('aria-label')).toBe('Go');
    expect(el.hidden).toBe(true);
    expect(el.dataset.id).toBe('42');
    el.click();
    expect(onclick).toHaveBeenCalledTimes(1);
    expect(el.textContent).toBe('Go');
  });

  it('positive: sets element properties for non-string values (checked, value) and styles incl. custom properties', () => {
    const input = h('input', { type: 'checkbox', checked: true });
    expect(input.checked).toBe(true);
    const box = h('div', { style: { color: 'red', '--cat-color': '#123456' } });
    expect(box.style.color).toBe('red');
    expect(box.style.getPropertyValue('--cat-color')).toBe('#123456');
  });

  it('negative: skips null / undefined / false attributes and children', () => {
    const el = h('div', { title: null, hidden: false, 'data-x': undefined }, null, false, undefined, 'ok');
    expect(el.hasAttribute('title')).toBe(false);
    expect(el.hidden).toBe(false);
    expect(el.hasAttribute('data-x')).toBe(false);
    expect(el.textContent).toBe('ok');
  });

  it('edge: flattens nested child arrays and inserts text, not HTML (no injection)', () => {
    const el = h('p', {}, ['a', ['b', [h('b', {}, 'c')]]], '<script>alert(1)</script>');
    expect(el.childNodes).toHaveLength(4);
    expect(el.querySelector('script')).toBeNull();
    expect(el.textContent).toBe('abc<script>alert(1)</script>');
  });

  it('edge: works with no attributes argument at all', () => {
    expect(h('span').tagName).toBe('SPAN');
    expect(h('span', null, 'x').textContent).toBe('x');
  });
});

describe('append / clear / replaceChildren', () => {
  it('positive: append returns the parent and accepts numbers; clear empties; replaceChildren swaps', () => {
    const el = h('ul');
    expect(append(el, [h('li', {}, 'a'), 42])).toBe(el);
    expect(el.childNodes).toHaveLength(2);
    expect(el.lastChild.textContent).toBe('42');
    replaceChildren(el, h('li', {}, 'z'));
    expect(el.childNodes).toHaveLength(1);
    expect(el.textContent).toBe('z');
    expect(clear(el)).toBe(el);
    expect(el.childNodes).toHaveLength(0);
  });
});

describe('icon()', () => {
  it('positive: renders an aria-hidden inline SVG of the requested size', () => {
    const el = icon('check', 20);
    expect(el.classList.contains('icon')).toBe(true);
    expect(el.getAttribute('aria-hidden')).toBe('true');
    const svg = el.querySelector('svg');
    expect(svg.getAttribute('width')).toBe('20');
    expect(svg.querySelector('path')).not.toBeNull();
  });

  it('negative: an unknown icon name still yields an (empty) svg rather than throwing', () => {
    const el = icon('does-not-exist');
    expect(el.querySelector('svg')).not.toBeNull();
    expect(el.querySelector('svg').children).toHaveLength(0);
  });
});
