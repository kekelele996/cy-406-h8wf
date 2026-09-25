import { TemplateVariable } from './template';

export interface TemplateVersion {
  id: string;
  templateId: string;
  versionNo: number;
  contentHtml: string;
  variables: TemplateVariable[];
  createdAt: string;
  remark: string;
}
