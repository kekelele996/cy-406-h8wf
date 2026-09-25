import { TemplateCategory, VariableType } from './enums';

export interface TemplateVariable {
  id: string;
  name: string;
  label: string;
  type: VariableType;
  defaultValue: string;
  required: boolean;
}

export interface Template {
  id: string;
  title: string;
  category: TemplateCategory;
  contentHtml: string;
  variables: TemplateVariable[];
  /** 指向当前生效的模板版本，每次保存正文都会生成新版本并更新该指针 */
  currentVersionId: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
}

/** 渲染合同内容所需的最小结构，Template 与 TemplateVersion 均满足 */
export type TemplateContent = Pick<Template, 'contentHtml' | 'variables'>;

export type TemplateDraft = Omit<Template, 'id' | 'createdAt' | 'updatedAt' | 'currentVersionId'>;
