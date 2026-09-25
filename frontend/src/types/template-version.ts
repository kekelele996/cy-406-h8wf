import { TemplateVariable } from './template';

/**
 * 模板版本：每次保存模板正文时生成的不可变快照。
 * 合同实例通过 templateVersionId 锁定到某个版本，
 * 之后模板再修改也只会产生新版本，不影响已锁定的实例。
 */
export interface TemplateVersion {
  id: string;
  templateId: string;
  versionNo: number;
  title: string;
  contentHtml: string;
  variables: TemplateVariable[];
  createdAt: string;
  remark: string;
}
