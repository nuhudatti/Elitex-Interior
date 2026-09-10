const url = process.env.DATABASE_URL;
if (!url) {
  console.log(JSON.stringify({ ok: false, error: 'DATABASE_URL missing' }));
  process.exit(1);
}

try {
  const parsed = new URL(url);
  const hostIsNeonTech = /\.neon\.tech$/i.test(parsed.hostname);
  const result = {
    ok: hostIsNeonTech,
    hostIsNeonTech,
    protocolIsPostgres: parsed.protocol === 'postgresql:' || parsed.protocol === 'postgres:',
    sslmodeSet: Boolean(parsed.searchParams.get('sslmode')),
    secretValuesPrinted: false,
  };
  console.log(JSON.stringify(result));
  if (!result.ok) process.exit(1);
} catch {
  console.log(JSON.stringify({ ok: false, error: 'DATABASE_URL is not a valid URL' }));
  process.exit(1);
}
