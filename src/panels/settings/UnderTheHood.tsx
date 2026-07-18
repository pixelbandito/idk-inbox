import { externalSources, hasNoServerSources, APP_PERMISSIONS_URL } from '../../lib/transparency/externalSources';

const KIND_LABEL: Record<string, string> = {
  'gmail-label': 'Gmail',
  'apps-script': 'Apps Script',
  'sheet': 'Sheet',
};

/**
 * Where the app's data and logic live, with links to browse them in Google.
 * It's the user's account, so the workings are shown, not hidden.
 */
export function UnderTheHood() {
  const sources = externalSources();
  return (
    <div className="sources">
      <p className="sources__intro">
        It’s your account, so here’s exactly what powers idk-inbox — nothing is hidden.
      </p>

      <ul className="sources__list">
        {sources.map((source) => (
          <li key={source.url} className="sources__item">
            <div className="sources__head">
              <span className="sources__kind" data-kind={source.kind}>
                {KIND_LABEL[source.kind] ?? source.kind}
              </span>
              <span className="sources__name">{source.name}</span>
            </div>
            <p className="sources__desc">{source.description}</p>
            <a className="sources__link" href={source.url} target="_blank" rel="noopener noreferrer">
              Open in Google ↗
            </a>
          </li>
        ))}
      </ul>

      {hasNoServerSources() && (
        <p className="sources__note">
          idk-inbox runs entirely on your device and inside your own Gmail — it uses no
          external servers, Apps Scripts, or spreadsheets. If that ever changes, they’ll
          be listed here.
        </p>
      )}

      <a className="sources__link" href={APP_PERMISSIONS_URL} target="_blank" rel="noopener noreferrer">
        Review what idk-inbox can access ↗
      </a>
    </div>
  );
}
