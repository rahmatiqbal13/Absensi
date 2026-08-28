import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const setTheme = vi.fn();
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme, resolvedTheme: "light" }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { ThemeToggle } from "./theme-toggle";

describe("ThemeToggle", () => {
  it("opens a menu and sets the theme", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole("button", { name: /tema/i }));
    await user.click(await screen.findByRole("menuitem", { name: /gelap/i }));
    expect(setTheme).toHaveBeenCalledWith("dark");
  });
});
