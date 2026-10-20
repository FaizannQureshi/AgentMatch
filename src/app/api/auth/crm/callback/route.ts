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
    // Without Postgres, HighLevel refresh-token rotation only survives the current
    // serverless instance. Always show the token so it can be written to Vercel env.
    const persistNote = process.env.DATABASE_URL
      ? "<p>Tokens are stored in the database. You can close this tab.</p>"
      : `<p><b>Important:</b> copy this refresh token into <code>GHL_REFRESH_TOKEN</code> on Vercel (and .env.local). HighLevel rotates it; without a database the env value must stay current or imports fail.</p><pre style="white-space:pre-wrap;word-break:break-all">${saved.refreshToken}</pre>`;
    const html = `<!doctype html><html><body style="font-family:sans-serif;padding:40px;max-width:720px">
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
