/**
 * Centralized state store for Open Compliance Kit.
 * Simple event-based state management.
 */

import type { Project, DocumentManifest } from '../types';

export interface AppState {
  projects: Map<string, Project>;
  documents: Map<string, DocumentManifest>;
  currentProjectId: string | null;
  encryptionEnabled: boolean;
  darkMode: boolean;
}

type StateListener = (state: AppState) => void;

export class Store {
  private state: AppState = {
    projects: new Map(),
    documents: new Map(),
    currentProjectId: null,
    encryptionEnabled: false,
    darkMode: false,
  };

  private listeners: Set<StateListener> = new Set();

  getState(): AppState {
    return this.state;
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener(this.state));
  }

  addProject(project: Project): void {
    this.state.projects.set(project.id, project);
    this.notifyListeners();
  }

  updateProject(project: Project): void {
    this.state.projects.set(project.id, project);
    this.notifyListeners();
  }

  deleteProject(projectId: string): void {
    this.state.projects.delete(projectId);
    // Also remove associated documents
    const toDelete = Array.from(this.state.documents.values())
      .filter((d) => d.projectId === projectId)
      .map((d) => d.id);
    toDelete.forEach((id) => this.state.documents.delete(id));
    this.notifyListeners();
  }

  getProject(projectId: string): Project | undefined {
    return this.state.projects.get(projectId);
  }

  listProjects(): Project[] {
    return Array.from(this.state.projects.values());
  }

  addDocument(document: DocumentManifest): void {
    this.state.documents.set(document.id, document);
    this.notifyListeners();
  }

  updateDocument(document: DocumentManifest): void {
    this.state.documents.set(document.id, document);
    this.notifyListeners();
  }

  deleteDocument(documentId: string): void {
    this.state.documents.delete(documentId);
    this.notifyListeners();
  }

  getDocument(documentId: string): DocumentManifest | undefined {
    return this.state.documents.get(documentId);
  }

  listDocumentsByProject(projectId: string): DocumentManifest[] {
    return Array.from(this.state.documents.values()).filter(
      (d) => d.projectId === projectId
    );
  }

  setCurrentProject(projectId: string | null): void {
    this.state.currentProjectId = projectId;
    this.notifyListeners();
  }

  setEncryptionEnabled(enabled: boolean): void {
    this.state.encryptionEnabled = enabled;
    this.notifyListeners();
  }

  setDarkMode(enabled: boolean): void {
    this.state.darkMode = enabled;
    this.notifyListeners();
  }

  clear(): void {
    this.state = {
      projects: new Map(),
      documents: new Map(),
      currentProjectId: null,
      encryptionEnabled: false,
      darkMode: false,
    };
    this.notifyListeners();
  }
}

// Global singleton store
export const globalStore = new Store();
