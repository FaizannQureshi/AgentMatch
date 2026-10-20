import { NextResponse } from "next/server";
import { saveAuthorizationCode } from "@/lib/ghl/oauth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (!code) {
    return new NextResponse(oauthError || "Missing authorization code", { status: 400 });
  }
  try {
    const saved = await saveAuthorizationCode(code);
    const persistNote = process.env.DATABASE_URL
      ? "<p>You can close this tab.</p>"
      : `<p>Send this refresh token so it can be stored on the server. It is shown once.</p><pre>${saved.refreshToken}</pre>`;
    const html = `<!doctype html><html><body style="font-family:sans-serif;padding:40px">
      <h1>Agency app connected</h1>
      <p>Imports can now run in every subaccount${saved.companyId ? ` for company ${saved.companyId}` : ""}.</p>
      ${persistNote}
    </body></html>`;
    return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Install failed";
    return new NextResponse(message, { status: 400 });
  }
}
