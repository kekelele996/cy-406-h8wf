import { create } from 'zustand';
import { instanceDb, templateDb, templateVersionDb } from '../api/db';
import { Template, TemplateDraft } from '../types/template';
import { TemplateVersion } from '../types/template-version';
import { TemplateCategory } from '../types/enums';
import { makeId, nowIso, putRecord } from '../utils/db';
import { seedTemplates, seedTemplateVersions } from '../utils/seed';
import { useTemplateVersionStore } from './templateVersion';

interface TemplateHistory {
  past: Template[];
  future: Template[];
}

interface TemplateState {
  templates: Template[];
  loading: boolean;
  history: TemplateHistory;
  loadTemplates: () => Promise<void>;
  createTemplate: (draft?: Partial<TemplateDraft>) => Promise<Template>;
  updateTemplate: (template: Template, trackHistory?: boolean) => Promise<{ template: Template; version?: TemplateVersion }>;
  deleteTemplate: (id: string) => Promise<void>;
  duplicateTemplate: (id: string) => Promise<Template | undefined>;
  undoTemplateChange: () => Promise<void>;
  redoTemplateChange: () => Promise<void>;
}

const defaultDraft: TemplateDraft = {
  title: '未命名合同模板',
  category: TemplateCategory.Service,
  tags: ['草稿'],
  variables: [],
  contentHtml: '<h2>合同标题</h2><p>在此编辑正文，可使用 {{变量名}} 作为占位符。</p>'
};

function sortTemplates(templates: Template[]) {
  return [...templates].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function upsertTemplate(list: Template[], template: Template) {
  const exists = list.some((item) => item.id === template.id);
  return sortTemplates(exists ? list.map((item) => (item.id === template.id ? template : item)) : [template, ...list]);
}

export const useTemplateStore = create<TemplateState>((set, get) => ({
  templates: [],
  loading: false,
  history: { past: [], future: [] },

  async loadTemplates() {
    set({ loading: true });
    try {
      let templates = await templateDb.list();
      if (!templates.length) {
        await Promise.all([
          ...seedTemplates.map((template) => putRecord('templates', template)),
          ...seedTemplateVersions.map((version) => putRecord('templateVersions', version))
        ]);
        templates = seedTemplates;
      }

      // 兼容旧数据：没有版本指针的模板补建首个版本，保证实例可以锁定
      const versionStore = useTemplateVersionStore.getState();
      templates = await Promise.all(
        templates.map(async (template) => {
          if (template.currentVersionId) {
            return template;
          }
          const version = await versionStore.createVersion(template, '初始版本');
          const next = { ...template, currentVersionId: version.id };
          await templateDb.save(next);
          return next;
        })
      );

      set({ templates: sortTemplates(templates) });
      await useTemplateVersionStore.getState().loadVersions();
    } finally {
      set({ loading: false });
    }
  },

  async createTemplate(draft) {
    const timestamp = nowIso();
    const base: Template = {
      ...defaultDraft,
      ...draft,
      id: makeId('tpl'),
      currentVersionId: '',
      createdAt: timestamp,
      updatedAt: timestamp
    };

    const version = await useTemplateVersionStore.getState().createVersion(base, '初始版本');
    const template = { ...base, currentVersionId: version.id };

    await templateDb.save(template);
    set((state) => ({ templates: upsertTemplate(state.templates, template) }));
    return template;
  },

  async updateTemplate(template, trackHistory = true) {
    const current = get().templates.find((item) => item.id === template.id);
    const currentVersion = template.currentVersionId ? await templateVersionDb.get(template.currentVersionId) : undefined;

    // 只有正文或变量发生变化才生成新的模板版本，纯元数据保存不刷版本号
    const contentChanged =
      !currentVersion ||
      currentVersion.contentHtml !== template.contentHtml ||
      JSON.stringify(currentVersion.variables) !== JSON.stringify(template.variables);

    let version: TemplateVersion | undefined;
    let currentVersionId = template.currentVersionId;
    if (contentChanged) {
      version = await useTemplateVersionStore.getState().createVersion(template);
      currentVersionId = version.id;
    }

    const next = { ...template, currentVersionId, updatedAt: nowIso() };

    await templateDb.save(next);
    set((state) => ({
      templates: upsertTemplate(state.templates, next),
      history:
        trackHistory && current
          ? {
              past: [...state.history.past, current].slice(-50),
              future: []
            }
          : state.history
    }));
    return { template: next, version };
  },

  async deleteTemplate(id) {
    await templateDb.remove(id);
    // 仍有实例引用时保留模板版本，保证历史合同可以回看原内容
    const instances = await instanceDb.list();
    if (!instances.some((instance) => instance.templateId === id)) {
      await useTemplateVersionStore.getState().removeVersionsForTemplate(id);
    }
    set((state) => ({ templates: state.templates.filter((template) => template.id !== id) }));
  },

  async duplicateTemplate(id) {
    const source = get().templates.find((template) => template.id === id);
    if (!source) {
      return undefined;
    }

    return get().createTemplate({
      title: `${source.title} 副本`,
      category: source.category,
      contentHtml: source.contentHtml,
      variables: source.variables.map((variable) => ({ ...variable, id: makeId('var') })),
      tags: [...source.tags, '副本']
    });
  },

  async undoTemplateChange() {
    const { history, templates } = get();
    const previous = history.past[history.past.length - 1];
    if (!previous) {
      return;
    }

    const current = templates.find((template) => template.id === previous.id);
    await templateDb.save(previous);
    set({
      templates: upsertTemplate(templates, previous),
      history: {
        past: history.past.slice(0, -1),
        future: current ? [current, ...history.future].slice(0, 50) : history.future
      }
    });
  },

  async redoTemplateChange() {
    const { history, templates } = get();
    const next = history.future[0];
    if (!next) {
      return;
    }

    const current = templates.find((template) => template.id === next.id);
    await templateDb.save(next);
    set({
      templates: upsertTemplate(templates, next),
      history: {
        past: current ? [...history.past, current].slice(-50) : history.past,
        future: history.future.slice(1)
      }
    });
  }
}));
