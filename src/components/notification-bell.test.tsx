import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NotificationBell } from "./notification-bell";
import type { NotificationFeed } from "@/lib/notifications/actions";

const FEED: NotificationFeed = {
  unread: 2,
  items: [
    { id: "n1", jenis: "lupa_absen", judul: "Anda belum absen masuk hari ini", isi: "Jadwal masuk Anda pukul 08:00 WIB.", link: "/absen", createdAt: new Date().toISOString(), read: false },
    { id: "n2", jenis: "slip_gaji", judul: "Slip gaji November 2026 sudah terbit", isi: "Lihat dan unduh PDF-nya di menu Slip Gaji.", link: "/slip-gaji/2026-11", createdAt: new Date().toISOString(), read: false },
  ],
};

describe("NotificationBell", () => {
  it("shows the unread count, lists items with links, and marks them read on open", async () => {
    const load = vi.fn().mockResolvedValue(FEED);
    const markRead = vi.fn().mockResolvedValue(undefined);
    render(<NotificationBell load={load} markRead={markRead} />);

    const bell = await screen.findByRole("button", { name: "Notifikasi, 2 belum dibaca" });
    fireEvent.click(bell);

    expect(markRead).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: /slip gaji november 2026/i })).toHaveAttribute("href", "/slip-gaji/2026-11");
    expect(screen.getByRole("link", { name: /belum absen masuk/i })).toHaveAttribute("href", "/absen");
    await waitFor(() => expect(screen.getByRole("button", { name: "Notifikasi" })).toBeInTheDocument());
  });

  it("does not call markRead when nothing is unread", async () => {
    const load = vi.fn().mockResolvedValue({ unread: 0, items: [] });
    const markRead = vi.fn();
    render(<NotificationBell load={load} markRead={markRead} />);
    await waitFor(() => expect(load).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Notifikasi" }));
    expect(await screen.findByText("Belum ada notifikasi.")).toBeInTheDocument();
    expect(markRead).not.toHaveBeenCalled();
  });
});
