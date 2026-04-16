export function normalizeQuery(value: string): string {
  return value.trim().toLowerCase();
}

export function hasQuery(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function wildcard(value: string): string {
  return `%${normalizeQuery(value)}%`;
}
