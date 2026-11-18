-- Data diri filled in by the employee (Profil) and an automatic nomor pegawai.
--
-- nomor_pegawai follows the NIP pattern without the gender digit (17 digits):
--   YYYYMMDD (lahir) + YYYYMM (mulai kerja) + NNN (urut within that prefix)
--   e.g. 19950412 202307 001
-- It is built by the database the first time both dates are known (normally
-- when the employee saves their tanggal lahir), and is then locked. No client
-- can choose a number; only HR may clear it so it is rebuilt from corrected
-- dates on the next save.

alter table public.employees
  add column if not exists nomor_pegawai text unique,
  add column if not exists tempat_lahir text,
  add column if not exists tanggal_lahir date,
  add column if not exists jenis_kelamin text check (jenis_kelamin in ('L', 'P')),
  add column if not exists agama text
    check (agama in ('Islam', 'Kristen', 'Katolik', 'Hindu', 'Buddha', 'Konghucu', 'Lainnya')),
  add column if not exists alamat_ktp text,
  add column if not exists alamat_domisili text,
  add column if not exists pendidikan_terakhir text
    check (pendidikan_terakhir in ('SD', 'SMP', 'SMA/SMK', 'D1', 'D2', 'D3', 'D4', 'S1', 'S2', 'S3'));

alter table public.employees drop constraint if exists employees_tanggal_lahir_sane;
alter table public.employees
  -- Lower bound only: "not in the future" is checked by the app (a CHECK must
  -- not depend on today's date).
  add constraint employees_tanggal_lahir_sane check (tanggal_lahir is null or tanggal_lahir >= '1930-01-01');

grant update (nomor_pegawai, tempat_lahir, tanggal_lahir, jenis_kelamin, agama, alamat_ktp, alamat_domisili, pendidikan_terakhir)
  on public.employees to authenticated;

create or replace function public.assign_nomor_pegawai()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_seq integer;
begin
  if tg_op = 'UPDATE' and old.nomor_pegawai is not null then
    -- Locked. HR clearing it (to rebuild after a date correction) falls through.
    if not (new.nomor_pegawai is null and is_hr_admin_role()) then
      new.nomor_pegawai := old.nomor_pegawai;
      return new;
    end if;
  else
    -- Never a client-chosen value.
    new.nomor_pegawai := null;
  end if;

  if new.tanggal_lahir is null or new.tanggal_mulai_kerja is null then
    return new;
  end if;

  v_prefix := to_char(new.tanggal_lahir, 'YYYYMMDD') || to_char(new.tanggal_mulai_kerja, 'YYYYMM');
  -- Serialise numbering per prefix so two saves can't take the same number.
  perform pg_advisory_xact_lock(hashtext('nomor_pegawai:' || v_prefix));
  select coalesce(max(right(nomor_pegawai, 3)::integer), 0) + 1
    into v_seq
    from employees
    where nomor_pegawai like v_prefix || '___' and id <> new.id;
  new.nomor_pegawai := v_prefix || lpad(v_seq::text, 3, '0');
  return new;
end;
$$;

revoke execute on function public.assign_nomor_pegawai() from public, anon;

drop trigger if exists trg_assign_nomor_pegawai on public.employees;
create trigger trg_assign_nomor_pegawai
  before insert or update on public.employees
  for each row execute function public.assign_nomor_pegawai();

-- Self-service allow-list (was: no_telp, foto_profil_url). Body otherwise as
-- live. nomor_pegawai is excluded because the trigger above (which runs first,
-- triggers fire in name order) may have just assigned it; it guards the
-- column itself.
create or replace function public.prevent_employee_self_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if is_hr_admin_role() = false and auth.uid() = old.id then
    if (to_jsonb(new) - 'no_telp' - 'foto_profil_url' - 'nomor_pegawai' - 'tempat_lahir' - 'tanggal_lahir'
          - 'jenis_kelamin' - 'agama' - 'alamat_ktp' - 'alamat_domisili' - 'pendidikan_terakhir')
       is distinct from
       (to_jsonb(old) - 'no_telp' - 'foto_profil_url' - 'nomor_pegawai' - 'tempat_lahir' - 'tanggal_lahir'
          - 'jenis_kelamin' - 'agama' - 'alamat_ktp' - 'alamat_domisili' - 'pendidikan_terakhir')
    then
      raise exception 'not allowed to change protected fields on own employee record';
    end if;
  end if;
  return new;
end;
$$;
