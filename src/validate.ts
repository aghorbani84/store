// Pure validation helpers — no D1, no I/O. Unit-tested in tests/validation.test.mjs.

export type ShippingMethod = "delivery" | "pickup";

export interface CartItemInput {
  qty: unknown;
  sku: unknown;
}

export interface OrderPayloadInput {
  address: unknown;
  city: unknown;
  items: unknown;
  name: unknown;
  note?: unknown;
  phone: unknown;
  shipping_method: unknown;
}

export interface ValidCartItem {
  qty: number;
  sku: string;
}

export interface ValidOrderPayload {
  address: string;
  city: string;
  items: ValidCartItem[];
  name: string;
  note: string;
  phone: string;
  shipping_method: ShippingMethod;
}

/** Iranian mobile: 09xxxxxxxxx — exactly 11 ASCII digits, starts with 09. */
export function isValidIranianMobile(value: unknown): value is string {
  return typeof value === "string" && /^09\d{9}$/.test(value);
}

export function normalizeMobile(value: string): string {
  // Convert Persian/Arabic-Indic digits to ASCII, strip spaces/dashes.
  const persian = "۰۱۲۳۴۵۶۷۸۹";
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  let out = "";
  for (const ch of value.trim()) {
    const pi = persian.indexOf(ch);
    if (pi >= 0) {
      out += String(pi);
      continue;
    }
    const ai = arabic.indexOf(ch);
    if (ai >= 0) {
      out += String(ai);
      continue;
    }
    if (ch === " " || ch === "-" || ch === "ـ") continue;
    out += ch;
  }
  return out;
}

function isNonEmptyString(value: unknown, maxLen: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLen;
}

function isValidSku(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z0-9-]{3,32}$/.test(value);
}

export function validateCartItems(items: unknown): { errors: string[]; valid: ValidCartItem[] } {
  const errors: string[] = [];
  const valid: ValidCartItem[] = [];
  if (!Array.isArray(items) || items.length === 0) {
    return { errors: ["items must be a non-empty array"], valid };
  }
  if (items.length > 50) {
    errors.push("items must contain at most 50 lines");
    return { errors, valid };
  }
  const seen = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    const raw = items[i] as CartItemInput | null | undefined;
    if (raw === null || typeof raw !== "object") {
      errors.push(`items[${i}] must be an object`);
      continue;
    }
    if (!isValidSku(raw.sku)) {
      errors.push(`items[${i}].sku is invalid`);
      continue;
    }
    if (seen.has(raw.sku)) {
      errors.push(`items[${i}].sku is duplicated`);
      continue;
    }
    seen.add(raw.sku);
    if (
      typeof raw.qty !== "number" ||
      !Number.isInteger(raw.qty) ||
      raw.qty < 1 ||
      raw.qty > 99
    ) {
      errors.push(`items[${i}].qty must be an integer between 1 and 99`);
      continue;
    }
    valid.push({ qty: raw.qty, sku: raw.sku });
  }
  return { errors, valid };
}

/**
 * Validate an order payload. Returns the normalised payload plus a list of
 * human-readable (Persian) error strings. Empty errors = valid.
 */
export function validateOrderPayload(
  body: unknown,
): { errors: string[]; valid: ValidOrderPayload | null } {
  const errors: string[] = [];
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { errors: ["بدنهٔ درخواست باید یک شیء JSON باشد"], valid: null };
  }
  const input = body as OrderPayloadInput;

  if (!isNonEmptyString(input.name, 100)) errors.push("نام باید بین ۱ تا ۱۰۰ نویسه باشد");
  const phone =
    typeof input.phone === "string" ? normalizeMobile(input.phone) : input.phone;
  if (!isValidIranianMobile(phone)) {
    errors.push("شمارهٔ موبایل باید به شکل 09xxxxxxxxx باشد");
  }
  if (!isNonEmptyString(input.city, 60)) errors.push("شهر باید بین ۱ تا ۶۰ نویسه باشد");
  if (!isNonEmptyString(input.address, 500)) errors.push("آدرس باید بین ۱ تا ۵۰۰ نویسه باشد");
  if (input.shipping_method !== "delivery" && input.shipping_method !== "pickup") {
    errors.push("روش ارسال باید delivery یا pickup باشد");
  }
  let note = "";
  if (input.note !== undefined && input.note !== null) {
    if (typeof input.note !== "string" || input.note.length > 500) {
      errors.push("توضیحات باید حداکثر ۵۰۰ نویسه باشد");
    } else {
      note = input.note.trim();
    }
  }

  const items = validateCartItems(input.items);
  errors.push(...items.errors);

  if (errors.length > 0) return { errors, valid: null };
  return {
    errors,
    valid: {
      address: (input.address as string).trim(),
      city: (input.city as string).trim(),
      items: items.valid,
      name: (input.name as string).trim(),
      note,
      phone: phone as string,
      shipping_method: input.shipping_method as ShippingMethod,
    },
  };
}
