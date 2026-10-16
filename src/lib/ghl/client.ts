const API = "https://services.leadconnectorhq.com";
const VERSION = "2021-07-28";

function token() {
  const value = process.env.GHL_AGENCY_TOKEN;
  if (!value) throw new Error("GHL_AGENCY_TOKEN is not set");
  return value;
}

async function ghl(path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      Version: VERSION,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { message: text };
  }
  if (!res.ok) {
    const message =
      (body as { message?: string; msg?: string })?.message ||
      (body as { msg?: string })?.msg ||
      `GoHighLevel returned ${res.status}`;
    throw new Error(message);
  }
  return body as Record<string, unknown>;
}

export async function verifyLocation(locationId: string): Promise<string> {
  const data = await ghl(`/locations/${encodeURIComponent(locationId)}`);
  const location = (data.location as { name?: string; id?: string } | undefined) ?? data;
  const name = typeof location.name === "string" ? location.name : "";
  const id = typeof location.id === "string" ? location.id : locationId;
  if (!id) throw new Error("Subaccount was not found");
  return name;
}

export interface GhlContactInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  tags: string[];
}

function toE164(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return phone;
}

export async function upsertContact(locationId: string, contact: GhlContactInput) {
  await ghl("/contacts/upsert", {
    method: "POST",
    body: JSON.stringify({
      locationId,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email || undefined,
      phone: contact.phone ? toE164(contact.phone) : undefined,
      tags: contact.tags,
      source: "AI Partnership Platform",
    }),
  });
}
