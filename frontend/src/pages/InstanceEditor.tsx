import { Alert, Button, Input, Message, Modal, Select, Space, Tag, Typography } from '@arco-design/web-react';
import { IconHistory, IconRefresh, IconSave } from '@arco-design/web-react/icon';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { VariableForm } from '../components/common';
import { ContractPreview } from '../components/preview/ContractPreview';
import { replaceVariables, useVariableReplace } from '../hooks/useVariableReplace';
import { useInstanceStore } from '../stores/instance';
import { useTemplateStore } from '../stores/template';
import { useTemplateVersionStore } from '../stores/templateVersion';
import { useVersionStore } from '../stores/version';
import { ContractStatus, CONTRACT_STATUS_LABELS } from '../types/enums';
import { ContractInstance, VariableValues } from '../types/contract-instance';
import { ApplyBlocker, validateTemplateApply } from '../utils/templateApply';

const statusOptions = Object.values(ContractStatus).map((value) => ({
  label: CONTRACT_STATUS_LABELS[value],
  value
}));

export function InstanceEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [values, setValues] = useState<VariableValues>({});
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState(ContractStatus.Draft);
  const [remark, setRemark] = useState('');
  const [applyVisible, setApplyVisible] = useState(false);
  const [applyBlockers, setApplyBlockers] = useState<ApplyBlocker[]>([]);
  const [extraValues, setExtraValues] = useState<VariableValues>({});
  const [applying, setApplying] = useState(false);
  const { instances, loadInstances, updateInstance } = useInstanceStore();
  const { templates, loadTemplates } = useTemplateStore();
  const { versions: templateVersions, loadVersions: loadTemplateVersions } = useTemplateVersionStore();
  const { loadVersions, saveVersion } = useVersionStore();

  useEffect(() => {
    void Promise.all([loadInstances(), loadTemplates(), loadVersions(), loadTemplateVersions()]);
  }, [loadInstances, loadTemplates, loadVersions, loadTemplateVersions]);

  const instance = useMemo(() => instances.find((item) => item.id === id), [id, instances]);
  const template = useMemo(() => templates.find((item) => item.id === instance?.templateId), [instance?.templateId, templates]);
  const lockedVersion = useMemo(
    () => templateVersions.find((version) => version.id === instance?.templateVersionId),
    [instance?.templateVersionId, templateVersions]
  );
  const latestVersion = useMemo(
    () => templateVersions.find((version) => version.id === template?.currentVersionId),
    [template?.currentVersionId, templateVersions]
  );
  // 实例内容始终以锁定的模板版本为准；旧数据缺少锁定时回退到模板当前内容
  const contentSource = lockedVersion ?? (template ? { contentHtml: template.contentHtml, variables: template.variables } : undefined);
  const previewHtml = useVariableReplace(contentSource, values);

  useEffect(() => {
    if (instance) {
      setValues(instance.variableValues);
      setTitle(instance.title);
      setStatus(instance.status);
    }
  }, [instance]);

  if (!instance || !contentSource) {
    return <div className="empty-state">正在加载合同实例...</div>;
  }

  const hasNewerTemplate = Boolean(template && latestVersion && lockedVersion && latestVersion.id !== lockedVersion.id);
  const conflictBlockers = applyBlockers.filter((blocker) => blocker.kind !== 'missing-required');
  const missingBlockers = applyBlockers.filter((blocker) => blocker.kind === 'missing-required');
  const canApply = conflictBlockers.length === 0 && missingBlockers.every((blocker) => (extraValues[blocker.name] ?? '').trim());

  const buildNextInstance = () => ({
    ...instance,
    title: title || instance.title,
    variableValues: values,
    finalHtml: previewHtml,
    status
  });

  const saveInstance = async () => {
    await updateInstance(buildNextInstance());
    Message.success('合同实例已保存');
  };

  const saveSnapshot = async () => {
    const nextInstance = buildNextInstance();
    await updateInstance(nextInstance);
    const version = await saveVersion(nextInstance, remark, lockedVersion?.versionNo);
    await updateInstance({
      ...nextInstance,
      versionIds: Array.from(new Set([...nextInstance.versionIds, version.id]))
    });
    setRemark('');
    Message.success(`已保存版本 ${version.versionNo}`);
  };

  const startApply = () => {
    if (!latestVersion) {
      return;
    }
    const blockers = validateTemplateApply(values, lockedVersion, latestVersion);
    if (!blockers.length) {
      void applyLatestTemplate({});
      return;
    }
    setApplyBlockers(blockers);
    setExtraValues({});
    setApplyVisible(true);
  };

  const applyLatestTemplate = async (extra: VariableValues) => {
    if (!latestVersion) {
      return;
    }
    setApplying(true);
    try {
      // 只保留新版模板中存在的变量，依次取已有填写、弹窗补充值、默认值
      const merged: VariableValues = {};
      for (const variable of latestVersion.variables) {
        merged[variable.name] = values[variable.name] || extra[variable.name] || variable.defaultValue || '';
      }

      // 套用前先为当前内容留档，原有版本记录全部保留
      const backup = await saveVersion(
        { ...instance, title: title || instance.title, variableValues: values, finalHtml: previewHtml, status },
        `套用模板 v${latestVersion.versionNo} 前自动备份`,
        lockedVersion?.versionNo
      );

      const nextInstance: ContractInstance = {
        ...instance,
        title: title || instance.title,
        status,
        variableValues: merged,
        templateVersionId: latestVersion.id,
        finalHtml: replaceVariables(latestVersion, merged),
        versionIds: Array.from(new Set([...instance.versionIds, backup.id]))
      };
      await updateInstance(nextInstance);
      setApplyVisible(false);
      Message.success(`已套用模板 v${latestVersion.versionNo}，原内容已备份为版本 ${backup.versionNo}`);
    } finally {
      setApplying(false);
    }
  };

  return (
    <section className="page-section instance-page">
      <div className="page-heading">
        <div>
          <Typography.Title heading={3}>合同实例编辑</Typography.Title>
          <Typography.Text type="secondary">实例内容锁定在所选模板版本，填写变量后实时生成最终合同 HTML。</Typography.Text>
        </div>
        <Space wrap>
          {hasNewerTemplate && (
            <Button icon={<IconRefresh />} onClick={startApply}>
              套用最新模板
            </Button>
          )}
          <Button icon={<IconHistory />} onClick={() => navigate(`/instances/${instance.id}/versions`)}>
            版本对比
          </Button>
          <Button icon={<IconSave />} onClick={() => void saveInstance()}>
            保存实例
          </Button>
          <Button type="primary" onClick={() => void saveSnapshot()}>
            保存版本
          </Button>
        </Space>
      </div>

      <div className="instance-version-bar">
        {lockedVersion ? <Tag color="arcoblue">模板版本 v{lockedVersion.versionNo}</Tag> : <Tag>模板版本未知</Tag>}
        {lockedVersion && <span className="muted">内容锁定于 {new Date(lockedVersion.createdAt).toLocaleString()}</span>}
        {!template && <Tag color="red">源模板已删除，实例内容保持锁定</Tag>}
        {template && hasNewerTemplate && <Tag color="orangered">模板已有新版 v{latestVersion?.versionNo}</Tag>}
        {template && !hasNewerTemplate && lockedVersion && <Tag color="green">已是最新模板</Tag>}
      </div>

      <div className="instance-meta-bar">
        <Input value={title} onChange={setTitle} placeholder="实例标题" />
        <Select value={status} options={statusOptions} onChange={setStatus} />
        <Input value={remark} onChange={setRemark} placeholder="版本备注，例如：客户首轮修改" />
      </div>

      <div className="instance-grid">
        <ContractPreview title={title || instance.title} html={previewHtml} />
        <div className="form-panel">
          <Typography.Title heading={5}>变量填写</Typography.Title>
          <VariableForm variables={contentSource.variables} values={values} onChange={setValues} />
        </div>
      </div>

      <Modal
        title="套用最新模板"
        visible={applyVisible}
        onCancel={() => setApplyVisible(false)}
        onOk={() => void applyLatestTemplate(extraValues)}
        okText="确认套用"
        cancelText="取消"
        okButtonProps={{ disabled: !canApply, loading: applying }}
      >
        {conflictBlockers.length > 0 && (
          <Alert
            type="error"
            style={{ marginBottom: 16 }}
            title="以下变量与新版模板对不上，已阻止套用："
            content={
              <ul className="blocker-list">
                {conflictBlockers.map((blocker) => (
                  <li key={`${blocker.kind}-${blocker.name}`}>
                    <b>{blocker.label}</b>
                    <span className="muted">{`（{{${blocker.name}}}）`}</span>：{blocker.detail}
                  </li>
                ))}
              </ul>
            }
          />
        )}
        {missingBlockers.length > 0 && (
          <>
            <Alert type="warning" style={{ marginBottom: 12 }} title="新版模板包含缺少填写值的必填变量，请补充后再套用：" />
            <div className="apply-extra-form">
              {missingBlockers.map((blocker) => (
                <div key={blocker.name} className="apply-extra-item">
                  <span>
                    {blocker.label}
                    <span className="muted">{`（{{${blocker.name}}}）`}</span>
                  </span>
                  <Input
                    value={extraValues[blocker.name] ?? ''}
                    placeholder={`请输入${blocker.label}`}
                    onChange={(value) => setExtraValues((current) => ({ ...current, [blocker.name]: value }))}
                  />
                </div>
              ))}
            </div>
          </>
        )}
        {conflictBlockers.length > 0 ? (
          <Typography.Text type="secondary">请先调整模板或已有填写，解决上述冲突后才能套用。</Typography.Text>
        ) : (
          <Typography.Text type="secondary">确认后将替换实例正文为模板 v{latestVersion?.versionNo}，当前内容会自动备份为一个版本。</Typography.Text>
        )}
      </Modal>
    </section>
  );
}
