import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EmployeeFormFields } from "./employee-form-fields";

const props = {
  branches: [{ id: "b1", nama: "Kantor Pusat" }],
  departments: [{ id: "d1", nama: "Operasional" }],
  approverOptions: [{ id: "a1", nama: "Super Admin" }],
};

describe("EmployeeFormFields", () => {
  it("renders every field validateEmployeeInput expects", () => {
    render(<EmployeeFormFields {...props} />);
    for (const label of [/nama/i, /email/i, /jabatan/i, /status kontrak/i, /tanggal mulai kerja/i, /gaji pokok/i, /cabang/i]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("picks the role through radio cards and explains the approver rule", () => {
    render(<EmployeeFormFields {...props} defaults={{ role: "karyawan" }} />);
    const group = screen.getByRole("group", { name: /peran sistem/i });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^karyawan/i })).toBeChecked();
    expect(screen.getByText(/opsional\. dipakai saat atasan/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /^hr admin/i }));
    expect(screen.getByRole("radio", { name: /^hr admin/i })).toBeChecked();
    expect(screen.getByText(/wajib untuk hr admin/i)).toBeInTheDocument();
  });

  it("shows the per-day pay estimate", () => {
    render(<EmployeeFormFields {...props} defaults={{ gajiPokok: "6600000" }} />);
    expect(screen.getByText(/per hari kerja/i).textContent).toMatch(/300\.000/);
  });

  it("renders the email input read-only when emailReadOnly is set, keeping its value", () => {
    render(<EmployeeFormFields {...props} emailReadOnly defaults={{ email: "budi@x.co" }} />);
    const email = screen.getByLabelText(/email/i);
    expect(email).toHaveAttribute("readonly");
    expect(email).toHaveValue("budi@x.co");
  });

  it("leaves the email input editable by default", () => {
    render(<EmployeeFormFields {...props} />);
    expect(screen.getByLabelText(/email/i)).not.toHaveAttribute("readonly");
  });

  it("prefills from defaults", () => {
    render(<EmployeeFormFields {...props} defaults={{ nama: "Budi", gajiPokok: "8000000", branchId: "b1" }} />);
    expect(screen.getByLabelText(/nama/i)).toHaveValue("Budi");
    expect(screen.getByLabelText(/gaji pokok/i)).toHaveValue(8000000);
  });

  it("groups fields under four section headings", () => {
    render(<EmployeeFormFields branches={[]} departments={[]} approverOptions={[]} />);
    for (const h of ["Identitas", "Kepegawaian", "Struktur Organisasi", "Persetujuan"]) {
      expect(screen.getByRole("heading", { name: h })).toBeInTheDocument();
    }
  });
});
