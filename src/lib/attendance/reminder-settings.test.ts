import { describe, it, expect, vi } from "vitest";
import { DEFAULT_REMINDER_SETTINGS, loadReminderSettings, renderReminder, validateReminderSetting } from "./reminder-settings";

describe("renderReminder", () => {
  it("fills {nama} and {jam}, leaving other braces alone", () => {
    expect(renderReminder("Halo {nama}, masuk {jam} {x}", { nama: "Budi", jam: "08:00" })).toBe("Halo Budi, masuk 08:00 {x}");
  });
});

describe("validateReminderSetting", () => {
  const base = { jenis: "masuk", aktif: "true", menit: "30", judul: " Ayo absen ", isi: "Jam {jam}" };

  it("accepts a valid setting and trims text", () => {
    expect(validateReminderSetting(base)).toEqual({
      ok: true,
      value: { jenis: "masuk", aktif: true, menit: 30, judul: "Ayo absen", isi: "Jam {jam}" },
    });
    expect(validateReminderSetting({ ...base, aktif: "false" })).toMatchObject({ ok: true, value: { aktif: false } });
  });

  it("rejects bad kinds, minutes and empty or long text", () => {
    expect(validateReminderSetting({ ...base, jenis: "x" }).ok).toBe(false);
    for (const menit of ["", "-1", "241", "1.5", "abc"]) expect(validateReminderSetting({ ...base, menit }).ok).toBe(false);
    expect(validateReminderSetting({ ...base, judul: "  " }).ok).toBe(false);
    expect(validateReminderSetting({ ...base, isi: "x".repeat(301) }).ok).toBe(false);
  });
});

describe("loadReminderSettings", () => {
  const db = (result: unknown) => ({ from: () => ({ select: () => Promise.resolve(result) }) }) as never;

  it("overlays saved rows on the defaults", async () => {
    const saved = { jenis: "pulang", aktif: false, menit: 30, judul: "Pulang", isi: "Absen pulang" };
    const { settings, migrated } = await loadReminderSettings(db({ data: [saved], error: null }));
    expect(migrated).toBe(true);
    expect(settings.pulang).toEqual(saved);
    expect(settings.masuk).toEqual(DEFAULT_REMINDER_SETTINGS.masuk);
  });

  it("falls back to the defaults before migration 0060", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await loadReminderSettings(db({ data: null, error: { code: "PGRST205", message: "not in schema cache" } }));
    expect(res).toEqual({ settings: DEFAULT_REMINDER_SETTINGS, migrated: false });
  });
});
