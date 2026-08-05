import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Footer } from './components/layout/Footer';
import { Header } from './components/layout/Header';
import { ROUTES } from './constants/routes';
import { ArticleConverterPage } from './features/articles/ArticleConverterPage';
import { FileConverterPage } from './features/conversions/FileConverterPage';
import { HomePage } from './features/home/HomePage';
import { OptimizePage } from './features/optimize/OptimizePage';
import { VectorizePage } from './features/vectorize/VectorizePage';
import { getPathForRoute, getRouteFromPathname } from './utils/routing';

const THEME_STORAGE_KEY = 'lotus-docs-theme';
const THEME_MEDIA_QUERY = '(prefers-color-scheme: dark)';
const THEME_COLORS = {
  dark: '#050507',
  light: '#faf8fb',
};

function isTheme(value) {
  return value === 'light' || value === 'dark';
}

function readThemePreference() {
  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(storedTheme) ? storedTheme : null;
  } catch {
    return null;
  }
}

function getSystemTheme() {
  return window.matchMedia?.(THEME_MEDIA_QUERY).matches ? 'dark' : 'light';
}

function getInitialThemeState() {
  const preference = readThemePreference();
  const bootstrappedTheme = document.documentElement.dataset.theme;

  return {
    preference,
    theme: isTheme(bootstrappedTheme)
      ? bootstrappedTheme
      : (preference || getSystemTheme()),
  };
}

function ThemeSwitch({ theme, onToggle }) {
  const [portalTarget, setPortalTarget] = useState(null);
  const title = theme === 'light' ? 'Включить тёмную тему' : 'Включить светлую тему';

  useLayoutEffect(() => {
    const headerInner = document.querySelector('.site-header__inner');
    const navigation = headerInner?.querySelector('.site-header__nav');
    if (!headerInner || !navigation) return undefined;

    const slot = document.createElement('span');
    slot.className = 'theme-switch-slot';
    headerInner.insertBefore(slot, navigation);
    setPortalTarget(slot);

    return () => slot.remove();
  }, []);

  if (!portalTarget) return null;

  return createPortal(
    <button
      type="button"
      className="theme-switch"
      role="switch"
      aria-checked={theme === 'light'}
      title={title}
      onClick={onToggle}
      data-theme-switch=""
    >
      <span className="sr-only">Светлая тема</span>
      <span className="theme-switch__icon" aria-hidden="true">
        {theme === 'light' ? '☼' : '☾'}
      </span>
    </button>,
    portalTarget,
  );
}

function App() {
  const [route, setCurrentRoute] = useState(getRouteFromPathname);
  const [themeState, setThemeState] = useState(getInitialThemeState);
  const mainRef = useRef(null);
  const { preference: themePreference, theme } = themeState;

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    root.style.removeProperty('background-color');
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', THEME_COLORS[theme]);
  }, [theme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.(THEME_MEDIA_QUERY);
    if (!mediaQuery || themePreference) return undefined;

    const applySystemTheme = ({ matches }) => {
      const nextTheme = matches ? 'dark' : 'light';
      setThemeState((current) => (
        current.preference || current.theme === nextTheme
          ? current
          : { ...current, theme: nextTheme }
      ));
    };

    applySystemTheme(mediaQuery);
    mediaQuery.addEventListener('change', applySystemTheme);
    return () => mediaQuery.removeEventListener('change', applySystemTheme);
  }, [themePreference]);

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
      const preference = isTheme(event.newValue) ? event.newValue : null;
      setThemeState({
        preference,
        theme: preference || getSystemTheme(),
      });
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    const onPopState = () => setCurrentRoute(getRouteFromPathname());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // The current tab still switches even when persistence is unavailable.
    }
    setThemeState({ preference: nextTheme, theme: nextTheme });
  };

  const navigate = (event, nextRoute) => {
    if (
      event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
    ) return;

    event.preventDefault();
    const nextPath = getPathForRoute(nextRoute);
    const currentPath = window.location.pathname + window.location.search + window.location.hash;
    if (currentPath !== nextPath) window.history.pushState(null, '', nextPath);
    setCurrentRoute(nextRoute);
  };
  useEffect(() => {
    const title = route === 'home'
      ? 'Lotus Docs — конвертер документов и изображений'
      : (ROUTES.find((item) => item.id === route)?.label || 'Lotus Docs') + ' — Lotus Docs';
    document.title = title;
    window.scrollTo({ top: 0, behavior: 'auto' });
    window.requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }));
  }, [route]);

  return (
    <div className="app">
      <Header route={route} onNavigate={navigate} />
      <ThemeSwitch theme={theme} onToggle={toggleTheme} />
      <main className="app__main" id="main-content" ref={mainRef} tabIndex="-1">
        <div className="app__container">
          <div className="route-view" key={route}>
            {route === 'home' && <HomePage onNavigate={navigate} />}
            {route === 'conversions' && <FileConverterPage />}
            {route === 'optimize' && <OptimizePage />}
            {route === 'vectorize' && <VectorizePage />}
            {route === 'articles' && <ArticleConverterPage />}
          </div>
        </div>
      </main>
      <Footer onNavigate={navigate} />
    </div>
  );
}

export default App;
