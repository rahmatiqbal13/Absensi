-- The leave_requests_date_order_check constraint (migration 0014) was added
-- NOT VALID because one pre-existing row (a test artifact from the fix
-- verification for I4, created 2026-08-27, since deleted by the human after
-- confirming it was disposable test data, not real business data) violated
-- it. The constraint has been enforcing on every INSERT/UPDATE since 0014;
-- this migration validates it against all existing rows now that the
-- offending row is gone, closing the last gap (a full table scan confirming
-- no other violations exist).
alter table leave_requests validate constraint leave_requests_date_order_check;
