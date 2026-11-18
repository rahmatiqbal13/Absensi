-- UU PDP: an employee can withdraw their consent to location/photo
-- processing. The row is kept (proof of what was agreed, and when it ended)
-- and marked dicabut_at; hasActiveConsent() ignores withdrawn rows, so the
-- next clock-in asks for consent again.
alter table public.consents add column if not exists dicabut_at timestamptz;

create or replace function public.withdraw_my_consent(p_jenis text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update consents set dicabut_at = now()
  where employee_id = auth.uid() and jenis = p_jenis and dicabut_at is null;
  get diagnostics v_count = row_count;
  if v_count > 0 then
    insert into audit_logs (actor_id, target_employee_id, aksi, detail, is_self_action)
    values (auth.uid(), auth.uid(), 'consent_withdrawn', jsonb_build_object('jenis', p_jenis), true);
  end if;
  return v_count;
end;
$$;

revoke execute on function public.withdraw_my_consent(text) from public, anon;
grant execute on function public.withdraw_my_consent(text) to authenticated;
