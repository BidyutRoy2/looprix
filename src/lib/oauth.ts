/** Google OAuth (paste-code flow, no local server). */

const REDIRECT_URI = "urn:ietf:wg:oauth:2.0:oob";
const SCOPES = ["https://www.googleapis.com/auth/youtube", "https://www.googleapis.com/auth/youtube.force-ssl"];

/** Auth URL the user opens in the external browser to get a code. */
export function buildGoogleAuthUrl(clientId: string): string {
  const q = new URLSearchParams({
    client_id: clientId.trim(),
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`;
}

export function validateOAuthCode(code: string): { ok: boolean; reason?: string } {
  if (!code.trim()) return { ok: false, reason: "Google theke pawa code ta paste koro." };
  return { ok: true };
}
