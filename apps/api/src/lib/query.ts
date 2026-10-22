import { AppError } from "../middleware/error.js";

interface IntegerQueryOptions {
  name: string;
  defaultValue: number;
  min?: number;
  max: number;
}

export function integerQuery(
  rawValue: string | undefined,
  { name, defaultValue, min = 1, max }: IntegerQueryOptions,
): number {
  if (rawValue === undefined) return defaultValue;
  if (!/^\d+$/.test(rawValue)) {
    throw new AppError("invalid_query", `${name} must be an integer`, 400);
  }
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new AppError("invalid_query", `${name} must be between ${min} and ${max}`, 400);
  }
  return value;
}

export function dateQuery(rawValue: string | undefined, name: string): Date | undefined {
  if (rawValue === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    throw new AppError("invalid_query", `${name} must use YYYY-MM-DD format`, 400);
  }
  const value = new Date(`${rawValue}T00:00:00.000Z`);
  if (Number.isNaN(value.getTime()) || value.toISOString().slice(0, 10) !== rawValue) {
    throw new AppError("invalid_query", `${name} must be a valid date`, 400);
  }
  return value;
}

export function limitQuery(
  rawValue: string | undefined,
  defaultValue: number,
  max: number,
): number {
  if (rawValue === undefined) return defaultValue;
  if (!/^\d+$/.test(rawValue)) {
    throw new AppError("invalid_query", "limit must be a positive integer", 400);
  }
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new AppError("invalid_query", "limit must be a positive integer", 400);
  }
  return Math.min(value, max);
}

export function stringQuery(
  rawValue: string | undefined,
  name: string,
  maxLength = 200,
): string | undefined {
  if (rawValue === undefined) return undefined;
  const value = rawValue.trim();
  if (value.length === 0 || value.length > maxLength) {
    throw new AppError(
      "invalid_query",
      `${name} must contain between 1 and ${maxLength} characters`,
      400,
    );
  }
  return value;
}

export function enumQuery<const T extends readonly string[]>(
  rawValue: string | undefined,
  name: string,
  allowedValues: T,
): T[number] | undefined {
  const value = stringQuery(rawValue, name, 100);
  if (value === undefined) return undefined;
  if (!allowedValues.includes(value)) {
    throw new AppError(
      "invalid_query",
      `${name} must be one of: ${allowedValues.join(", ")}`,
      400,
    );
  }
  return value as T[number];
}

export function booleanQuery(rawValue: string | undefined, name: string): boolean | undefined {
  if (rawValue === undefined) return undefined;
  if (rawValue === "true") return true;
  if (rawValue === "false") return false;
  throw new AppError("invalid_query", `${name} must be true or false`, 400);
}
