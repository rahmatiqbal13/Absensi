import type { MetadataRoute } from "next";
import { getAppSettings } from "@/lib/branding/get-app-settings";

// Installable ("Tambahkan ke layar utama") so employees open absen like an app.
// No service worker: clock-in needs the network (GPS check, server time), so an
// offline shell would only promise something the app can't do.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const s = await getAppSettings();
  return {
    name: s.namaInstansi,
    short_name: s.namaSingkat,
    description: s.tagline ?? "Absensi, cuti, dan slip gaji karyawan",
    lang: "id",
    // "/" sends each signed-in user to their home (absen or dashboard).
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f3f4fa",
    theme_color: s.warnaAksen,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
