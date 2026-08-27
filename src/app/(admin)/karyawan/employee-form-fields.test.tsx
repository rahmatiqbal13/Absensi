import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmployeeFormFields } from "./employee-form-fields";

const props = {
  branches: [{ id: "b1", nama: "Kantor Pusat" }],
  departments: [{ id: "d1", nama: "Operasional" }],
  approverOptions: [{ id: "a1", nama: "Super Admin" }],
};

describe("EmployeeFormFields", () => {
  it("renders every field validateEmployeeInput expects", () => {
    render(<EmployeeFormFields {...props} />);
    for (const label of [/nama/i, /email/i, /jabatan/i, /status kontrak/i, /tanggal mulai kerja/i, /gaji pokok/i, /^role/i, /cabang/i]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("prefills from defaults", () => {
    render(<EmployeeFormFields {...props} defaults={{ nama: "Budi", gajiPokok: "8000000", branchId: "b1" }} />);
    expect(screen.getByLabelText(/nama/i)).toHaveValue("Budi");
    expect(screen.getByLabelText(/gaji pokok/i)).toHaveValue(8000000);
  });
});
