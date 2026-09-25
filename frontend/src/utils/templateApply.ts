import { VariableValues } from '../types/contract-instance';
import { VARIABLE_TYPE_LABELS, VariableType } from '../types/enums';
import { TemplateVariable } from '../types/template';
import { TemplateVersion } from '../types/template-version';

export type ApplyBlockerKind = 'missing-required' | 'removed-variable' | 'type-mismatch';

export interface ApplyBlocker {
  kind: ApplyBlockerKind;
  name: string;
  label: string;
  detail: string;
}

function isValueCompatible(type: VariableType, value: string) {
  if (type === VariableType.Number || type === VariableType.Currency) {
    return value.trim() !== '' && !Number.isNaN(Number(value));
  }
  if (type === VariableType.Date) {
    return !Number.isNaN(Date.parse(value));
  }
  return true;
}

function variableLabel(variable: TemplateVariable | undefined, fallback: string) {
  return variable?.label || variable?.name || fallback;
}

/**
 * 校验实例当前填写值能否安全套用到新的模板版本。
 * 返回空数组表示可以直接套用；否则每一项都是一个需要处理的变量。
 */
export function validateTemplateApply(
  values: VariableValues,
  currentVersion: TemplateVersion | undefined,
  nextVersion: TemplateVersion
): ApplyBlocker[] {
  const blockers: ApplyBlocker[] = [];
  const nextByName = new Map(nextVersion.variables.map((variable) => [variable.name, variable]));
  const currentByName = new Map((currentVersion?.variables ?? []).map((variable) => [variable.name, variable]));

  // 新版模板中的必填变量必须能取到值（已有填写或默认值）
  for (const variable of nextVersion.variables) {
    if (!variable.required) {
      continue;
    }
    const effectiveValue = values[variable.name] || variable.defaultValue || '';
    if (!String(effectiveValue).trim()) {
      blockers.push({
        kind: 'missing-required',
        name: variable.name,
        label: variableLabel(variable, variable.name),
        detail: '新版模板的必填变量，当前没有填写值也没有默认值'
      });
    }
  }

  // 已有填写必须能在新版模板中对上变量定义
  for (const [name, rawValue] of Object.entries(values)) {
    const value = String(rawValue ?? '');
    if (!value.trim()) {
      continue;
    }
    const nextVariable = nextByName.get(name);
    const currentVariable = currentByName.get(name);
    if (!nextVariable) {
      // 填写值与旧默认值一致时不视为用户数据，允许静默丢弃
      if (value !== (currentVariable?.defaultValue ?? '')) {
        blockers.push({
          kind: 'removed-variable',
          name,
          label: variableLabel(currentVariable, name),
          detail: '新版模板已移除该变量，已有填写将无法保留'
        });
      }
      continue;
    }
    if (currentVariable && nextVariable.type !== currentVariable.type && !isValueCompatible(nextVariable.type, value)) {
      blockers.push({
        kind: 'type-mismatch',
        name,
        label: variableLabel(nextVariable, name),
        detail: `变量类型已变更为「${VARIABLE_TYPE_LABELS[nextVariable.type]}」，已有填写「${value}」不匹配`
      });
    }
  }

  return blockers;
}
