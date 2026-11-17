-- supabase/migrations/0043_url_slugs.sql
--
-- Readable URLs: /karyawan/rahmat-iqbal instead of /karyawan/<uuid>,
-- /payroll/kantor-pusat/2026-11 instead of /payroll/<uuid>.
--
-- employees.slug and branches.slug are derived from `nama`, unique (a
-- duplicate name gets "-2", "-3", ...), filled by a BEFORE trigger on insert
-- and re-derived when `nama` changes. Old UUID links keep working: the pages
-- redirect a UUID segment to the slug URL.

create or replace function slugify(p_text text)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(
      -- Trim leading dashes, cap at 60 chars, then trim trailing dashes.
      trim(both '-' from left(ltrim(regexp_replace(
        lower(translate(p_text,
          'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÑñÇç',
          'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuNnCc')),
        '[^a-z0-9]+', '-', 'g'), '-'), 60)),
      ''),
    'item');
$$;

-- First free "<base>", "<base>-2", ... in `p_table`, ignoring the row itself.
-- security definer: must see every row, not just what the caller's RLS shows,
-- or a hidden duplicate would surface as a unique-violation error.
create or replace function unique_slug(p_table regclass, p_base text, p_self uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate text := p_base;
  v_n int := 1;
  v_taken boolean;
begin
  loop
    execute format('select exists (select 1 from %s where slug = $1 and id is distinct from $2)', p_table)
      into v_taken using v_candidate, p_self;
    -- /karyawan/baru is the "add employee" page; never hand that slug out.
    v_taken := v_taken or (p_table = 'employees'::regclass and v_candidate = 'baru');
    exit when not v_taken;
    v_n := v_n + 1;
    v_candidate := p_base || '-' || v_n;
  end loop;
  return v_candidate;
end;
$$;

-- security definer so it can call unique_slug, which the API roles can't.
create or replace function set_slug_from_nama()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.nama is distinct from old.nama or new.slug is null then
    new.slug := unique_slug(tg_relid::regclass, slugify(new.nama), new.id);
  end if;
  return new;
end;
$$;

alter table employees add column slug text;
alter table branches add column slug text;

-- Backfill oldest first, so the earliest row keeps the plain name.
do $$
declare r record;
begin
  for r in select id, nama from branches order by created_at, id loop
    update branches set slug = unique_slug('branches', slugify(r.nama), r.id) where id = r.id;
  end loop;
  for r in select id, nama from employees order by created_at, id loop
    update employees set slug = unique_slug('employees', slugify(r.nama), r.id) where id = r.id;
  end loop;
end $$;

alter table employees alter column slug set not null;
alter table branches alter column slug set not null;
alter table employees add constraint employees_slug_key unique (slug);
alter table branches add constraint branches_slug_key unique (slug);

create trigger employees_set_slug before insert or update of nama, slug on employees
  for each row execute function set_slug_from_nama();
create trigger branches_set_slug before insert or update of nama, slug on branches
  for each row execute function set_slug_from_nama();

-- Internal helper: not callable through the API.
revoke execute on function unique_slug(regclass, text, uuid) from public, anon, authenticated;
