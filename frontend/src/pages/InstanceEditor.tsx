import { Alert, Button, Input, Message, Modal, Select, Space, Tag, Typography } from '@arco-design/web-react';
import { IconHistory, IconSave, IconSync } from '@arco-design/web-react/icon';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { VariableForm } from '../components/common';
import { ContractPreview } from '../components/preview/ContractPreview';
import { useVariableReplace } from '../hooks/useVariableReplace';
import { useInstanceStore } from '../stores/instance';
import { useTemplateStore } from '../stores/template';
import { useTemplateVersionStore } from '../stores/template-version';
import { useVersionStore } from '../stores/version';
import { ContractStatus, CONTRACT_STATUS_LABELS } from '../types/enums';
import { VariableValues } from '../types/contract-instance';
import { ApplyIssue, validateTemplateApply } from '../utils/template-apply';

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
  const [applyIssues, setApplyIssues] = useState<ApplyIssue[]>([]);
  const [issueModalVisible, setIssueModalVisible] = useState(false);
  const { instances, loadInstances, updateInstance, applyTemplateVersion } = useInstanceStore();
  const { templates, loadTemplates } = useTemplateStore();
  const { templateVersions, loadTemplateVersions } = useTemplateVersionStore();
  const { loadVersions, saveVersion } = useVersionStore();

  useEffect(() => {
    void Promise.all([loadInstances(), loadTemplates(), loadVersions(), loadTemplateVersions()]);
  }, [loadInstances, loadTemplates, loadVersions, loadTemplateVersions]);

  const instance = useMemo(() => instances.find((item) => item.id === id), [id, instances]);
  const template = useMemo(() => templates.find((item) => item.id === instance?.templateId), [instance?.templateId, templates]);

  // 预览与变量表都基于创建/套用时锁定的内容，不跟随模板最新正文变化。
  const lockedSource = useMemo(
    () =>
      instance
        ? {
            contentHtml: instance.lockedContentHtml ?? '',
            variables: Array.isArray(instance.lockedVariables) ? instance.lockedVariables : []
          }
        : undefined,
    [instance]
  );
  const lockedVariables = lockedSource?.variables ?? [];
  const previewHtml = useVariableReplace(lockedSource, values);

  const latestVersion = useMemo(() => {
    if (!instance) {
      return undefined;
    }
    return templateVersions
      .filter((version) => version.templateId === instance.templateId)
      .reduce<typeof templateVersions[number] | undefined>(
        (latest, version) => (!latest || version.versionNo > latest.versionNo ? version : latest),
        undefined
      );
  }, [instance, templateVersions]);
  const hasNewerVersion = Boolean(latestVersion && instance && latestVersion.versionNo > instance.templateVersionNo);

  useEffect(() => {
    if (instance) {
      setValues(instance.variableValues);
      setTitle(instance.title);
      setStatus(instance.status);
    }
  }, [instance]);

  if (!instance) {
    return <div className="empty-state">正在加载合同实例...</div>;
  }

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
    const version = await saveVersion(nextInstance, remark);
    await updateInstance({
      ...nextInstance,
      versionIds: Array.from(new Set([...nextInstance.versionIds, version.id]))
    });
    setRemark('');
    Message.success(`已保存版本 ${version.versionNo}`);
  };

  const applyLatestTemplate = async () => {
    if (!latestVersion) {
      return;
    }
    // 按当前表单中的填写值做校验和快照，未保存的填写也不会丢。
    const currentInstance = { ...instance, variableValues: values, finalHtml: previewHtml };
    const issues = validateTemplateApply(currentInstance, latestVersion);
    if (issues.length) {
      setApplyIssues(issues);
      setIssueModalVisible(true);
      return;
    }

    const next = await applyTemplateVersion(currentInstance, latestVersion);
    setValues(next.variableValues);
    Message.success(`已套用模板 V${latestVersion.versionNo}，原内容已保留为版本快照`);
  };

  return (
    <section className="page-section instance-page">
      <div className="page-heading">
        <div>
          <Typography.Title heading={3}>合同实例编辑</Typography.Title>
          <Typography.Text type="secondary">填写变量后实时生成最终合同 HTML。</Typography.Text>
        </div>
        <Space wrap>
          <Tag color="arcoblue" size="large">
            所用模板版本 V{instance.templateVersionNo}
          </Tag>
          <Button icon={<IconHistory />} onClick={() => navigate(`/instances/${instance.id}/versions`)}>
            版本对比
          </Button>
          <Button icon={<IconSync />} disabled={!hasNewerVersion} onClick={() => void applyLatestTemplate()}>
            套用最新模板
          </Button>
          <Button icon={<IconSave />} onClick={() => void saveInstance()}>
            保存实例
          </Button>
          <Button type="primary" onClick={() => void saveSnapshot()}>
            保存版本
          </Button>
        </Space>
      </div>

      {hasNewerVersion && latestVersion && (
        <Alert
          className="instance-alert"
          type="info"
          showIcon
          content={`源模板已更新至 V${latestVersion.versionNo}，当前实例仍锁定在 V${instance.templateVersionNo}，预览保持原内容。确认无变量冲突后可套用最新模板。`}
        />
      )}
      {!template && (
        <Alert
          className="instance-alert"
          type="warning"
          showIcon
          content="源模板已被删除，本实例已锁定创建时的正文与变量，仍可继续填写、保存和对比版本。"
        />
      )}

      <div className="instance-meta-bar">
        <Input value={title} onChange={setTitle} placeholder="实例标题" />
        <Select value={status} options={statusOptions} onChange={setStatus} />
        <Input value={remark} onChange={setRemark} placeholder="版本备注，例如：客户首轮修改" />
      </div>

      <div className="instance-grid">
        <ContractPreview title={title || instance.title} html={previewHtml} />
        <div className="form-panel">
          <Typography.Title heading={5}>变量填写</Typography.Title>
          <Typography.Text type="secondary">变量定义随实例锁定（模板 V{instance.templateVersionNo}）。</Typography.Text>
          <VariableForm variables={lockedVariables} values={values} onChange={setValues} />
        </div>
      </div>

      <Modal
        title="无法套用最新模板"
        visible={issueModalVisible}
        onCancel={() => setIssueModalVisible(false)}
        footer={
          <Button type="primary" onClick={() => setIssueModalVisible(false)}>
            知道了
          </Button>
        }
      >
        <Typography.Paragraph>新版模板与当前实例的变量填写存在冲突，请先处理后再套用：</Typography.Paragraph>
        <ul className="apply-issue-list">
          {applyIssues.map((issue, index) => (
            <li key={`${issue.variableName}-${index}`}>
              <Typography.Text style={{ fontWeight: 600 }}>{issue.label || issue.variableName}</Typography.Text>
              <Typography.Text type="secondary">{` {{${issue.variableName}}} `}</Typography.Text>
              <span>{issue.reason}</span>
            </li>
          ))}
        </ul>
      </Modal>
    </section>
  );
}
