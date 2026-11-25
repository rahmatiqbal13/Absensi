-- supabase/migrations/0067_schedule_templates.sql
--
-- Satu menu jadwal kerja: jadwal bernama yang dipakai di mana saja.
--
-- HR now defines each schedule once ("Kantor 08–16 Sen–Jum") and picks where it
-- applies: whole branches, departments, and/or individual employees. One
-- schedule may serve several branches at once.
--
-- work_schedules stays exactly what every reader uses (resolve.ts: roster >
-- employee jadwal khusus > department > branch default). Each of its rows now
-- belongs to a template; the rows are only the template applied to one target:
--   branch default   (department_id null, nama null)  — "jadwal utama cabang"
--   department row   (department_id set)
--   named row        (nama = template nama, one per branch, employees point at it)
-- Editing a template rewrites its rows (trigger below), so the hours can never
-- drift between the branches that share it.

create table if not exists public.schedule_templates (
  id uuid primary key default gen_random_uuid(),
  nama text not null check (btrim(nama) <> '' and length(nama) <= 60),
  jam_masuk time not null,
  jam_pulang time not null,
  hari_kerja integer[] not null,
  toleransi_terlambat_menit integer not null default 0 check (toleransi_terlambat_menit >= 0),
  potong_terlambat boolean not null default false,
  hitung_lembur boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists schedule_templates_nama_key on public.schedule_templates (lower(nama));

alter table public.schedule_templates enable row level security;
drop policy if exists schedule_templates_hr on public.schedule_templates;
create policy schedule_templates_hr on public.schedule_templates
  for all using (is_hr_admin_role()) with check (is_hr_admin_role());

alter table public.work_schedules
  add column if not exists template_id uuid references public.schedule_templates(id) on delete cascade;
create index if not exists work_schedules_template_id_idx on public.work_schedules (template_id);

-- ---------------------------------------------------------------------------
-- Existing schedules become templates, one each, named after what they cover:
--   branch default  → "Jadwal <cabang>"
--   department      → "Jadwal <departemen> (<cabang>)"
--   jadwal khusus   → its own name (+ " (<cabang>)" when two branches used it)
-- HR can then merge them by assigning targets to one template and deleting
-- the ones left unused.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_base text;
  v_name text;
  v_id uuid;
  n int;
begin
  for r in
    select ws.id, ws.nama, ws.jam_masuk, ws.jam_pulang, ws.hari_kerja, ws.toleransi_terlambat_menit,
           ws.potong_terlambat, ws.hitung_lembur, b.nama as branch_nama, d.nama as dept_nama
    from public.work_schedules ws
    join public.branches b on b.id = ws.branch_id
    left join public.departments d on d.id = ws.department_id
    where ws.template_id is null
    order by (ws.nama is not null), (ws.department_id is not null), b.nama, d.nama, ws.nama
  loop
    v_base := left(case
      when r.nama is not null then r.nama
      when r.dept_nama is not null then 'Jadwal ' || r.dept_nama || ' (' || r.branch_nama || ')'
      else 'Jadwal ' || r.branch_nama
    end, 60);
    v_name := v_base;
    if r.nama is not null and exists (select 1 from public.schedule_templates t where lower(t.nama) = lower(v_name)) then
      v_base := left(r.nama || ' (' || r.branch_nama || ')', 60);
      v_name := v_base;
    end if;
    n := 2;
    while exists (select 1 from public.schedule_templates t where lower(t.nama) = lower(v_name)) loop
      v_name := left(v_base, 56) || ' ' || n;
      n := n + 1;
    end loop;

    insert into public.schedule_templates
      (nama, jam_masuk, jam_pulang, hari_kerja, toleransi_terlambat_menit, potong_terlambat, hitung_lembur)
    values
      (v_name, r.jam_masuk, r.jam_pulang, r.hari_kerja, r.toleransi_terlambat_menit,
       coalesce(r.potong_terlambat, false), coalesce(r.hitung_lembur, false))
    returning id into v_id;

    update public.work_schedules
      set template_id = v_id, nama = case when nama is null then null else v_name end
      where id = r.id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Editing a template rewrites every row it is applied to.
-- ---------------------------------------------------------------------------
create or replace function sync_schedule_template()
returns trigger language plpgsql set search_path = public as $$
begin
  update work_schedules
    set jam_masuk = new.jam_masuk,
        jam_pulang = new.jam_pulang,
        hari_kerja = new.hari_kerja,
        toleransi_terlambat_menit = new.toleransi_terlambat_menit,
        potong_terlambat = new.potong_terlambat,
        hitung_lembur = new.hitung_lembur,
        nama = case when nama is null then null else new.nama end
    where template_id = new.id;
  return new;
end;
$$;

drop trigger if exists schedule_templates_sync on public.schedule_templates;
create trigger schedule_templates_sync
  after update on public.schedule_templates
  for each row execute function sync_schedule_template();

-- ---------------------------------------------------------------------------
-- "Berlaku untuk": sets exactly which branches, departments and employees
-- follow a template, in one transaction.
--   * A branch always keeps one jadwal utama, so it can be moved to this
--     template but not dropped from it (move it from the other template).
--   * A department or employee taken from another template leaves that one.
--   * Departments / employees no longer listed fall back to the next level.
-- ---------------------------------------------------------------------------
create or replace function set_schedule_template_targets(
  p_template uuid,
  p_branches uuid[],
  p_departments uuid[],
  p_employees uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t schedule_templates;
  v_orphan text;
begin
  if not is_hr_admin_role() then
    raise exception 'only hr admin may change work schedules';
  end if;
  select * into t from schedule_templates where id = p_template for update;
  if not found then
    raise exception 'schedule template not found';
  end if;
  p_branches := coalesce(p_branches, '{}');
  p_departments := coalesce(p_departments, '{}');
  p_employees := coalesce(p_employees, '{}');

  select string_agg(b.nama, ', ' order by b.nama) into v_orphan
    from work_schedules ws join branches b on b.id = ws.branch_id
    where ws.template_id = t.id and ws.department_id is null and ws.nama is null
      and not (ws.branch_id = any(p_branches));
  if v_orphan is not null then
    raise exception 'cabang_tanpa_jadwal: %', v_orphan using errcode = 'P0001';
  end if;

  -- Branch defaults: take over the branch's row, or create it.
  update work_schedules
    set template_id = t.id, jam_masuk = t.jam_masuk, jam_pulang = t.jam_pulang, hari_kerja = t.hari_kerja,
        toleransi_terlambat_menit = t.toleransi_terlambat_menit, potong_terlambat = t.potong_terlambat,
        hitung_lembur = t.hitung_lembur
    where branch_id = any(p_branches) and department_id is null and nama is null;
  insert into work_schedules
    (branch_id, jam_masuk, jam_pulang, hari_kerja, toleransi_terlambat_menit, potong_terlambat, hitung_lembur, template_id)
    select b.id, t.jam_masuk, t.jam_pulang, t.hari_kerja, t.toleransi_terlambat_menit, t.potong_terlambat, t.hitung_lembur, t.id
    from branches b
    where b.id = any(p_branches)
      and not exists (select 1 from work_schedules w where w.branch_id = b.id and w.department_id is null and w.nama is null);

  -- Departments.
  delete from work_schedules
    where template_id = t.id and department_id is not null and not (department_id = any(p_departments));
  update work_schedules
    set template_id = t.id, jam_masuk = t.jam_masuk, jam_pulang = t.jam_pulang, hari_kerja = t.hari_kerja,
        toleransi_terlambat_menit = t.toleransi_terlambat_menit, potong_terlambat = t.potong_terlambat,
        hitung_lembur = t.hitung_lembur
    where department_id = any(p_departments);
  insert into work_schedules
    (branch_id, department_id, jam_masuk, jam_pulang, hari_kerja, toleransi_terlambat_menit, potong_terlambat, hitung_lembur, template_id)
    select d.branch_id, d.id, t.jam_masuk, t.jam_pulang, t.hari_kerja, t.toleransi_terlambat_menit, t.potong_terlambat, t.hitung_lembur, t.id
    from departments d
    where d.id = any(p_departments)
      and not exists (select 1 from work_schedules w where w.department_id = d.id);

  -- Employees: one named row of this template per branch they are in.
  update employees set work_schedule_id = null
    where work_schedule_id in (select id from work_schedules where template_id = t.id and nama is not null)
      and not (id = any(p_employees));
  insert into work_schedules
    (branch_id, nama, jam_masuk, jam_pulang, hari_kerja, toleransi_terlambat_menit, potong_terlambat, hitung_lembur, template_id)
    select distinct e.branch_id, t.nama, t.jam_masuk, t.jam_pulang, t.hari_kerja, t.toleransi_terlambat_menit,
           t.potong_terlambat, t.hitung_lembur, t.id
    from employees e
    where e.id = any(p_employees)
      and not exists (select 1 from work_schedules w where w.template_id = t.id and w.branch_id = e.branch_id and w.nama is not null);
  update employees e set work_schedule_id = w.id
    from work_schedules w
    where e.id = any(p_employees) and w.template_id = t.id and w.nama is not null and w.branch_id = e.branch_id;
  delete from work_schedules w
    where w.template_id = t.id and w.nama is not null
      and not exists (select 1 from employees e where e.work_schedule_id = w.id);
end;
$$;

revoke execute on function set_schedule_template_targets(uuid, uuid[], uuid[], uuid[]) from public, anon;
grant execute on function set_schedule_template_targets(uuid, uuid[], uuid[], uuid[]) to authenticated, service_role;
