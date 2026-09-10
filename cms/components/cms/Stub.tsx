export default function Stub({ title }: { title: string }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        <p>This screen is authenticated. The editor, media, and publish tools load after auth verification.</p>
      </div>
    </div>
  );
}
