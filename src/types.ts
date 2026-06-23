/**
 * Core type definitions for Open Compliance Kit.
 * Shared across storage, state, and crypto layers.
 */

export interface StoredBinaryRef {
  projectId: string;
  documentId: string;
  driver: 'opfs' | 'indexeddb-blob' | 'external-folder';
  ref: string;
}

export interface DocumentManifest {
  id: string;
  projectId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;

  storage: {
    driver: 'opfs' | 'indexeddb-blob' | 'external-folder';
    ref: string;
    chunkSizeBytes?: number;
  };

  crypto?: {
    encrypted: boolean;
    version?: number;
    cipher?: 'AES-GCM';
    kdf?: 'PBKDF2-SHA256';
    salt?: string;
    iterations?: number;
    iv?: string;
    chunking?: 'none' | 'fixed-size';
  };

  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  controlIdSettings?: ControlIdSettings;
  storageUsageBytes: number;
  createdAt: string;
  updatedAt: string;
}

export interface ControlIdSettings {
  mode: 'manual' | 'auto';
  prefix: string;
  separator: '-' | '/' | '.';
  padding: number;
  nextSequence: number;
}

export interface OrganizationProfile {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  industry?: string;
  regulatoryFrameworks?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ISmsScope {
  id: string;
  projectId: string;
  scopeStatement: string;
  inclusions?: string[];
  exclusions?: string[];
  locations?: string[];
  businessUnits?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Asset {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  type: 'application' | 'infrastructure' | 'data' | 'process' | 'people' | 'other';
  criticality: 'low' | 'medium' | 'high' | 'critical';
  owner?: string;
  location?: string;
  linkedRiskIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Risk {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  linkedAssetIds?: string[];
  threat?: string;
  vulnerability?: string;
  likelihood: 'low' | 'medium' | 'high' | 'critical';
  impact: 'low' | 'medium' | 'high' | 'critical';
  inherentScore?: number; // 1-25 calculated from likelihood × impact
  residualScore?: number; // 1-25 after controls
  status: 'identified' | 'assessed' | 'treated' | 'closed';
  linkedControlIds?: string[];
  linkedEvidenceIds?: string[];
  treatmentOption?: 'mitigate' | 'accept' | 'avoid' | 'transfer';
  createdAt: string;
  updatedAt: string;
}

export type EvidenceLinkTargetType =
  | 'control'
  | 'risk'
  | 'review'
  | 'policy'
  | 'finding'
  | 'action'
  | 'requirement';

export interface EvidenceLink {
  id: string;
  projectId: string;
  evidenceId: string;
  targetType: EvidenceLinkTargetType;
  targetId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Policy {
  id: string;
  projectId: string;
  policyId?: string;
  title: string;
  description?: string;
  status: 'draft' | 'active' | 'retired';
  linkedEvidenceIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Finding {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  linkedEvidenceIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ActionItem {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: 'open' | 'in_progress' | 'completed' | 'blocked';
  owner?: string;
  dueDate?: string;
  linkedEvidenceIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Control {
  id: string;
  projectId: string;
  controlId?: string; // User-facing identifier (e.g., CTL-001)
  name: string;
  objective: string;
  description?: string;
  frequency: 'manual' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annually' | 'as_needed';
  controlType: 'preventive' | 'detective' | 'corrective';
  owner?: string;
  testMethod: string;
  linkedRiskIds?: string[];
  linkedRequirementIds?: string[];
  linkedEvidenceIds?: string[];
  implementationStatus: 'not_started' | 'planned' | 'implemented' | 'partially_implemented' | 'not_applicable';
  reviewSchedule?: 'monthly' | 'quarterly' | 'semi_annually' | 'annually';
  nextReviewDate?: string; // ISO 8601 date
  effectivenessRating?: 'not_tested' | 'ineffective' | 'partially_effective' | 'effective';
  lastReviewDate?: string; // ISO 8601 date
  lastReviewResult?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ControlReview {
  id: string;
  projectId: string;
  linkedControlId: string;
  reviewType: 'design_review' | 'operational_test' | 'compliance_review';
  scheduledDate?: string; // ISO 8601 date
  actualDate?: string; // ISO 8601 date
  reviewer?: string;
  status: 'scheduled' | 'in_progress' | 'passed' | 'failed' | 'needs_evidence' | 'not_applicable' | 'blocked';
  testPlan?: string;
  linkedEvidenceIds?: string[];
  testResult?: string;
  effectivenessRating: 'not_tested' | 'ineffective' | 'partially_effective' | 'effective';
  observations?: string;
  nextReviewScheduledDate?: string; // ISO 8601 date
  approvedBy?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CryptoEnvelope {
  version: number;
  cipher: 'AES-GCM';
  kdf: 'PBKDF2-SHA256';
  salt: string;
  iv: string;
  iterations: number;
  ciphertext: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
  documentCount: number;
}

export interface ExportPackage {
  version: string;
  appVersion: string;
  timestamp: string;
  project?: Project;
  documents?: DocumentManifest[];
  projectSummary?: ProjectSummary;
  encrypted: boolean;
  crypto?: CryptoEnvelope;
  integrityHash?: string;
}

export interface BrowserCapabilities {
  supportsIndexedDB: boolean;
  supportsWebCrypto: boolean;
  supportsOPFS: boolean;
  supportsFileSystemAccess: boolean;
}

export interface StorageEstimate {
  usage: number;
  quota: number;
  percentUsed: number;
}
