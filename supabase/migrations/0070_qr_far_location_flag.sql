-- supabase/migrations/0070_qr_far_location_flag.sql
--
-- New location flag `qr_jauh`: a kiosk QR scanned by a phone whose own GPS put
-- it well outside the office (src/lib/attendance/location-flags.ts). A QR is
-- valid for 30–60 s, so a photo of the kiosk screen forwarded to someone at home
-- still verifies; the flag lets HR spot it. Only the allowed-values check
-- changes — existing rows already satisfy it.

alter table public.attendances drop constraint if exists attendances_flag_lokasi_valid;
alter table public.attendances add constraint attendances_flag_lokasi_valid check (
  flag_lokasi_masuk <@ array['akurasi_rendah', 'lokasi_basi', 'lompatan_lokasi', 'qr_jauh']::text[]
  and flag_lokasi_pulang <@ array['akurasi_rendah', 'lokasi_basi', 'lompatan_lokasi', 'qr_jauh']::text[]
);
