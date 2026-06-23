import type { ProjectStore } from '../../state/projectStore';

interface ImportPageOptions {
  projectStore: ProjectStore;
  onImported?: (projectId: string) => void;
  onBack?: () => void;
}

export class ImportPage {
  private container: HTMLElement | null = null;
  private options: ImportPageOptions;

  constructor(options: ImportPageOptions) {
    this.options = options;
  }

  private renderHTML(): string {
    return `
      <div class="page import-page">
        <div class="project-detail-header">
          <button class="btn-back" id="btn-back-projects">Back to Projects</button>
          <div class="project-title">
            <h1>Import Encrypted Backup</h1>
            <p>Restore a .localvault backup into this browser.</p>
          </div>
        </div>

        <div class="tab-pane" style="max-width: 760px; margin: 0 auto;">
          <form id="import-form" class="scope-form">
            <div class="form-group">
              <label for="import-file">Backup File *</label>
              <input id="import-file" name="file" type="file" accept=".localvault,.json,application/octet-stream,application/json" required />
            </div>

            <div class="form-group">
              <label for="import-passphrase">Passphrase *</label>
              <input id="import-passphrase" name="passphrase" type="password" minlength="8" maxlength="255" required />
              <p class="form-hint">Passphrase must match the one used during export.</p>
            </div>

            <div class="form-actions">
              <button type="submit" class="btn btn-primary">Import Backup</button>
            </div>
          </form>
          <p id="import-status" class="text-muted" style="margin-top: 12px;"></p>
        </div>
      </div>
    `;
  }

  private attachEventListeners(): void {
    if (!this.container) return;

    const backBtn = this.container.querySelector('#btn-back-projects');
    backBtn?.addEventListener('click', () => this.options.onBack?.());

    const form = this.container.querySelector('#import-form');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!this.container) return;

      const status = this.container.querySelector('#import-status') as HTMLElement | null;
      const fileInput = this.container.querySelector('#import-file') as HTMLInputElement | null;
      const passphraseInput = this.container.querySelector('#import-passphrase') as HTMLInputElement | null;

      const file = fileInput?.files?.[0];
      const passphrase = (passphraseInput?.value || '').trim();

      if (!file || !passphrase) {
        if (status) {
          status.textContent = 'Select a backup file and enter a passphrase.';
        }
        return;
      }

      try {
        if (status) {
          status.textContent = 'Importing backup...';
        }

        const project = await this.options.projectStore.importProjectBackup(file, passphrase);
        if (status) {
          status.textContent = `Import complete: ${project.name}`;
        }

        this.options.onImported?.(project.id);
      } catch (error) {
        if (status) {
          status.textContent = error instanceof Error ? error.message : 'Import failed';
        }
      }
    });
  }

  async mount(container: HTMLElement): Promise<void> {
    this.container = container;
    const template = document.createElement('template');
    template.innerHTML = this.renderHTML();
    container.appendChild(template.content.cloneNode(true));
    this.attachEventListeners();
  }

  unmount(): void {
    if (this.container) {
      const page = this.container.querySelector('.import-page');
      page?.remove();
      this.container = null;
    }
  }
}