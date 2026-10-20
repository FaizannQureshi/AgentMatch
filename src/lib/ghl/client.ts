import { getAgencyToken, getLocationToken } from "./oauth";

const API = "https://services.leadconnectorhq.com";
const VERSION = "2021-07-28";

async function ghl(path: string, bearer: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${bearer}`,
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
  const agency = await getAgencyToken();
  const data = await ghl(`/locations/${encodeURIComponent(locationId)}`, agency.token);
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
  const bearer = await getLocationToken(locationId);
  const data = await ghl("/contacts/upsert", bearer, {
    method: "POST",
    body: JSON.stringify({
      locationId,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email || undefined,
      phone: contact.phone ? toE164(contact.phone) : undefined,
      tags: contact.tags.length ? contact.tags : undefined,
      source: "AI Partnership Platform",
    }),
  });
  const saved = data.contact as { id?: string; locationId?: string } | undefined;
  if (!saved?.id) {
    throw new Error("CRM accepted the request but did not return a contact id");
  }
  if (saved.locationId && saved.locationId !== locationId) {
    throw new Error(`Contact landed in a different subaccount (${saved.locationId})`);
  }
  return saved.id;
}
