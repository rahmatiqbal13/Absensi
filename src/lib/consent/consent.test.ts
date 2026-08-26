import { describe, it, expect, vi } from "vitest";
import { hasActiveConsent, recordConsent, CONSENT_JENIS_LOKASI_FOTO, CONSENT_POLICY_VERSION } from "./consent";

function makeMockDb(overrides: Partial<any> = {}) {
  // Create spies for each method in the chain so we can verify arguments
  const limitMock = vi.fn().mockResolvedValue({ data: [], error: null });
  const secondEqMock = vi.fn().mockReturnValue({ limit: limitMock });
  const firstEqMock = vi.fn().mockReturnValue({ eq: secondEqMock });
  const selectMock = vi.fn().mockReturnValue({ eq: firstEqMock });
  const insertMock = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: { id: "consent-1" }, error: null }),
    }),
  });

  const fromMock = vi.fn((table: string) => {
    if (table === "consents") {
      return {
        select: selectMock,
        insert: insertMock,
      };
    }
  });

  const db = {
    from: fromMock,
    __selectMock: selectMock,
    __firstEqMock: firstEqMock,
    __secondEqMock: secondEqMock,
    __limitMock: limitMock,
    __insertMock: insertMock,
    ...overrides,
  };

  return db;
}

describe("hasActiveConsent", () => {
  it("returns false when no consent row exists", async () => {
    const db = makeMockDb();
    const result = await hasActiveConsent(db as any, "employee-1");
    expect(result).toBe(false);
    expect(db.from).toHaveBeenCalledWith("consents");
    expect(db.__selectMock).toHaveBeenCalledWith("id");
    expect(db.__firstEqMock).toHaveBeenCalledWith("employee_id", "employee-1");
    expect(db.__secondEqMock).toHaveBeenCalledWith("jenis", CONSENT_JENIS_LOKASI_FOTO);
    expect(db.__limitMock).toHaveBeenCalledWith(1);
  });

  it("returns true when a consent row exists for the right jenis", async () => {
    const limitMock = vi.fn().mockResolvedValue({ data: [{ id: "consent-1" }], error: null });
    const secondEqMock = vi.fn().mockReturnValue({ limit: limitMock });
    const firstEqMock = vi.fn().mockReturnValue({ eq: secondEqMock });
    const selectMock = vi.fn().mockReturnValue({ eq: firstEqMock });

    const db = makeMockDb({
      from: vi.fn((table: string) => {
        if (table === "consents") {
          return {
            select: selectMock,
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: "consent-1" }, error: null }),
              }),
            }),
          };
        }
      }),
      __selectMock: selectMock,
      __firstEqMock: firstEqMock,
      __secondEqMock: secondEqMock,
      __limitMock: limitMock,
    });

    const result = await hasActiveConsent(db as any, "employee-1");
    expect(result).toBe(true);
    expect(db.from).toHaveBeenCalledWith("consents");
    expect(db.__selectMock).toHaveBeenCalledWith("id");
    expect(db.__firstEqMock).toHaveBeenCalledWith("employee_id", "employee-1");
    expect(db.__secondEqMock).toHaveBeenCalledWith("jenis", CONSENT_JENIS_LOKASI_FOTO);
    expect(db.__limitMock).toHaveBeenCalledWith(1);
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
