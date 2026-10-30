import { forwardRef, useImperativeHandle, useRef, useState, type FormEvent } from 'react';
import { Icon } from '@shared/ui/Icon';
import { DEFAULT_CATEGORY, TASK_CATEGORIES, isCategoryId } from '../data/categories';
import { defaultEndDateForMonth, isDayBefore, isValidDayKey } from '../lib/dates';
import { DESCRIPTION_MAX, NAME_MAX } from '../store/store';
import type { TaskCategoryId, TaskInput } from '../types';

export interface TaskFormHandle {
  focus(): void;
}

interface TaskFormProps {
  today: string;
  month: string;
  lastCategory: TaskCategoryId;
  onSubmit: (payload: TaskInput) => boolean;
  onCancel: () => void;
}

/**
 * "Create task" page: name, description, end date and category.
 *
 * Validation happens inline (name required, end date required and not in the
 * past). On success the payload is handed to `onSubmit`; the parent decides
 * what happens next (persist, toast, navigate back to the dashboard).
 */
export const TaskForm = forwardRef<TaskFormHandle, TaskFormProps>(function TaskForm({ today, month, lastCategory, onSubmit, onCancel }, ref) {
  /** Today, or the 1st of the selected month when that month is in the future. */
  const defaultDate = () => (month ? defaultEndDateForMonth(month, today) : today);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  // Until the user picks a date themselves, the field follows today / the selected month.
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const endDate = pickedDate ?? defaultDate();
  const [category, setCategory] = useState<TaskCategoryId>(lastCategory);
  const [nameError, setNameError] = useState('');
  const [dateError, setDateError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({ focus: () => nameRef.current?.focus() }), []);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    let firstInvalid: HTMLElement | null = null;

    const cleanName = name.trim();
    if (!cleanName) {
      setNameError('Give the task a name');
      firstInvalid = nameRef.current;
    } else setNameError('');

    if (!endDate || !isValidDayKey(endDate)) {
      setDateError('Pick an end date');
      firstInvalid ??= dateRef.current;
    } else if (today && isDayBefore(endDate, today)) {
      setDateError('End date cannot be in the past');
      firstInvalid ??= dateRef.current;
    } else setDateError('');

    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    const ok = onSubmit({ name: cleanName, description, endDate, category });
    if (ok !== false) reset();
  }

  function reset() {
    setName('');
    setDescription('');
    setPickedDate(null);
    setCategory(isCategoryId(lastCategory) ? lastCategory : DEFAULT_CATEGORY);
    setNameError('');
    setDateError('');
  }

  return (
    <section className="todo-panel todo-form-panel" data-testid="todo-create">
      <div className="todo-panel__head">
        <div>
          <h2 className="todo-panel__title" id="task-form-heading">
            Create task
          </h2>
          <p className="todo-panel__hint">It will appear on your dashboard as soon as it is saved.</p>
        </div>
      </div>
      <form className="todo-form" noValidate onSubmit={handleSubmit} aria-labelledby="task-form-heading">
        <div className={`todo-field${nameError ? ' todo-field--invalid' : ''}`}>
          <label className="todo-field__label" htmlFor="task-name">
            Task name
          </label>
          <input
            ref={nameRef}
            type="text"
            id="task-name"
            className="todo-field__input"
            placeholder="e.g. Prepare quarterly report"
            maxLength={NAME_MAX}
            autoComplete="off"
            required
            aria-describedby="task-name-error"
            aria-invalid={nameError ? 'true' : 'false'}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (e.target.value.trim()) setNameError('');
            }}
          />
          <p className="todo-field__error" id="task-name-error" role="alert">
            {nameError}
          </p>
        </div>
        <div className="todo-field">
          <label className="todo-field__label" htmlFor="task-description">
            Description
          </label>
          <textarea id="task-description" className="todo-field__input todo-field__input--textarea" placeholder="Add any details, links or notes (optional)" maxLength={DESCRIPTION_MAX} rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
          <p className="todo-field__hint">Optional</p>
        </div>
        <div className={`todo-field${dateError ? ' todo-field--invalid' : ''}`}>
          <label className="todo-field__label" htmlFor="task-end-date">
            End date
          </label>
          <input
            ref={dateRef}
            type="date"
            id="task-end-date"
            className="todo-field__input"
            required
            min={today || undefined}
            aria-describedby="task-end-date-error"
            aria-invalid={dateError ? 'true' : 'false'}
            value={endDate}
            onChange={(e) => {
              setPickedDate(e.target.value);
              if (e.target.value) setDateError('');
            }}
          />
          <p className="todo-field__error" id="task-end-date-error" role="alert">
            {dateError}
          </p>
        </div>
        <fieldset className="todo-choice-group" id="task-category">
          <legend className="todo-field__label">Category</legend>
          <div className="todo-choice-row">
            {TASK_CATEGORIES.map((c) => (
              <label key={c.id} className="todo-choice" htmlFor={`task-category-${c.id}`} style={{ '--cat-color': c.color } as React.CSSProperties}>
                <input type="radio" name="task-category" id={`task-category-${c.id}`} value={c.id} className="todo-choice__input" checked={category === c.id} onChange={() => setCategory(c.id)} />
                <span className="todo-choice__swatch" aria-hidden="true">
                  <Icon name={c.icon} size={15} />
                </span>
                <span>{c.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="todo-form__actions">
          <button type="submit" className="todo-btn todo-btn--primary" data-testid="task-submit">
            <Icon name="plus" size={16} />
            <span>Create task</span>
          </button>
          <button type="button" className="todo-btn todo-btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
});
