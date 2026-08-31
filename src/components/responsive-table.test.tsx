// src/components/responsive-table.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ResponsiveTable } from "./responsive-table";

type Row = { id: string; nama: string; jabatan: string; kota: string };
const rows: Row[] = [
  { id: "1", nama: "Andi", jabatan: "Staff", kota: "Jakarta" },
  { id: "2", nama: "Siti", jabatan: "Manajer", kota: "Bandung" },
];
const columns = [
  { key: "nama", header: "Nama", cell: (r: Row) => r.nama },
  { key: "jabatan", header: "Jabatan", cell: (r: Row) => r.jabatan, mobileLabel: "Jabatan" },
  { key: "kota", header: "Kota", cell: (r: Row) => r.kota, hideOnMobile: true },
];

describe("ResponsiveTable", () => {
  it("renders a desktop <table> with headers and cells", () => {
    render(
      <ResponsiveTable columns={columns} rows={rows} rowKey={(r) => r.id} emptyState={<p>kosong</p>} />,
    );
    const table = screen.getByRole("table");
    expect(within(table).getByText("Nama")).toBeInTheDocument();
    expect(within(table).getByText("Andi")).toBeInTheDocument();
    expect(within(table).getByText("Bandung")).toBeInTheDocument();
  });

  it("renders mobile cards with mobileLabels, omitting hideOnMobile columns", () => {
    const { container } = render(
      <ResponsiveTable columns={columns} rows={rows} rowKey={(r) => r.id} emptyState={<p>kosong</p>} />,
    );
    const mobile = container.querySelector('[data-slot="responsive-table-cards"]') as HTMLElement;
    expect(mobile).not.toBeNull();
    expect(within(mobile).getAllByText("Jabatan").length).toBe(2); // label per card
    expect(within(mobile).queryByText("Kota")).toBeNull();          // hideOnMobile
    expect(within(mobile).getByText("Manajer")).toBeInTheDocument();
  });

  it("wraps rows/cards in a link when rowHref is set", () => {
    render(
      <ResponsiveTable
        columns={columns} rows={rows} rowKey={(r) => r.id}
        rowHref={(r) => `/x/${r.id}`} emptyState={<p>kosong</p>}
      />,
    );
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).toContain("/x/1");
  });

  it("renders the emptyState and no table when rows is empty", () => {
    render(
      <ResponsiveTable columns={columns} rows={[]} rowKey={(r) => r.id} emptyState={<p>kosong</p>} />,
    );
    expect(screen.getByText("kosong")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("renders footer and footerMobile slots", () => {
    render(
      <ResponsiveTable
        columns={columns} rows={rows} rowKey={(r) => r.id} emptyState={<p>kosong</p>}
        footer={<><td>Total</td><td>2</td><td>2</td></>}
        footerMobile={<div>Total mobile</div>}
      />,
    );
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("Total mobile")).toBeInTheDocument();
  });
});
