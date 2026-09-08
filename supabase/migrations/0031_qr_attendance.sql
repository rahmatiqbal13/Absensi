-- QR attendance: a rotating per-branch kiosk QR as an admin-enabled alternative
-- to the GPS geofence on /absen. qr_secret / kiosk_key are set when an admin
-- enables QR for the branch and kept (not nulled) on disable so re-enabling
-- doesn't break a screen already pointed at the kiosk URL. kiosk_key is the
-- login-less /kiosk/<key> URL segment and is resettable.
alter table branches
  add column qr_enabled boolean not null default false,
  add column qr_secret  text,
  add column kiosk_key   text unique;

-- Which method proved presence for each half of the attendance day.
alter table attendances
  add column metode_masuk  text check (metode_masuk  in ('gps','qr')),
  add column metode_pulang text check (metode_pulang in ('gps','qr'));
