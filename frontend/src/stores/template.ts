import { create } from 'zustand';
import { templateDb } from '../api/db';
import { Template, TemplateDraft } from '../types/template';
import { TemplateVersion } from '../types/template-version';
import { TemplateCategory } from '../types/enums';
import { makeId, nowIso, putRecord } from '../utils/db';
import { seedTemplates } from '../utils/seed';
import { useTemplateVersionStore } from './template-version';

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
  updateTemplate: (template: Template, trackHistory?: boolean) => Promise<TemplateVersion>;
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
        await Promise.all(seedTemplates.map((template) => putRecord('templates', template)));
        templates = seedTemplates;
      }
      await useTemplateVersionStore.getState().ensureVersionsForTemplates(templates);
      set({ templates: sortTemplates(templates) });
    } finally {
      set({ loading: false });
    }
  },

  async createTemplate(draft) {
    const timestamp = nowIso();
    const template: Template = {
      ...defaultDraft,
      ...draft,
      id: makeId('tpl'),
      createdAt: timestamp,
      updatedAt: timestamp
    };

    await templateDb.save(template);
    await useTemplateVersionStore.getState().syncVersion(template, '初始版本');
    set((state) => ({ templates: upsertTemplate(state.templates, template) }));
    return template;
  },

  async updateTemplate(template, trackHistory = true) {
    const current = get().templates.find((item) => item.id === template.id);
    const next = { ...template, updatedAt: nowIso() };

    await templateDb.save(next);
    // 正文或变量有变化时生成新的独立模板版本，历史实例仍锁定在旧版本上。
    const version = await useTemplateVersionStore.getState().syncVersion(next);
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
    return version;
  },

  async deleteTemplate(id) {
    await templateDb.remove(id);
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
    await useTemplateVersionStore.getState().syncVersion(previous, '撤销后保存');
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
    await useTemplateVersionStore.getState().syncVersion(next, '重做后保存');
    set({
      templates: upsertTemplate(templates, next),
      history: {
        past: current ? [...history.past, current].slice(-50) : history.past,
        future: history.future.slice(1)
      }
    });
  }
}));
