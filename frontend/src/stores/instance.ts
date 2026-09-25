import { create } from 'zustand';
import { instanceDb } from '../api/db';
import { ContractInstance, VariableValues } from '../types/contract-instance';
import { ContractStatus } from '../types/enums';
import { Template, TemplateVariable } from '../types/template';
import { TemplateVersion } from '../types/template-version';
import { getAllRecords, makeId, nowIso, putRecord } from '../utils/db';
import { seedInstances } from '../utils/seed';
import { replaceVariables } from '../hooks/useVariableReplace';
import { buildAppliedVariableValues } from '../utils/template-apply';
import { useTemplateVersionStore } from './template-version';
import { useVersionStore } from './version';

interface InstanceState {
  instances: ContractInstance[];
  loading: boolean;
  loadInstances: () => Promise<void>;
  createFromTemplate: (template: Template) => Promise<ContractInstance>;
  applyTemplateVersion: (instance: ContractInstance, version: TemplateVersion) => Promise<ContractInstance>;
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

function lockToVersion(instance: ContractInstance, version: TemplateVersion): ContractInstance {
  return {
    ...instance,
    templateVersionId: version.id,
    templateVersionNo: version.versionNo,
    lockedContentHtml: version.contentHtml,
    lockedVariables: version.variables.map((variable) => ({ ...variable }))
  };
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

      // 兼容旧数据：未锁定版本的实例按模板当前内容补建锁定快照。
      const templates = await getAllRecords('templates');
      const migrated: ContractInstance[] = [];
      for (const instance of instances) {
        if (instance.templateVersionId && Array.isArray(instance.lockedVariables)) {
          migrated.push(instance);
          continue;
        }
        const template = templates.find((item) => item.id === instance.templateId);
        if (!template) {
          migrated.push(instance);
          continue;
        }
        const version = await useTemplateVersionStore.getState().syncVersion(template, '初始版本');
        const locked = lockToVersion(instance, version);
        await instanceDb.save(locked);
        migrated.push(locked);
      }
      set({ instances: sortInstances(migrated) });
    } finally {
      set({ loading: false });
    }
  },

  async createFromTemplate(template) {
    const timestamp = nowIso();
    // 创建实例时锁定当时的模板版本、正文和变量，之后模板改动不影响本实例。
    const version = await useTemplateVersionStore.getState().syncVersion(template, '初始版本');
    const variableValues = valuesFromVariables(version.variables);
    const instance: ContractInstance = lockToVersion(
      {
        id: makeId('inst'),
        templateId: template.id,
        templateVersionId: '',
        templateVersionNo: 0,
        title: `${template.title} - 合同实例`,
        lockedContentHtml: '',
        lockedVariables: [],
        variableValues,
        finalHtml: replaceVariables(version, variableValues),
        status: ContractStatus.Draft,
        versionIds: [],
        createdAt: timestamp,
        updatedAt: timestamp
      },
      version
    );

    await instanceDb.save(instance);
    set((state) => ({ instances: upsertInstance(state.instances, instance) }));
    return instance;
  },

  // 套用新版模板：先把当前内容存为版本快照，再替换锁定的正文与变量。
  async applyTemplateVersion(instance, version) {
    const snapshot = await useVersionStore.getState().saveVersion(instance, `套用模板 V${version.versionNo} 前自动快照`);
    const variableValues = buildAppliedVariableValues(instance, version);
    const next: ContractInstance = {
      ...lockToVersion(instance, version),
      variableValues,
      finalHtml: replaceVariables(version, variableValues),
      versionIds: Array.from(new Set([...instance.versionIds, snapshot.id]))
    };

    await get().updateInstance(next);
    return next;
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
