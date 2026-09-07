import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FieldSection } from "./field-section";

describe("FieldSection", () => {
  it("renders title, hint, and children", () => {
    render(
      <FieldSection title="Lokasi" hint="Geser pin ke kantor">
        <p>isi</p>
      </FieldSection>,
    );
    expect(screen.getByText("Lokasi")).toBeInTheDocument();
    expect(screen.getByText("Geser pin ke kantor")).toBeInTheDocument();
    expect(screen.getByText("isi")).toBeInTheDocument();
  });
});
