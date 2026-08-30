import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("./actions", () => ({ login: vi.fn() }));

import LoginPage from "./page";

describe("LoginPage", () => {
  it("renders the heading, both inputs, and the submit button", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("heading", { name: "Masuk" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Kata Sandi")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Masuk" })).toBeInTheDocument();
  });

  it("shows the nonaktif notice as an alert", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ reason: "nonaktif" }) }));
    expect(screen.getByRole("alert")).toHaveTextContent(/nonaktif/i);
  });

  it("shows a login error as an alert", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ error: "Email atau kata sandi salah." }) }));
    expect(screen.getByRole("alert")).toHaveTextContent("Email atau kata sandi salah.");
  });

  it("has no alert when there is no error or reason", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({}) }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
