import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Inbox } from "lucide-react";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("renders the message and optional action", () => {
    render(<EmptyState icon={Inbox} message="Belum ada data" action={<button>Tambah</button>} />);
    expect(screen.getByText("Belum ada data")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tambah" })).toBeInTheDocument();
  });
});
