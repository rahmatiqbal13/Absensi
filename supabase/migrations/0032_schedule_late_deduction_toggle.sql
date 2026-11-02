-- supabase/migrations/0032_schedule_late_deduction_toggle.sql
--
-- Per-minute late / early-leave deductions are a fine (denda): PP 36/2021 only
-- allows one with a written basis in the PK/PP/PKB. Make it an explicit,
-- per-branch opt-in that defaults OFF. Absent days (alpa) stay unpaid either
-- way — that is no-work-no-pay, not a fine.

alter table work_schedules
  add column if not exists potong_terlambat boolean not null default false;
