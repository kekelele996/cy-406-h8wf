import { create } from 'zustand';
import { templateVersionDb } from '../api/db';
import { Template } from '../types/template';
import { TemplateVersion } from '../types/template-version';
import { makeId, nowIso } from '../utils/db';

interface TemplateVersionState {
  templateVersions: TemplateVersion[];
  loading: boolean;
  loadTemplateVersions: () => Promise<void>;
  syncVersion: (template: Template, remark?: string) => Promise<TemplateVersion>;
  ensureVersionsForTemplates: (templates: Template[]) => Promise<void>;
  getLatestVersion: (templateId: string) => TemplateVersion | undefined;
}

function sortTemplateVersions(versions: TemplateVersion[]) {
  return [...versions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function pickLatest(versions: TemplateVersion[], templateId: string) {
  return versions
    .filter((version) => version.templateId === templateId)
    .reduce<TemplateVersion | undefined>(
      (latest, version) => (!latest || version.versionNo > latest.versionNo ? version : latest),
      undefined
    );
}

function sameContent(version: TemplateVersion, template: Template) {
  return version.contentHtml === template.contentHtml && JSON.stringify(version.variables) === JSON.stringify(template.variables);
}

export const useTemplateVersionStore = create<TemplateVersionState>((set, get) => ({
  templateVersions: [],
  loading: false,

  async loadTemplateVersions() {
    set({ loading: true });
    try {
      const versions = await templateVersionDb.list();
      set({ templateVersions: sortTemplateVersions(versions) });
    } finally {
      set({ loading: false });
    }
  },

  // 返回与模板当前内容一致的最新版本；内容有变化（或还没有版本）时生成新的独立版本。
  async syncVersion(template, remark) {
    const all = await templateVersionDb.list();
    const latest = pickLatest(all, template.id);
    if (latest && sameContent(latest, template)) {
      return latest;
    }

    const versionNo = (latest?.versionNo ?? 0) + 1;
    const version: TemplateVersion = {
      id: makeId('tplver'),
      templateId: template.id,
      versionNo,
      contentHtml: template.contentHtml,
      variables: template.variables.map((variable) => ({ ...variable })),
      createdAt: nowIso(),
      remark: remark || `版本 ${versionNo}`
    };

    await templateVersionDb.save(version);
    set((state) => ({
      templateVersions: sortTemplateVersions([version, ...state.templateVersions.filter((item) => item.id !== version.id)])
    }));
    return version;
  },

  // 兼容旧数据：为还没有任何版本的模板补建 V1。
  async ensureVersionsForTemplates(templates) {
    const all = await templateVersionDb.list();
    const versionedTemplateIds = new Set(all.map((version) => version.templateId));
    for (const template of templates) {
      if (!versionedTemplateIds.has(template.id)) {
        await get().syncVersion(template, '初始版本');
      }
    }
  },

  getLatestVersion(templateId) {
    return pickLatest(get().templateVersions, templateId);
  }
}));
