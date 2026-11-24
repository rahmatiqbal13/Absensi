-- Email pegawai menjadi opsional.
--
-- Pegawai yang hanya absen lewat mesin fingerprint (mis. ditarik dari mesin)
-- boleh ditambahkan tanpa email. Akun auth-nya tetap dibuat (employees.id
-- merujuk auth.users) dengan alamat internal yang tidak bisa dipakai login;
-- employees.email tetap null sampai HR mengisinya di halaman pegawai, lalu HR
-- membuat link atur kata sandi seperti biasa.
--
-- Unique tetap berlaku: banyak null diperbolehkan, email terisi tetap unik.

alter table public.employees alter column email drop not null;
