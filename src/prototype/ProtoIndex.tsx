import { ROUTES } from './routes';

// The hub landing page: every prototype as a linked card, grouped by concern.

const GROUPS = ['Panel navigation', 'Pull-to-trigger gestures'];

export function ProtoIndex() {
  return (
    <div className="hub">
      <h1 className="hub__title">Interaction prototypes</h1>
      <p className="hub__lede">Isolated sandboxes — no app content. Each opens at its own URL.</p>
      {GROUPS.map((group) => (
        <section key={group} className="hub__group">
          <h2 className="hub__group-title">{group}</h2>
          <div className="hub__list">
            {ROUTES.filter((route) => route.group === group).map((route) => (
              <a key={route.path} className="hub__card" href={`#${route.path}`}>
                <span className="hub__card-title">{route.title}</span>
                <span className="hub__card-blurb">{route.blurb}</span>
              </a>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
