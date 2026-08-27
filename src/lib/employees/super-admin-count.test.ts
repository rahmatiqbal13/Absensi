import { describe, it, expect, vi } from "vitest";
import { countActiveSuperAdmins } from "./super-admin-count";

describe("countActiveSuperAdmins", () => {
  it("returns the count of active super_admin employees", async () => {
    const db = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ count: 2, error: null }),
          }),
        }),
      }),
    };
    const count = await countActiveSuperAdmins(db as any);
    expect(count).toBe(2);
  });

  it("returns null (unknown, not zero) and logs when the count query fails", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ count: null, error: { message: "boom" } }),
          }),
        }),
      }),
    };
    const count = await countActiveSuperAdmins(db as any);
    expect(count).toBeNull();
    expect(errSpy).toHaveBeenCalledWith(
      "countActiveSuperAdmins: query failed",
      expect.objectContaining({ message: "boom" }),
    );
    errSpy.mockRestore();
  });
});
