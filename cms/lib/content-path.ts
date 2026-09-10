export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

export function setPath<T>(obj: T, path: string, value: unknown): T {
  const parts = path.split('.');
  const clone = structuredClone(obj) as Record<string, unknown>;
  let cur: Record<string, unknown> = clone;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    const nextKey = parts[i + 1];
    const existing = cur[key];
    if (existing == null || typeof existing !== 'object') {
      cur[key] = /^\d+$/.test(nextKey) ? [] : {};
    }
    cur = cur[key] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
  return clone as T;
}

export function newId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export type CollectionItem = Record<string, unknown> & { id?: string; order?: number; status?: string };

export function listPath(obj: unknown, path: string): CollectionItem[] {
  const value = getPath(obj, path);
  return Array.isArray(value) ? (value as CollectionItem[]) : [];
}
