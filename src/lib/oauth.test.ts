import { describe, expect, it } from "vitest";
import { buildGoogleAuthUrl, validateOAuthCode } from "./oauth";

describe("google oauth auth url (paste-code flow)", () => {
  it("contains client id, oob redirect, code flow, offline access and youtube scopes", () => {
    const url = buildGoogleAuthUrl("1234567890-abc.apps.googleusercontent.com");
    const u = new URL(url);
    expect(u.hostname).toBe("accounts.google.com");
    expect(u.searchParams.get("client_id")).toBe("1234567890-abc.apps.googleusercontent.com");
    expect(u.searchParams.get("redirect_uri")).toBe("urn:ietf:wg:oauth:2.0:oob");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("scope")).toContain("https://www.googleapis.com/auth/youtube");
    expect(u.searchParams.get("scope")).toContain("https://www.googleapis.com/auth/youtube.force-ssl");
  });
  it("rejects an empty pasted code", () => {
    expect(validateOAuthCode("  ").ok).toBe(false);
    expect(validateOAuthCode("4/0AX4XfWh-test-code").ok).toBe(true);
  });
});
