import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseContent } from '../lib/content';

async function main() {
  const file = path.resolve(process.cwd(), '..', 'content', 'content.json');
  const raw = JSON.parse(await readFile(file, 'utf8'));
  const parsed = parseContent(raw);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }

  const rejects = [
    parseContent(null),
    parseContent([]),
    parseContent({ schemaVersion: 1 }),
    parseContent({ schemaVersion: 1, site: {} }),
    parseContent({ schemaVersion: 1, site: {}, pages: {}, media: 'nope' }),
  ];
  if (rejects.some((item) => item.ok)) {
    throw new Error('validator accepted invalid content');
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        schemaVersion: parsed.data.schemaVersion,
        keys: Object.keys(parsed.data),
        pageKeys: Object.keys(parsed.data.pages),
        media: Array.isArray(parsed.data.media) ? parsed.data.media.length : 0,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
