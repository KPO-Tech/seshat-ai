# Scheduling App

Scheduling is the platform for scheduled execution, recurring jobs, calendar-like
automation, and future plugins/triggers.

Target structure:

- `pages/` route-level screens.
- `components/` Scheduling-specific UI.
- `api/` Scheduling-specific API wrappers and DTOs.
- `hooks/` Scheduling-specific data hooks.
- `styles/` Scheduling-specific scoped CSS.

Current applied structure:

- `App.tsx` mounts the internal app router.
- `routes.tsx` owns Scheduling routes.
- `api/types.ts` contains Scheduling-specific DTOs/view types.
- `components/` contains the planner panel, run inspector, and job form modal.
- `lib/` contains job labels, draft helpers, run formatting, and plan parsing.
- `styles/scheduling.css` owns the Scheduling stylesheet.
- `pages/SchedulingPage.tsx` owns data loading, selected job state, and page-level orchestration.
