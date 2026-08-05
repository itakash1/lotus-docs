import { ROUTES } from '../../constants/routes';
import { cx } from '../../utils/presentation';
import { getPathForRoute } from '../../utils/routing';

export function Header({ route, onNavigate }) {
  return (
    <>
      <a className="skip-link" href="#main-content">К основному содержимому</a>
      <header className="site-header">
        <div className="site-header__inner">
          <a className="site-header__brand" href="/" aria-label="Lotus Docs — главная" onClick={(event) => onNavigate(event, 'home')}>
            <img className="site-header__logo" src="/lotus.svg" alt="" />
            <span>Lotus Docs</span>
          </a>
          <nav className="site-header__nav" aria-label="Основная навигация">
            {ROUTES.map((item) => (
              <a
                className={cx(
                  'site-header__link',
                  item.cta && 'site-header__link--cta',
                  route === item.id && 'site-header__link--active',
                )}
                key={item.id}
                href={getPathForRoute(item.id)}
                onClick={(event) => onNavigate(event, item.id)}
                aria-current={route === item.id ? 'page' : undefined}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </header>
    </>
  );
}
