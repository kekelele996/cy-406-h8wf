import { VariableValues } from './contract-instance';

export interface Version {
  id: string;
  contractInstanceId: string;
  versionNo: number;
  contentSnapshot: string;
  variableSnapshot: VariableValues;
  /** 保存该版本时实例所使用的模板版本，便于审计追溯 */
  templateVersionId?: string;
  templateVersionNo?: number;
  createdAt: string;
  remark: string;
}
