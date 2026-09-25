import { create } from 'zustand';
import { templateVersionDb } from '../api/db';
import { Template } from '../types/template';
import { TemplateVersion } from '../types/template-version';
import { makeId, nowIso } from '../utils/db';

interface TemplateVersionState {
  versions: TemplateVersion[];
  loading: boolean;
  loadVersions: () => Promise<void>;
  createVersion: (template: Template, remark?: string) => Promise<TemplateVersion>;
  removeVersionsForTemplate: (templateId: string) => Promise<void>;
}

function sortVersions(versions: TemplateVersion[]) {
  return [...versions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const useTemplateVersionStore = create<TemplateVersionState>((set) => ({
  versions: [],
  loading: false,

  async loadVersions() {
    set({ loading: true });
    try {
      const versions = await templateVersionDb.list();
      set({ versions: sortVersions(versions) });
    } finally {
      set({ loading: false });
    }
  },

  async createVersion(template, remark) {
    // 版本号以数据库为准，避免 store 尚未加载时编号冲突
    const stored = await templateVersionDb.list();
    const nextNo =
      stored.filter((version) => version.templateId === template.id).reduce((max, version) => Math.max(max, version.versionNo), 0) + 1;
    const version: TemplateVersion = {
      id: makeId('tplver'),
      templateId: template.id,
      versionNo: nextNo,
      title: template.title,
      contentHtml: template.contentHtml,
      variables: template.variables.map((variable) => ({ ...variable })),
      createdAt: nowIso(),
      remark: remark ?? `版本 ${nextNo}`
    };

    await templateVersionDb.save(version);
    set((state) => ({ versions: sortVersions([version, ...state.versions.filter((item) => item.id !== version.id)]) }));
    return version;
  },

  async removeVersionsForTemplate(templateId) {
    const stored = await templateVersionDb.list();
    await Promise.all(stored.filter((version) => version.templateId === templateId).map((version) => templateVersionDb.remove(version.id)));
    set((state) => ({ versions: state.versions.filter((version) => version.templateId !== templateId) }));
  }
}));
