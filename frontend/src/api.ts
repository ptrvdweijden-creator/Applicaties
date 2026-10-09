import { storage } from "@/src/utils/storage";

export const API_BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;
const BASE = API_BASE;
export const TOKEN_KEY = "voorraad_auth_token";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  unauthorizedHandler = fn;
}

const FIELD_LABELS: Record<string, string> = {
  article_number: "Artikelnummer",
  description: "Omschrijving",
  category: "Categorie",
  unit: "Eenheid",
  min_stock: "Minimumvoorraad",
  initial_stock: "Beginvoorraad",
  quantity: "Aantal",
  email: "E-mailadres",
  password: "Wachtwoord",
  name: "Naam",
  barcode: "Barcode",
};

function parseDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length) {
    const fields = detail
      .map((d: any) => FIELD_LABELS[d?.loc?.[d.loc.length - 1]] ?? d?.loc?.[d.loc.length - 1])
      .filter(Boolean);
    return `Controleer de invoer: ${[...new Set(fields)].join(", ")}`;
  }
  return "Er is iets misgegaan. Probeer het opnieuw.";
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const token = await storage.secureGet<string | null>(TOKEN_KEY, null);
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: opts.method ?? (opts.form ? "POST" : "GET"),
      headers: {
        // Bij FormData geen Content-Type zetten: de runtime voegt de multipart-boundary toe
        ...(opts.form ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    });
  } catch {
    throw new ApiError("Geen verbinding met de server. Controleer uw internetverbinding.", 0);
  }
  if (!res.ok) {
    let msg = "Er is iets misgegaan. Probeer het opnieuw.";
    try {
      msg = parseDetail((await res.json()).detail);
    } catch {}
    if (res.status === 401 && token) unauthorizedHandler?.();
    throw new ApiError(msg, res.status);
  }
  return res.json();
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Er is iets misgegaan.";
}
