/**
 * Main app entry point.
 * Bootstraps orchestrator, router, and renders UI.
 */

import { appOrchestrator } from './app/orchestrator'
import { router, type Route } from './app/router'
import {
  renderHomePage,
  renderSettingsPage,
} from './ui/components/pages'
import { ProjectsPage } from './ui/pages/projects-page'
import { ProjectDetailPage } from './ui/pages/project-detail-page'
import { ImportPage } from './ui/pages/import-page'
import './style.css'

// Track currently mounted page for cleanup
let currentPage: any = null;

async function main(): Promise<void> {
  try {
    // Initialize app
    await appOrchestrator.initialize()
    console.log('[App] Initialized')

    // Get DOM root
    const app = document.getElementById('app')
    if (!app) {
      throw new Error('#app container not found')
    }

    // Subscribe to route changes and re-render
    router.subscribe((route: Route) => {
      renderRoute(app, route)
    })

    // Render initial route
    const initialRoute = router.getCurrentRoute()
    renderRoute(app, initialRoute)
  } catch (err) {
    console.error('[App] Fatal error:', err)
    document.body.replaceChildren(renderErrorPage('Application Error', err instanceof Error ? err.message : String(err)))
  }
}

async function renderRoute(app: HTMLElement, route: Route): Promise<void> {
  // Unmount previous page if it exists
  if (currentPage && typeof currentPage.unmount === 'function') {
    currentPage.unmount()
  }

  try {
    const projectStore = appOrchestrator.getProjectStore()

    switch (route.type) {
      case 'home':
        app.innerHTML = ''
        app.appendChild(renderHomePage())
        attachHomeEventListeners()
        currentPage = null
        break

      case 'projects':
        currentPage = new ProjectsPage({
          projectStore,
          onProjectSelected: (projectId) => {
            router.navigate({ type: 'project', projectId })
          },
          onNewProject: (projectId) => {
            router.navigate({ type: 'project', projectId })
          },
        })
        app.innerHTML = ''
        await currentPage.mount(app)
        break

      case 'project':
        currentPage = new ProjectDetailPage({
          projectStore,
          projectId: route.projectId,
          onBack: () => {
            router.navigate({ type: 'projects' })
          },
        })
        app.innerHTML = ''
        await currentPage.mount(app)
        break

      case 'settings':
        app.innerHTML = ''
        app.appendChild(renderSettingsPage())
        currentPage = null
        break

      case 'import':
        currentPage = new ImportPage({
          projectStore,
          onImported: (projectId) => {
            router.navigate({ type: 'project', projectId })
          },
          onBack: () => {
            router.navigate({ type: 'projects' })
          },
        })
        app.innerHTML = ''
        await currentPage.mount(app)
        break

      default:
        app.innerHTML = ''
        app.appendChild(renderHomePage())
        attachHomeEventListeners()
        currentPage = null
    }
  } catch (err) {
    console.error('[renderRoute] Error:', err)
    app.replaceChildren(renderErrorPage('Page Load Error', err instanceof Error ? err.message : String(err), true))
  }
}

function renderErrorPage(title: string, message: string, includeHomeButton = false): HTMLElement {
  const container = document.createElement('div')
  container.className = 'error-page'

  const heading = document.createElement('h1')
  heading.textContent = title

  const messageParagraph = document.createElement('p')
  messageParagraph.textContent = message

  const guidanceParagraph = document.createElement('p')
  guidanceParagraph.textContent = 'Please refresh the page or try a different browser.'

  container.append(heading, messageParagraph, guidanceParagraph)

  if (includeHomeButton) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = 'Return to Home'
    button.addEventListener('click', () => {
      router.navigate({ type: 'home' })
    })
    container.appendChild(button)
  }

  return container
}

function attachHomeEventListeners(): void {
  // Home page buttons
  const btnNewProject = document.getElementById('btn-new-project')
  const btnViewProjects = document.getElementById('btn-view-projects')
  const btnImport = document.getElementById('btn-import')

  btnNewProject?.addEventListener('click', () => {
    router.navigate({ type: 'projects' })
  })

  btnViewProjects?.addEventListener('click', () => {
    router.navigate({ type: 'projects' })
  })

  btnImport?.addEventListener('click', () => {
    router.navigate({ type: 'import' })
  })
}

// Start app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main)
} else {
  main()
}
