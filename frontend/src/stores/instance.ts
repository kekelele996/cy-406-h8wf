import { create } from 'zustand';
import { instanceDb, templateDb, templateVersionDb } from '../api/db';
import { ContractInstance, VariableValues } from '../types/contract-instance';
import { ContractStatus } from '../types/enums';
import { Template, TemplateVariable } from '../types/template';
import { makeId, nowIso, putRecord } from '../utils/db';
import { seedInstances } from '../utils/seed';
import { replaceVariables } from '../hooks/useVariableReplace';

interface InstanceState {
  instances: ContractInstance[];
  loading: boolean;
  loadInstances: () => Promise<void>;
  createFromTemplate: (template: Template) => Promise<ContractInstance>;
  updateInstance: (instance: ContractInstance) => Promise<void>;
  deleteInstance: (id: string) => Promise<void>;
  setInstanceStatus: (id: string, status: ContractStatus) => Promise<void>;
}

function sortInstances(instances: ContractInstance[]) {
  return [...instances].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function upsertInstance(list: ContractInstance[], instance: ContractInstance) {
  const exists = list.some((item) => item.id === instance.id);
  return sortInstances(exists ? list.map((item) => (item.id === instance.id ? instance : item)) : [instance, ...list]);
}

function valuesFromVariables(variables: TemplateVariable[]): VariableValues {
  return variables.reduce<VariableValues>((acc, variable) => {
    acc[variable.name] = variable.defaultValue;
    return acc;
  }, {});
}

export const useInstanceStore = create<InstanceState>((set, get) => ({
  instances: [],
  loading: false,

  async loadInstances() {
    set({ loading: true });
    try {
      let instances = await instanceDb.list();
      if (!instances.length && seedInstances.length) {
        await Promise.all(seedInstances.map((instance) => putRecord('instances', instance)));
        instances = seedInstances;
      }

      // 兼容旧数据：没有锁定模板版本的实例固定到模板当前版本
      instances = await Promise.all(
        instances.map(async (instance) => {
          if (instance.templateVersionId) {
            return instance;
          }
          const template = await templateDb.get(instance.templateId);
          if (!template?.currentVersionId) {
            return instance;
          }
          const next = { ...instance, templateVersionId: template.currentVersionId };
          await instanceDb.save(next);
          return next;
        })
      );

      set({ instances: sortInstances(instances) });
    } finally {
      set({ loading: false });
    }
  },

  async createFromTemplate(template) {
    const timestamp = nowIso();
    // 创建实例时锁定模板当前版本的正文和变量，之后模板改动不影响本实例
    const lockedVersion = template.currentVersionId ? await templateVersionDb.get(template.currentVersionId) : undefined;
    const source = lockedVersion ?? template;
    const variableValues = valuesFromVariables(source.variables);
    const instance: ContractInstance = {
      id: makeId('inst'),
      templateId: template.id,
      templateVersionId: lockedVersion?.id ?? '',
      title: `${template.title} - 合同实例`,
      variableValues,
      finalHtml: replaceVariables(source, variableValues),
      status: ContractStatus.Draft,
      versionIds: [],
      createdAt: timestamp,
      updatedAt: timestamp
    };

    await instanceDb.save(instance);
    set((state) => ({ instances: upsertInstance(state.instances, instance) }));
    return instance;
  },

  async updateInstance(instance) {
    const next = { ...instance, updatedAt: nowIso() };
    await instanceDb.save(next);
    set((state) => ({ instances: upsertInstance(state.instances, next) }));
  },

  async deleteInstance(id) {
    await instanceDb.remove(id);
    set((state) => ({ instances: state.instances.filter((instance) => instance.id !== id) }));
  },

  async setInstanceStatus(id, status) {
    const instance = get().instances.find((item) => item.id === id);
    if (!instance) {
      return;
    }

    await get().updateInstance({ ...instance, status });
  }
}));
