// Shared design tokens + the Expense Tracker's component styles.
import '../expense-tracker/src/styles/base.css';
import '../expense-tracker/src/styles/layout.css';
import '../expense-tracker/src/styles/components.css';
// Todo Manager styles (all `todo-` scoped; reads the same tokens).
import '../todo-manager/src/styles/todo.css';
// Ads Campaign Manager styles (all `ads-` scoped; reads the same tokens).
import '../ads-campaign-manager/src/styles/ads.css';
// Tab strip.
import './shell.css';

import { createShell } from './shell.js';

createShell(document.getElementById('app'));
