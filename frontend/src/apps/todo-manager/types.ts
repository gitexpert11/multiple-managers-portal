export type TaskCategoryId = 'office' | 'personal' | 'travel' | 'home';

export interface TaskCategory {
  id: TaskCategoryId;
  label: string;
  color: string;
  icon: 'briefcase' | 'user' | 'plane' | 'home';
}

export interface Task {
  id: string;
  name: string;
  description: string;
  /** "YYYY-MM-DD" */
  endDate: string;
  category: TaskCategoryId;
  completed: boolean;
  completedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface TaskInput {
  name: string;
  description?: string;
  endDate: string;
  category?: TaskCategoryId | string;
}

export type TaskStatusFilter = 'all' | 'open' | 'completed';

export interface TaskFilter {
  status: TaskStatusFilter;
  category: TaskCategoryId | null;
}

export type DueStatus = 'overdue' | 'today' | 'upcoming';

export interface TodoState {
  tasks: Task[];
}
