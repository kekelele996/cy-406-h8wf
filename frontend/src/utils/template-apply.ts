import { ContractInstance, VariableValues } from '../types/contract-instance';
import { VARIABLE_TYPE_LABELS, VariableType } from '../types/enums';
import { TemplateVersion } from '../types/template-version';

export interface ApplyIssue {
  variableName: string;
  label: string;
  reason: string;
}

function hasText(value: string | undefined) {
  return Boolean(value && value.trim());
}

function isValueCompatible(value: string, type: VariableType) {
  if (!hasText(value)) {
    return true;
  }
  if (type === VariableType.Number || type === VariableType.Currency) {
    return !Number.isNaN(Number(value));
  }
  if (type === VariableType.Date) {
    return !Number.isNaN(Date.parse(value));
  }
  return true;
}

// 套用新版模板前的校验：任一问题都会阻止切换，并列出具体变量。
export function validateTemplateApply(instance: ContractInstance, nextVersion: TemplateVersion): ApplyIssue[] {
  const issues: ApplyIssue[] = [];
  const nextByName = new Map(nextVersion.variables.map((variable) => [variable.name, variable]));
  const currentVariables = Array.isArray(instance.lockedVariables) ? instance.lockedVariables : [];
  const currentByName = new Map(currentVariables.map((variable) => [variable.name, variable]));

  for (const variable of currentVariables) {
    const nextVariable = nextByName.get(variable.name);
    const filledValue = instance.variableValues[variable.name];

    if (!nextVariable) {
      if (variable.required) {
        issues.push({
          variableName: variable.name,
          label: variable.label,
          reason: '新版模板缺少该必填变量'
        });
      } else if (hasText(filledValue)) {
        issues.push({
          variableName: variable.name,
          label: variable.label,
          reason: '新版模板已移除该变量，已填写内容将丢失'
        });
      }
      continue;
    }

    if (hasText(filledValue) && !isValueCompatible(filledValue, nextVariable.type)) {
      issues.push({
        variableName: variable.name,
        label: variable.label,
        reason: `已填写值「${filledValue}」与新版变量类型「${VARIABLE_TYPE_LABELS[nextVariable.type]}」不匹配`
      });
    }
  }

  for (const variable of nextVersion.variables) {
    if (!variable.required) {
      continue;
    }
    const previous = currentByName.get(variable.name);
    const newlyRequired = !previous || !previous.required;
    if (newlyRequired && !hasText(instance.variableValues[variable.name]) && !hasText(variable.defaultValue)) {
      issues.push({
        variableName: variable.name,
        label: variable.label,
        reason: '新版新增的必填变量，当前实例未填写且模板未提供默认值'
      });
    }
  }

  return issues;
}

// 校验通过后合并变量值：保留已有填写，其余使用新版默认值。
export function buildAppliedVariableValues(instance: ContractInstance, nextVersion: TemplateVersion): VariableValues {
  return nextVersion.variables.reduce<VariableValues>((acc, variable) => {
    const existing = instance.variableValues[variable.name];
    acc[variable.name] = hasText(existing) ? existing : variable.defaultValue;
    return acc;
  }, {});
}
