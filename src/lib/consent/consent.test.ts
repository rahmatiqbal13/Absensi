import { describe, it, expect, vi } from "vitest";
import { hasActiveConsent, recordConsent, CONSENT_JENIS_LOKASI_FOTO, CONSENT_POLICY_VERSION } from "./consent";

function makeMockDb(overrides: Partial<any> = {}) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: "consent-1" }, error: null }),
        }),
      }),
    }),
    ...overrides,
  };
}

describe("hasActiveConsent", () => {
  it("returns false when no consent row exists", async () => {
    const db = makeMockDb();
    const result = await hasActiveConsent(db as any, "employee-1");
    expect(result).toBe(false);
    expect(db.from).toHaveBeenCalledWith("consents");
  });

  it("returns true when a consent row exists for the right jenis", async () => {
    const db = makeMockDb({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [{ id: "consent-1" }], error: null }),
            }),
          }),
        }),
      }),
    });
    const result = await hasActiveConsent(db as any, "employee-1");
    expect(result).toBe(true);
  });
});

describe("recordConsent", () => {
  it("inserts a consent row with the current policy version and jenis", async () => {
    const db = makeMockDb();
    const result = await recordConsent(db as any, "employee-1");
    expect(result).toEqual({ ok: true });
    expect(db.from).toHaveBeenCalledWith("consents");
    const insertCall = db.from.mock.results[0].value.insert as ReturnType<typeof vi.fn>;
    expect(insertCall).toHaveBeenCalledWith(
      expect.objectContaining({
        employee_id: "employee-1",
        jenis: CONSENT_JENIS_LOKASI_FOTO,
        versi_kebijakan: CONSENT_POLICY_VERSION,
      }),
    );
  });

  it("returns an error when the insert fails", async () => {
    const db = makeMockDb({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: "insert failed" } }),
          }),
        }),
      }),
    });
    const result = await recordConsent(db as any, "employee-1");
    expect(result).toEqual({ ok: false, error: "insert failed" });
  });
});
