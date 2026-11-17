-- supabase/migrations/0037_department_locations.sql
--
-- A department may sit somewhere other than its branch's office (another
-- building, a warehouse, a site). Give it its own geofence pin; when unset its
-- employees use the branch's pin. Resolution: src/lib/attendance/office-location.ts.
--
--   lat / long               null = follow the branch (both set or both null)
--   radius_geofencing_meter  null = use the branch's radius

alter table departments
  add column if not exists lat double precision,
  add column if not exists long double precision,
  add column if not exists radius_geofencing_meter integer;

alter table departments drop constraint if exists departments_location_pair_check;
alter table departments add constraint departments_location_pair_check
  check ((lat is null) = (long is null));

alter table departments drop constraint if exists departments_location_range_check;
alter table departments add constraint departments_location_range_check
  check (
    (lat is null or (lat between -90 and 90 and lat <> 0))
    and (long is null or (long between -180 and 180 and long <> 0))
    and (radius_geofencing_meter is null or radius_geofencing_meter between 20 and 5000)
  );
