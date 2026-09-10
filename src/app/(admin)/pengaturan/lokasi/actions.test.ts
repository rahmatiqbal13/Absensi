import { describe, it, expect, vi, beforeEach } from "vitest";

const state: { role: string | null } = { role: "super_admin" };
const beforeRow: { data: unknown; error: unknown } = {
  data: { lat: -6.1, long: 106.8, radius_geofencing_meter: 100 },
  error: null,
};
const updateResult: { error: unknown } = { error: null };
const auditResult: { error: unknown } = { error: null };
// Rows returned by `.update(...).eq(...).select("id")` — [] means "no such branch".
const updateRows: { value: unknown[] } = { value: [{ id: "b1" }] };

const beforeSelectMock = vi.fn(() => Promise.resolve(beforeRow));
const updateSelectMock = vi.fn(() =>
  Promise.resolve({ data: updateRows.value, error: updateResult.error }),
);
// `.eq()` is awaited directly by saveBranchLocation (no `.select()`), and chained
// with `.select("id")` by setBranchQr / resetKioskKey.
const updateEqMock = vi.fn(() => ({
  error: updateResult.error,
  select: updateSelectMock,
}));
const updateMock = vi.fn((_v?: unknown) => ({ eq: updateEqMock }));
const auditInsertMock = vi.fn((_v?: unknown) => Promise.resolve(auditResult));

