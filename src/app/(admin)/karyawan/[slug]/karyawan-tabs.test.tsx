import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KaryawanTabs } from "./karyawan-tabs";

describe("KaryawanTabs", () => {
  it("shows the Detail slot first and switches to Riwayat on click", async () => {
    const user = userEvent.setup();
    render(<KaryawanTabs detailSlot={<p>detail here</p>} riwayatSlot={<p>riwayat here</p>} />);
    expect(screen.getByText("detail here")).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Riwayat" }));
    expect(screen.getByText("riwayat here")).toBeVisible();
  });
});
