import { ContractStatus } from './enums';

export type VariableValues = Record<string, string>;

export interface ContractInstance {
  id: string;
  templateId: string;
  /** 创建实例时锁定的模板版本，实例内容以该版本快照为准 */
  templateVersionId: string;
  title: string;
  variableValues: VariableValues;
  finalHtml: string;
  status: ContractStatus;
  versionIds: string[];
  createdAt: string;
  updatedAt: string;
}
