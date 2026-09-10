export default function Page() {
  return (
    <main style={{ fontFamily: 'Georgia, serif', padding: '2rem', maxWidth: 720 }}>
      <h1>Elitex CMS API</h1>
      <p>
        Phase 2 content service. The public website is unchanged and still reads{' '}
        <code>content/content.json</code>.
      </p>
      <ul>
        <li>
          <a href="/api/health">GET /api/health</a>
        </li>
        <li>
          <a href="/api/content">GET /api/content</a> — published Neon document
        </li>
        <li>
          <a href="/api/media">GET /api/media</a> — media metadata
        </li>
      </ul>
    </main>
  );
}
