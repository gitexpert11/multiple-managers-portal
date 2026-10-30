# Todo Manager

A small, private, client-side task manager: Tab 2 of the [two-tab workspace](../README.md). Vanilla JavaScript (ES modules), HTML5 and CSS, with all tasks stored in the browser's `localStorage` under its own key, separate from the Expense Tracker.

## Pages

**Dashboard** (`#/todos`)

- **Month picker** (top bar) — month + year selects with previous / next / "Today" controls, like the Expense Tracker's. The dashboard (cards, list, empty state) shows the tasks *due* in the selected month. Unlike expenses, tasks live in the future, so there is no upper cap: future months are first-class. The year list always spans two years either side of today plus any year that has a task.
- If open tasks are overdue in *other* months, a notice above the list says so; **View** jumps to the most recent such month, so month scoping never hides overdue work.
- Summary cards — Open tasks, Due today, Overdue, Completed (for the selected month).
- **Tasks by category** doughnut (Chart.js) — one section per category with a task due that month. Hovering a section shows a tooltip with that category's details (tasks and share of the month, open / completed, overdue and due-today counts) and highlights its legend row; hovering a legend row highlights the section. Clicking a section or legend row filters the list to that category (the chart and the category chips are two views of the same selection); clicking again, or "All categories", clears it. The chart follows the status filter (Open / Completed) so it never disagrees with the list.
- Filters — status (All / Open / Completed) and category chips (All / Office / Personal / Travel / Home). Filters combine and survive month changes.
- Task list — open tasks first, soonest end date at the top; completed tasks at the bottom, struck through. Each row shows the name, description, a coloured category pill, the end date and a status badge ("Overdue by 3 days", "Due today", "Due tomorrow", "5 days left", "Completed").
- Tick the checkbox to complete or reopen a task; the trash button deletes with an **Undo** toast.
- "New task" (and the empty-state button) opens the create page.

**Create task** (`#/todos/new`)

- Fields: **Task name** (required, ≤120 chars), **Description** (optional, ≤500 chars), **End date** (required; cannot be in the past — defaults to today, or to the 1st of the selected month when a future month is selected), **Category** (Office, Personal, Travel, Home).
- Inline validation with focus on the first invalid field.
- On save the task is persisted, a toast confirms it, the dashboard filters are cleared and the month picker follows the task to its month so it is visible straight away, and the app returns to the dashboard. The form remembers the last category used.

**Export** — the top-bar "Export" button opens a dialog: pick a start and end month (month + year selects, or a quick preset: this month, last/this/next month, this year, all tasks), choose all / open only / completed only, and download as **Excel (.xlsx)** or **PDF**. Future months are allowed (tasks are due in the future). Excel files contain a monthly *Summary* sheet (tasks, open, overdue, completed, completion %) plus a sheet with every task: end date, name, description, category, status, completed-on and created-on dates — real date cells, frozen header, autofilter. PDFs contain the same two tables, paginated with page numbers. Status is computed as of the export day. Both are generated entirely in the browser with the same small OOXML / PDF writers the Expense Tracker uses.

**Sample data** — the "Load sample data" button in the top bar adds ~24 deterministic tasks covering **three months: last month, this month and next month**, two per category per month, with a realistic mix of completed, overdue, due-today and upcoming tasks. Click again to remove them; your own tasks are untouched. Sample records carry a `mock_` id prefix, so they stay removable even after you complete or reopen them.

## Getting started

Run from the repository root:

```bash
npm run dev            # both tabs
npm run dev:todo       # this app on its own
npm run test:todo      # this app's tests only
```

## Project structure

```
index.html                 Stand-alone entry (the two-tab shell has its own)
vite.config.js             Used only when served stand-alone
src/
  main.js                  Stand-alone bootstrap
  app.js                   Wires store <-> pages, owns page + filter state
  lib/
    dates.js               "YYYY-MM-DD" / "YYYY-MM" helpers, daysBetween, describeDue, defaultEndDateForMonth
    stats.js               summarizeTasks, sortTasks, filterTasks, tasksInMonth, overdueOutsideMonth, tasksByCategory
    ids.js                 Id generation
    export/
      exportData.js        Range/scope selection, monthly summary, workbook + PDF specs
      xlsx.js              Minimal .xlsx (OOXML) writer
      pdf.js               Minimal PDF writer with paginated tables
  data/categories.js       The four fixed categories (id, label, colour, icon)
  data/mockData.js         Seeded generator for the 3-month sample-data toggle
  store/
    storage.js             Versioned localStorage wrapper, key "todo-manager-ng"
    store.js               Task store: add, update, toggle, delete, restore, addTasks, removeTasksWhere, clearAll
  ui/
    dom.js  toast.js       Element builder, icons, notifications
    monthPicker.js         Month + year picker (no future cap)
    categoryChart.js       Doughnut of tasks by category with hover tooltips + legend
    dashboard.js           Summary cards + chart slot + filters + overdue-elsewhere notice + task list
    exportDialog.js        Export dialog (range, scope, format, preview)
    taskForm.js            Create-task page
  styles/
    todo.css               All component styles (every class is `todo-` prefixed)
    base.css               Design tokens + reset, used only stand-alone (the shell loads the shared copy)
tests/                     Vitest suites (pure logic + jsdom integration)
```

### Hosting

`createTodoApp(rootEl, { store, now, onNavigate })` mounts the whole app into `rootEl` and returns `{ showPage, render, store }`. A host calls `showPage('dashboard' | 'new')` when the URL changes, and receives `onNavigate(page)` when the user moves between pages inside the app, so it can mirror that into the URL. Without a host the app simply switches pages itself.

## Data model

Everything lives under the `todo-manager-ng` key in `localStorage`:

```jsonc
{
  "version": 1,
  "savedAt": 1710000000000,
  "data": {
    "tasks": [
      {
        "id": "task_…",
        "name": "Prepare quarterly report",
        "description": "Collect numbers from finance",
        "endDate": "2025-03-20",        // local calendar date, never shifts across timezones
        "category": "office",           // office | personal | travel | home
        "completed": false,
        "completedAt": null,            // epoch ms when completed
        "createdAt": 0, "updatedAt": 0
      }
    ]
  }
}
```

Corrupt or partial records are repaired (missing id/category/timestamps) or dropped (invalid date, no name) on load. The `version` field allows future schema migrations in `storage.js`.
