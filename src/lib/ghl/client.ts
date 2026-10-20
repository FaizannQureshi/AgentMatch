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
    const err = new Error(message) as Error & { status?: number; body?: unknown };
    err.status = res.status;
    err.body = body;
    throw err;
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

type ContactRow = {
  id?: string;
  locationId?: string;
  email?: string;
  deleted?: boolean;
};

function asContact(data: Record<string, unknown> | null | undefined): ContactRow | null {
  if (!data) return null;
  const nested = data.contact as ContactRow | undefined;
  if (nested?.id) return nested;
  if ((data as ContactRow).id) return data as ContactRow;
  return null;
}

async function searchVisibleByEmail(bearer: string, locationId: string, email: string) {
  const data = await ghl("/contacts/search", bearer, {
    method: "POST",
    body: JSON.stringify({ locationId, query: email, pageLimit: 20 }),
  });
  const contacts = (data.contacts as ContactRow[] | undefined) || [];
  const needle = email.toLowerCase();
  return (
    contacts.find((c) => (c.email || "").toLowerCase() === needle && c.deleted !== true) || null
  );
}

async function getContact(bearer: string, contactId: string) {
  try {
    const data = await ghl(`/contacts/${encodeURIComponent(contactId)}`, bearer);
    return asContact(data);
  } catch {
    return null;
  }
}

async function addTags(bearer: string, contactId: string, tags: string[]) {
  if (!tags.length) return;
  try {
    await ghl(`/contacts/${encodeURIComponent(contactId)}/tags`, bearer, {
      method: "POST",
      body: JSON.stringify({ tags }),
    });
  } catch {
    // Tag add is best-effort; contact write already succeeded.
  }
}

async function updateContact(
  bearer: string,
  contactId: string,
  patch: Record<string, unknown>,
) {
  await ghl(`/contacts/${encodeURIComponent(contactId)}`, bearer, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

async function createContact(
  bearer: string,
  locationId: string,
  contact: GhlContactInput,
  phone: string,
) {
  return ghl("/contacts/", bearer, {
    method: "POST",
    body: JSON.stringify({
      locationId,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email || undefined,
      phone: phone || undefined,
      source: "AI Partnership Platform",
    }),
  });
}

async function upsertByEmail(
  bearer: string,
  locationId: string,
  contact: GhlContactInput,
  phone: string,
  opts?: { includePhone?: boolean; createNewIfDuplicateAllowed?: boolean },
) {
  return ghl("/contacts/upsert", bearer, {
    method: "POST",
    body: JSON.stringify({
      locationId,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email || undefined,
      // Prefer email match. Including phone can update a different contact when
      // the location's duplicate rules prioritize phone.
      phone: opts?.includePhone && phone ? phone : undefined,
      source: "AI Partnership Platform",
      createNewIfDuplicateAllowed: opts?.createNewIfDuplicateAllowed || undefined,
    }),
  });
}

function duplicateContactId(err: unknown): string | null {
  if (!(err instanceof Error)) return null;
  const body = (err as Error & { body?: { meta?: { contactId?: string }; message?: string } }).body;
  const id = body?.meta?.contactId;
  if (id) return id;
  if (/duplicat/i.test(err.message)) return "";
  return null;
}

/**
 * Write a contact so it shows in the subaccount Contacts list.
 * Avoids the common HighLevel trap where upsert updates a soft-deleted
 * duplicate (or a different contact matched by phone) and the LO sees nothing.
 */
export async function upsertContact(locationId: string, contact: GhlContactInput) {
  const bearer = await getLocationToken(locationId);
  const email = (contact.email || "").trim().toLowerCase();
  const phone = contact.phone ? toE164(contact.phone) : "";
  if (!email && !phone) throw new Error("Contact needs an email or phone");

  if (email) {
    const visible = await searchVisibleByEmail(bearer, locationId, email);
    if (visible?.id) {
      await updateContact(bearer, visible.id, {
        firstName: contact.firstName,
        lastName: contact.lastName,
        email,
        phone: phone || undefined,
        source: "AI Partnership Platform",
      });
      await addTags(bearer, visible.id, contact.tags);
      return visible.id;
    }
  }

  try {
    const created = await createContact(bearer, locationId, contact, phone);
    const row = asContact(created);
    if (!row?.id) throw new Error("CRM create did not return a contact id");
    await addTags(bearer, row.id, contact.tags);
    return row.id;
  } catch (err) {
    const ghostId = duplicateContactId(err);
    if (ghostId === null) throw err;

    // Soft-deleted (or otherwise hidden) duplicate still owns the email/phone.
    // Upsert by email only, then attach phone + tags, then confirm it is searchable.
    const upserted = await upsertByEmail(bearer, locationId, contact, phone, {
      includePhone: !email,
      createNewIfDuplicateAllowed: true,
    });
    let row = asContact(upserted);
    if (!row?.id && ghostId) row = { id: ghostId };

    if (!row?.id) throw new Error("Could not recreate a previously deleted contact");

    const existing = await getContact(bearer, row.id);
    if (!existing) {
      // Force a second create/upsert path when the ghost id is not readable.
      const again = await upsertByEmail(bearer, locationId, contact, phone, {
        includePhone: true,
        createNewIfDuplicateAllowed: true,
      });
      row = asContact(again) || row;
    }

    if (phone) {
      try {
        await updateContact(bearer, row.id!, {
          phone,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: email || undefined,
        });
      } catch {
        // Phone may collide with another live contact; email write already landed.
      }
    }
    await addTags(bearer, row.id!, contact.tags);

    if (email) {
      const visible = await searchVisibleByEmail(bearer, locationId, email);
      if (!visible) {
        throw new Error(
          "CRM still has this email on a deleted contact. Restore it under Contacts → ⋮ → Restore, or permanently remove it from trash, then import again.",
        );
      }
      return visible.id!;
    }
    return row.id!;
  }
}
