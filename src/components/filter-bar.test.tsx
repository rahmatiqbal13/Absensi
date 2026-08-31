import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FilterBar } from "./filter-bar";

describe("FilterBar", () => {
  it("renders its children", () => {
    render(<FilterBar><span>child</span></FilterBar>);
    expect(screen.getByText("child")).toBeInTheDocument();
  });
  it("applies the base layout classes and merges className", () => {
    const { container } = render(<FilterBar className="mt-4">x</FilterBar>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("flex");
    expect(el.className).toContain("bg-card");
    expect(el.className).toContain("mt-4");
  });
});
