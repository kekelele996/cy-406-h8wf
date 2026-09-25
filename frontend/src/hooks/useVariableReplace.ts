import { useMemo } from 'react';
import { TemplateVariable } from '../types/template';
import { VariableValues } from '../types/contract-instance';

export interface TemplateContentSource {
  contentHtml: string;
  variables: TemplateVariable[];
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function replaceVariables(source: TemplateContentSource | undefined, values: VariableValues) {
  if (!source) {
    return '';
  }

  return source.variables.reduce((html, variable) => {
    const actualValue = values[variable.name] || variable.defaultValue || `{{${variable.name}}}`;
    const pattern = new RegExp(`{{\\s*${escapeRegExp(variable.name)}\\s*}}`, 'g');
    return html.replace(pattern, actualValue);
  }, source.contentHtml);
}

export function useVariableReplace(source: TemplateContentSource | undefined, values: VariableValues) {
  return useMemo(() => replaceVariables(source, values), [source, values]);
}
