import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../app/(auth)/actions");

import { SignOutButton } from "./sign-out-button";
import * as actionsModule from "../app/(auth)/actions";

describe("SignOutButton", () => {
  it("calls signOut on click", async () => {
    const signOutMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(actionsModule.signOut).mockImplementation(signOutMock);

    const user = userEvent.setup();
    render(<SignOutButton />);
    await user.click(screen.getByRole("button", { name: /keluar/i }));
    expect(signOutMock).toHaveBeenCalledOnce();
  });
});
