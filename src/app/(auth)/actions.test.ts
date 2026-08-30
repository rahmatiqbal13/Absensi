import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/server");
vi.mock("next/navigation");
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { signOut } from "./actions";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

describe("signOut", () => {
  it("signs out then redirects to /login", async () => {
    const signOutMock = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: { signOut: signOutMock },
    } as any);

    vi.mocked(redirect).mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(signOut()).rejects.toThrow("NEXT_REDIRECT");
    expect(signOutMock).toHaveBeenCalledOnce();
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/", "layout");
    expect(vi.mocked(redirect)).toHaveBeenCalledWith("/login");
  });
});
