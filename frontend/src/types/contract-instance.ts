import { ContractStatus } from './enums';
import { TemplateVariable } from './template';

export type VariableValues = Record<string, string>;

export interface ContractInstance {
  id: string;
  templateId: string;
  templateVersionId: string;
  templateVersionNo: number;
  title: string;
  lockedContentHtml: string;
  lockedVariables: TemplateVariable[];
  variableValues: VariableValues;
  finalHtml: string;
  status: ContractStatus;
  versionIds: string[];
  createdAt: string;
  updatedAt: string;
}
