import { ROUTES } from '../constants/routes';

export function getRouteFromPathname() {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
  const route = pathname === '/' ? 'home' : pathname.slice(1);
  return route === 'home' || ROUTES.some((item) => item.id === route) ? route : 'home';
}

export function getPathForRoute(route) {
  return route === 'home' ? '/' : '/' + route;
}
