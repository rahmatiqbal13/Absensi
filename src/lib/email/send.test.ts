import { describe, it, expect, vi, afterEach } from "vitest";
import { sendEmail, escapeHtml } from "./send";

const MSG = { to: "a@b.id", subject: "S", html: "<p>x</p>", text: "x" };

describe("sendEmail", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("skips quietly when Resend is not configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await sendEmail(MSG)).toEqual({ sent: false, reason: "not-configured" });
  });

  it("posts to Resend with the configured sender", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "Absensi <no-reply@contoh.id>");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "em_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendEmail(MSG)).toEqual({ sent: true, id: "em_1" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(JSON.parse(init.body)).toMatchObject({ from: "Absensi <no-reply@contoh.id>", to: ["a@b.id"] });
    expect(init.headers.Authorization).toBe("Bearer re_test");
  });

  it("reports a rejected send without throwing", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "x@y.id");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad", { status: 422 })));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendEmail(MSG)).toEqual({ sent: false, reason: "http-422" });
  });
});

describe("escapeHtml", () => {
  it("escapes markup", () => {
    expect(escapeHtml(`<b>"Tom" & 'Jerry'</b>`)).toBe("&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;");
  });
});