const selectChain = () => ({
  eq: () => ({
    single: () => beforeSelectMock(),
    maybeSingle: () => beforeSelectMock(),
  }),
});

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    from: () => ({
      update: (v: unknown) => updateMock(v),
      select: selectChain,
    }),
  }),
  createServiceRoleSupabaseClient: () => ({
    from: () => ({
      select: selectChain,
      insert: (v: unknown) => auditInsertMock(v),
    }),
  }),
}));
vi.mock("@/lib/auth/session", () => ({
  getCurrentEmployee: async () => (state.role ? { id: "u1", role: state.role } : null),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { saveBranchLocation, setBranchQr, resetKioskKey } from "./actions";
import { revalidatePath } from "next/cache";

function fd(entries: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

const validFd = () => fd({ lat: "-6.2", long: "106.816", radius: "120" });

beforeEach(() => {
  state.role = "super_admin";
  beforeRow.data = { lat: -6.1, long: 106.8, radius_geofencing_meter: 100 };
  beforeRow.error = null;
  updateResult.error = null;
  auditResult.error = null;
  updateRows.value = [{ id: "b1" }];
  updateMock.mockClear();
  updateEqMock.mockClear();
  updateSelectMock.mockClear();
  beforeSelectMock.mockClear();
  auditInsertMock.mockClear();
  vi.mocked(revalidatePath).mockClear();
});

describe("saveBranchLocation", () => {
  it("rejects a non-admin caller with \"Tidak diizinkan.\"", async () => {
    state.role = "karyawan";
    const r = await saveBranchLocation("b1", validFd());
    expect(r).toEqual({ ok: false, error: "Tidak diizinkan." });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects an empty branchId with \"Cabang tidak valid.\"", async () => {
    const r = await saveBranchLocation("", validFd());
    expect(r).toEqual({ ok: false, error: "Cabang tidak valid." });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects invalid coordinates (delegates to validateLocationInput)", async () => {
    const r = await saveBranchLocation("b1", fd({ lat: "999", long: "106.816", radius: "120" }));
    expect(r).toEqual({ ok: false, error: "Latitude tidak valid." });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("updates branches and writes a branch_location_update audit row on valid input", async () => {
    const r = await saveBranchLocation("b1", validFd());
    expect(r).toEqual({ ok: true });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ lat: -6.2, long: 106.816, radius_geofencing_meter: 120 }),
    );
    expect(auditInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: "u1",
        target_employee_id: null,
        aksi: "branch_location_update",
        detail: expect.objectContaining({
          branch_id: "b1",
          before: { lat: -6.1, long: 106.8, radius_geofencing_meter: 100 },
          after: { lat: -6.2, long: 106.816, radius_geofencing_meter: 120 },
        }),
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/pengaturan/lokasi");
    expect(revalidatePath).toHaveBeenCalledWith("/absen");
  });

  it("lets an hr_admin caller through to the success path", async () => {
    state.role = "hr_admin";
    const r = await saveBranchLocation("b1", validFd());
    expect(r).toEqual({ ok: true });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ lat: -6.2, long: 106.816, radius_geofencing_meter: 120 }),
    );
  });

  it("still returns { ok: true } when the audit insert errors", async () => {
    auditResult.error = { message: "rls denied" };
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await saveBranchLocation("b1", validFd());
    expect(r).toEqual({ ok: true });
    expect(updateMock).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("returns an Indonesian error when the branches.update errors", async () => {
    updateResult.error = { message: "boom" };
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await saveBranchLocation("b1", validFd());
    expect(r).toEqual({ ok: false, error: "Gagal menyimpan lokasi kantor." });
    expect(auditInsertMock).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe("setBranchQr", () => {
  it("rejects a non-admin caller with \"Tidak diizinkan.\" and does not update", async () => {
    state.role = "karyawan";
    const r = await setBranchQr("b1", fd({ enabled: "true" }));
    expect(r).toEqual({ ok: false, error: "Tidak diizinkan." });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("enable when qr_secret is null: generates a 64-hex secret + non-empty kiosk_key", async () => {
    beforeRow.data = { qr_secret: null, kiosk_key: null };
    const r = await setBranchQr("b1", fd({ enabled: "true" }));
    expect(r).toEqual({ ok: true });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ qr_enabled: true }),
    );
    const payload = updateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(/^[0-9a-f]{64}$/.test(payload.qr_secret as string)).toBe(true);
    expect(typeof payload.kiosk_key).toBe("string");
    expect((payload.kiosk_key as string).length).toBeGreaterThan(0);
    expect(auditInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: "u1",
        target_employee_id: null,
        aksi: "branch_qr_update",
        detail: expect.objectContaining({ branch_id: "b1", enabled: true }),
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/pengaturan/lokasi");
  });

  it("enable when qr_secret already set: sets qr_enabled but does not overwrite secret/key", async () => {
    beforeRow.data = { qr_secret: "existing-secret", kiosk_key: "existing-key" };
    const r = await setBranchQr("b1", fd({ enabled: "true" }));
    expect(r).toEqual({ ok: true });
    const payload = updateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.qr_enabled).toBe(true);
    expect(payload.qr_secret).toBeUndefined();
    expect(payload.kiosk_key).toBeUndefined();
  });

  it("disable: update { qr_enabled: false } only, secret/key untouched, audit enabled: false", async () => {
    beforeRow.data = { qr_secret: "existing-secret", kiosk_key: "existing-key" };
    const r = await setBranchQr("b1", fd({}));
    expect(r).toEqual({ ok: true });
    expect(updateMock.mock.calls[0][0]).toEqual({ qr_enabled: false });
    expect(auditInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        aksi: "branch_qr_update",
        detail: expect.objectContaining({ branch_id: "b1", enabled: false }),
      }),
    );
  });

  it("still returns { ok: true } when the audit insert errors", async () => {
    beforeRow.data = { qr_secret: "existing-secret", kiosk_key: "existing-key" };
    auditResult.error = { message: "rls denied" };
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await setBranchQr("b1", fd({ enabled: "true" }));
    expect(r).toEqual({ ok: true });
    expect(updateMock).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("returns \"Cabang tidak ditemukan.\" when the branch id matches no row", async () => {
    beforeRow.data = { qr_secret: "existing-secret", kiosk_key: "existing-key" };
    updateRows.value = [];
    const r = await setBranchQr("nope", fd({ enabled: "true" }));
    expect(r).toEqual({ ok: false, error: "Cabang tidak ditemukan." });
    expect(auditInsertMock).not.toHaveBeenCalled();
  });
});

describe("resetKioskKey", () => {
  it("rejects a non-admin caller and does not update", async () => {
    state.role = "karyawan";
    const r = await resetKioskKey("b1");
    expect(r).toEqual({ ok: false, error: "Tidak diizinkan." });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("regenerates BOTH qr_secret and kiosk_key and writes a branch_kiosk_reset audit row", async () => {
    const r1 = await resetKioskKey("b1");
    expect(r1).toEqual({ ok: true });
    const payload1 = updateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(payload1)).toEqual(["qr_secret", "kiosk_key"]);
    expect(/^[0-9a-f]{64}$/.test(payload1.qr_secret as string)).toBe(true);
    const firstKey = payload1.kiosk_key as string;
    const firstSecret = payload1.qr_secret as string;
    expect(typeof firstKey).toBe("string");
    expect(firstKey.length).toBeGreaterThan(0);

    await resetKioskKey("b1");
    const payload2 = updateMock.mock.calls[1][0] as Record<string, unknown>;
    expect(payload2.kiosk_key).not.toEqual(firstKey);
    expect(payload2.qr_secret).not.toEqual(firstSecret);

    expect(auditInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: "u1",
        target_employee_id: null,
        aksi: "branch_kiosk_reset",
        detail: expect.objectContaining({ branch_id: "b1" }),
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/pengaturan/lokasi");
  });

  it("returns \"Cabang tidak ditemukan.\" when the branch id matches no row", async () => {
    updateRows.value = [];
    const r = await resetKioskKey("nope");
    expect(r).toEqual({ ok: false, error: "Cabang tidak ditemukan." });
    expect(auditInsertMock).not.toHaveBeenCalled();
  });
});
