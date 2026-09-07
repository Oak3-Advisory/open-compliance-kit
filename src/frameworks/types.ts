export interface FrameworkSeedControl {
  controlId: string;
  function: string;
  category: string;
  title: string;
  description?: string;
  owner?: string;
  implementationStatus?: 'not_started' | 'planned' | 'implemented' | 'partially_implemented' | 'not_applicable';
  notes?: string;
}
