import { useEffect, useRef, useState } from 'react';
import { WelcomeIntro } from './components/layout/WelcomeIntro';
import { Footer } from './components/layout/Footer';
import { Header } from './components/layout/Header';
import { updateSeo } from './utils/seo';
import { ArticleConverterPage } from './features/articles/ArticleConverterPage';
import { FileConverterPage } from './features/conversions/FileConverterPage';
import { HomePage } from './features/home/HomePage';
import { OptimizePage } from './features/optimize/OptimizePage';
import { VectorizePage } from './features/vectorize/VectorizePage';
import { getPathForRoute, getRouteFromPathname } from './utils/routing';

function App({ initialRoute }) {
  const [route, setCurrentRoute] = useState(() => initialRoute || getRouteFromPathname());
  const mainRef = useRef(null);
  useEffect(() => {
    const onPopState = () => setCurrentRoute(getRouteFromPathname());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

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
    updateSeo(route);
    window.scrollTo({ top: 0, behavior: 'auto' });
    window.requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }));
  }, [route]);

  return (
    <div className="app">
      <Header route={route} onNavigate={navigate} />
      <WelcomeIntro />
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
