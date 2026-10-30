import { TASK_CATEGORIES, DEFAULT_CATEGORY } from '../data/categories.js';
import { defaultEndDateForMonth, isDayBefore, isValidDayKey } from '../lib/dates.js';
import { DESCRIPTION_MAX, NAME_MAX } from '../store/store.js';
import { h, icon } from './dom.js';

/**
 * "Create task" page: name, description, end date and category.
 *
 * Validation happens inline (name required, end date required and not in the
 * past). On success the payload is handed to `onSubmit`; the parent decides
 * what happens next (persist, toast, navigate back to the dashboard).
 */
export function createTaskForm(container, { onSubmit, onCancel }) {
  let props = { today: '', month: '', lastCategory: DEFAULT_CATEGORY };
  let dateTouched = false;

  /** Today, or the 1st of the selected month when that month is in the future. */
  const defaultDate = () => (props.month ? defaultEndDateForMonth(props.month, props.today) : props.today);

  // --- fields ---------------------------------------------------------------
  const nameInput = h('input', {
    type: 'text',
    id: 'task-name',
    class: 'todo-field__input',
    placeholder: 'e.g. Prepare quarterly report',
    maxlength: NAME_MAX,
    autocomplete: 'off',
    required: true,
    'aria-describedby': 'task-name-error',
    oninput: () => nameInput.value.trim() && showNameError(''),
  });
  const nameError = h('p', { class: 'todo-field__error', id: 'task-name-error', role: 'alert' });

  const descriptionInput = h('textarea', {
    id: 'task-description',
    class: 'todo-field__input todo-field__input--textarea',
    placeholder: 'Add any details, links or notes (optional)',
    maxlength: DESCRIPTION_MAX,
    rows: 4,
  });

  const dateInput = h('input', {
    type: 'date',
    id: 'task-end-date',
    class: 'todo-field__input',
    required: true,
    'aria-describedby': 'task-end-date-error',
    onchange: () => {
      dateTouched = true;
      if (dateInput.value) showDateError('');
    },
  });
  const dateError = h('p', { class: 'todo-field__error', id: 'task-end-date-error', role: 'alert' });

  const categoryInputs = TASK_CATEGORIES.map((c) =>
    h('input', {
      type: 'radio',
      name: 'task-category',
      id: `task-category-${c.id}`,
      value: c.id,
      class: 'todo-choice__input',
      checked: c.id === DEFAULT_CATEGORY,
    }),
  );
  const categoryGroup = h(
    'fieldset',
    { class: 'todo-choice-group', id: 'task-category' },
    h('legend', { class: 'todo-field__label' }, 'Category'),
    h(
      'div',
      { class: 'todo-choice-row' },
      ...TASK_CATEGORIES.map((c, i) =>
        h(
          'label',
          { class: 'todo-choice', for: `task-category-${c.id}`, style: { '--cat-color': c.color } },
          categoryInputs[i],
          h('span', { class: 'todo-choice__swatch', 'aria-hidden': 'true' }, icon(c.icon, 15)),
          h('span', {}, c.label),
        ),
      ),
    ),
  );

  const submitBtn = h('button', { type: 'submit', class: 'todo-btn todo-btn--primary', 'data-testid': 'task-submit' }, icon('plus', 16), h('span', {}, 'Create task'));
  const cancelBtn = h('button', { type: 'button', class: 'todo-btn todo-btn--ghost', onclick: () => onCancel?.() }, 'Cancel');

  const form = h(
    'form',
    { class: 'todo-form', novalidate: true, onsubmit: handleSubmit, 'aria-labelledby': 'task-form-heading' },
    field('Task name', 'task-name', nameInput, nameError),
    field('Description', 'task-description', descriptionInput, h('p', { class: 'todo-field__hint' }, 'Optional')),
    field('End date', 'task-end-date', dateInput, dateError),
    categoryGroup,
    h('div', { class: 'todo-form__actions' }, submitBtn, cancelBtn),
  );

  const root = h(
    'section',
    { class: 'todo-panel todo-form-panel', 'data-testid': 'todo-create' },
    h(
      'div',
      { class: 'todo-panel__head' },
      h('div', {}, h('h2', { class: 'todo-panel__title', id: 'task-form-heading' }, 'Create task'), h('p', { class: 'todo-panel__hint' }, 'It will appear on your dashboard as soon as it is saved.')),
    ),
    form,
  );
  container.append(root);

  // --- behaviour ------------------------------------------------------------

  function field(labelText, forId, ...controls) {
    return h('div', { class: 'todo-field' }, h('label', { class: 'todo-field__label', for: forId }, labelText), ...controls);
  }

  function setFieldError(input, errorEl, msg) {
    errorEl.textContent = msg;
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    input.closest('.todo-field').classList.toggle('todo-field--invalid', Boolean(msg));
  }
  const showNameError = (msg) => setFieldError(nameInput, nameError, msg);
  const showDateError = (msg) => setFieldError(dateInput, dateError, msg);

  function selectedCategory() {
    return categoryInputs.find((i) => i.checked)?.value || DEFAULT_CATEGORY;
  }

  function selectCategory(id) {
    const target = categoryInputs.some((i) => i.value === id) ? id : DEFAULT_CATEGORY;
    categoryInputs.forEach((i) => (i.checked = i.value === target));
  }

  function handleSubmit(e) {
    e.preventDefault();
    let firstInvalid = null;

    const name = nameInput.value.trim();
    if (!name) {
      showNameError('Give the task a name');
      firstInvalid = nameInput;
    } else showNameError('');

    const endDate = dateInput.value;
    if (!endDate || !isValidDayKey(endDate)) {
      showDateError('Pick an end date');
      firstInvalid ??= dateInput;
    } else if (props.today && isDayBefore(endDate, props.today)) {
      showDateError('End date cannot be in the past');
      firstInvalid ??= dateInput;
    } else showDateError('');

    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    const ok = onSubmit({ name, description: descriptionInput.value, endDate, category: selectedCategory() });
    if (ok !== false) reset();
  }

  function reset() {
    nameInput.value = '';
    descriptionInput.value = '';
    dateTouched = false;
    dateInput.value = defaultDate();
    selectCategory(props.lastCategory);
    showNameError('');
    showDateError('');
  }

  return {
    root,
    reset,
    focus: () => nameInput.focus(),
    /** @param {{today: string, month?: string, lastCategory?: string}} next */
    update(next) {
      const prevToday = props.today;
      const prevMonth = props.month;
      props = { ...props, ...next };
      if (props.today) dateInput.min = props.today;
      // Follow today / the selected month as the default until the user picks a date themselves.
      if (!dateInput.value || (!dateTouched && (props.today !== prevToday || props.month !== prevMonth))) dateInput.value = defaultDate();
      if (props.today && dateInput.value && isDayBefore(dateInput.value, props.today) && !dateTouched) dateInput.value = defaultDate();
    },
  };
}
