export default function Page() {
  return (
    <main style={{ fontFamily: 'Georgia, serif', padding: '2rem', maxWidth: 640 }}>
      <h1>Elitex CMS API</h1>
      <p>
        Phase 1 only. The public website is unchanged and still reads{' '}
        <code>content/content.json</code>.
      </p>
      <p>
        <a href="/api/health">/api/health</a> confirms Neon connectivity.
      </p>
    </main>
  );
}
