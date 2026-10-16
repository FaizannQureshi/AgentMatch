import CryptoJS from "crypto-js";
import type { GhlSession } from "@/lib/types";

interface SsoPayload {
  userId?: string;
  companyId?: string;
  role?: string;
  type?: string;
  activeLocation?: string;
  userName?: string;
  email?: string;
}

export function decryptSso(encrypted: string): GhlSession {
  const key = process.env.GHL_SSO_KEY;
  if (!key) throw new Error("GHL_SSO_KEY is not set");
  const text = CryptoJS.AES.decrypt(encrypted, key).toString(CryptoJS.enc.Utf8);
  if (!text) throw new Error("Could not decrypt the CRM session");
  const data = JSON.parse(text) as SsoPayload;
  if (!data.activeLocation) {
    throw new Error("Open this app from a subaccount, not the agency view");
  }
  const expectedCompany = process.env.GHL_COMPANY_ID;
  if (expectedCompany && data.companyId && data.companyId !== expectedCompany) {
    throw new Error("This CRM account is not part of the agency");
  }
  return {
    locationId: data.activeLocation,
    locationName: "",
    userId: data.userId || "",
    userName: data.userName || "",
    email: data.email || "",
    companyId: data.companyId || "",
  };
}
