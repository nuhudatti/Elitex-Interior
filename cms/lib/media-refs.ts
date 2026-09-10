export function findMediaReferences(data: unknown, url: string) {
  const matches: string[] = [];
  const target = url.replace(/\/$/, '');

  function walk(value: unknown, path: string) {
    if (typeof value === 'string') {
      if (value === url || value === target || value.includes(target)) matches.push(path || '(root)');
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        walk(child, path ? `${path}.${key}` : key);
      }
    }
  }

  walk(data, '');
  return [...new Set(matches)];
}
