import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Field } from "./field";

describe("Field", () => {
  it("links the label to the control by id", () => {
    render(<Field id="nama" label="Nama Instansi"><input id="nama" /></Field>);
    expect(screen.getByLabelText("Nama Instansi")).toBeInTheDocument();
  });

  it("shows a hint and wires aria-describedby", () => {
    render(<Field id="x" label="X" hint="Maks 512 KB"><input id="x" /></Field>);
    const input = screen.getByLabelText("X");
    expect(screen.getByText("Maks 512 KB")).toBeInTheDocument();
    expect(input.getAttribute("aria-describedby")).toContain("x-hint");
  });

  it("shows an error with role=alert and sets aria-invalid", () => {
    render(<Field id="y" label="Y" error="Wajib diisi"><input id="y" /></Field>);
    const input = screen.getByLabelText("Y");
    expect(screen.getByRole("alert")).toHaveTextContent("Wajib diisi");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toContain("y-error");
  });

  it("marks required fields", () => {
    render(<Field id="z" label="Z" required><input id="z" /></Field>);
    expect(screen.getByText("Z").textContent).toContain("*");
  });
});
