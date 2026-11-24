import { describe, expect, it } from "vitest";
import { extractMachineUsers } from "./machine-users";

describe("extractMachineUsers", () => {
  it("reads an FK-style id list", () => {
    expect(extractMachineUsers({ packet_id: "1", user_id_array: [{ user_id: "0008", backup_number: 0 }, { user_id: "12" }] })).toEqual([
      { pin: "8", nama: null },
      { pin: "12", nama: null },
    ]);
  });

  it("reads a single FK-style user info and strips NUL padding", () => {
    expect(extractMachineUsers({ user_id: "8", user_name: "budi\0\0", user_privilege: "USER" })).toEqual([{ pin: "8", nama: "budi" }]);
  });

  it("reads R6-style users and id arrays", () => {
    expect(
      extractMachineUsers({ packageId: 0, usersCount: 2, users: [{ userId: "6", name: "Siti" }, { userId: "10", name: "" }] }),
    ).toEqual([
      { pin: "6", nama: "Siti" },
      { pin: "10", nama: null },
    ]);
    expect(extractMachineUsers({ usersId: ["11", 12, "bad pin!"] })).toEqual([
      { pin: "11", nama: null },
      { pin: "12", nama: null },
    ]);
  });

  it("keeps the named entry when a PIN appears twice", () => {
    expect(extractMachineUsers({ usersId: ["8"], users: [{ userId: "8", name: "Budi" }] })).toEqual([{ pin: "8", nama: "Budi" }]);
  });

  it("returns nothing for empty or unrelated replies", () => {
    expect(extractMachineUsers({ packageId: 0, users: null, usersCount: 0 })).toEqual([]);
    expect(extractMachineUsers(null)).toEqual([]);
  });
});
