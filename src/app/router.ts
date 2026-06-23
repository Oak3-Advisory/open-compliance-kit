/**
 * App router: client-side hash-based routing.
 * Handles navigation without backend.
 */

export type Route =
  | { type: 'home' }
  | { type: 'projects' }
  | { type: 'project'; projectId: string }
  | { type: 'document'; projectId: string; documentId: string }
  | { type: 'settings' }
  | { type: 'import' }
  | { type: 'export'; projectId: string };

type RouteListener = (route: Route) => void;

export class Router {
  private listeners: Set<RouteListener> = new Set();
  private currentRoute: Route = { type: 'home' };

  constructor() {
    window.addEventListener('hashchange', () => this.handleHashChange());
    this.handleHashChange();
  }

  private handleHashChange(): void {
    const hash = window.location.hash.slice(1);
    const route = this.parseHash(hash);
    this.setRoute(route);
  }

  private parseHash(hash: string): Route {
    if (!hash || hash === 'home') return { type: 'home' };
    if (hash === 'projects') return { type: 'projects' };
    if (hash === 'settings') return { type: 'settings' };
    if (hash === 'import') return { type: 'import' };

    // Parse structured routes: project/:id, document/:projectId/:docId, export/:id
    const parts = hash.split('/');

    if (parts[0] === 'project' && parts[1]) {
      return { type: 'project', projectId: parts[1] };
    }

    if (parts[0] === 'document' && parts[1] && parts[2]) {
      return { type: 'document', projectId: parts[1], documentId: parts[2] };
    }

    if (parts[0] === 'export' && parts[1]) {
      return { type: 'export', projectId: parts[1] };
    }

    return { type: 'home' };
  }

  private routeToHash(route: Route): string {
    switch (route.type) {
      case 'home':
        return '';
      case 'projects':
        return 'projects';
      case 'project':
        return `project/${route.projectId}`;
      case 'document':
        return `document/${route.projectId}/${route.documentId}`;
      case 'settings':
        return 'settings';
      case 'import':
        return 'import';
      case 'export':
        return `export/${route.projectId}`;
    }
  }

  getCurrentRoute(): Route {
    return this.currentRoute;
  }

  navigate(route: Route): void {
    const hash = this.routeToHash(route);
    const currentHash = window.location.hash.slice(1);

    // Changing hash triggers hashchange, which will call setRoute once.
    // If target hash is already active, force an immediate update.
    if (currentHash === hash) {
      this.setRoute(route);
      return;
    }

    window.location.hash = hash;
  }

  private setRoute(route: Route): void {
    this.currentRoute = route;
    this.listeners.forEach((listener) => listener(route));
  }

  subscribe(listener: RouteListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const router = new Router();
