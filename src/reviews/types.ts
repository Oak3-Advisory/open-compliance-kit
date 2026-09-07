import type { ActionItem } from '../types';

export interface ActionPlanSeed {
  externalId: string;
  title: string;
  description?: string;
  source?: string;
  reference?: string;
  priority?: ActionItem['priority'];
  status?: ActionItem['status'];
  owner?: string;
  dueDate?: string;
}
