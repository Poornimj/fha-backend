export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function text(value, name, { required = false, max = 1000 } = {}) {
  const result = String(value ?? "").trim();
  if (required && !result) throw new HttpError(400, `${name} is required.`);
  if (result.length > max) throw new HttpError(400, `${name} is too long.`);
  return result || null;
}

export function email(value, required = true) {
  const result = String(value ?? "").trim().toLowerCase();
  if (!result && !required) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new HttpError(400, "Enter a valid email address.");
  return result;
}

export function integer(value, name, { min = 0, max = 100000, required = false } = {}) {
  if ((value === "" || value == null) && !required) return null;
  const result = Number(value);
  if (!Number.isInteger(result) || result < min || result > max) throw new HttpError(400, `${name} is invalid.`);
  return result;
}

export function uuid(value, name = "ID") {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""))) {
    throw new HttpError(400, `${name} is invalid.`);
  }
  return value;
}
