import { describe, it, expect, vi } from "vitest";
import { uploadAttendancePhoto, PHOTO_RETENTION_DAYS } from "./photo-upload";

function makeMockDb(overrides: Partial<any> = {}) {
  return {
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({
          data: { path: "employee-1/masuk-1735689600000.jpg" },
          error: null,
        }),
      }),
    },
    ...overrides,
  };
}

describe("uploadAttendancePhoto", () => {
  it("uploads to the attendance-photos bucket under a path scoped by employee id", async () => {
    const db = makeMockDb();
    const file = new Blob(["fake-image-bytes"], { type: "image/jpeg" });
    const now = new Date("2026-09-01T09:00:00Z");

    const result = await uploadAttendancePhoto(db as any, "employee-1", file, "masuk", now);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.path).toMatch(/^employee-1\/masuk-\d+\.jpg$/);
      expect(result.expiresAt).toBe(
        new Date(now.getTime() + PHOTO_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      );
    }
    expect(db.storage.from).toHaveBeenCalledWith("attendance-photos");
  });

  it("returns an error when the upload fails", async () => {
    const db = makeMockDb({
      storage: {
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ data: null, error: { message: "storage full" } }),
        }),
      },
    });
    const file = new Blob(["fake-image-bytes"], { type: "image/jpeg" });

    const result = await uploadAttendancePhoto(db as any, "employee-1", file, "pulang");

    expect(result).toEqual({ ok: false, error: "storage full" });
  });
});
