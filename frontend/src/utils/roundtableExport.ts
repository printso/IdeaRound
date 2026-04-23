import type { ConsensusBoardState, JudgeState, RoundtableMessage } from '../hooks/useWorkspace';

type DiscussionMetrics = {
  round: number;
  new_points: number;
  duplicate_rate: number;
  problem_solution_ratio: string;
  conflict_count: number;
  avg_role_duration_ms: number;
  resolved_topics: number;
} | null | undefined;

export type RoundtableExportPayload = {
  fileBaseName: string;
  initialDemand: string;
  expectedResult: string;
  messages: RoundtableMessage[];
  judgeState: JudgeState;
  judgeScore: number;
  judgeReason: string;
  discussionMetrics?: DiscussionMetrics;
  consensusBoard: ConsensusBoardState;
};

const sanitizeFileName = (name: string) =>
  name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').slice(0, 80) || 'roundtable_export';

const triggerDownload = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
};

const buildMarkdownContent = (payload: RoundtableExportPayload) => {
  const lines: string[] = [];
  lines.push('# 圆桌讨论导出');
  lines.push('');
  lines.push(`- 导出时间：${new Date().toLocaleString('zh-CN')}`);
  lines.push(`- 目标达成度：${payload.judgeScore}%`);
  lines.push(`- 裁判结论：${payload.judgeReason || '暂无'}`);
  lines.push('');
  lines.push('## 需求信息');
  lines.push('');
  lines.push(`**原始需求**：${payload.initialDemand || '-'}`);
  lines.push('');
  lines.push(`**期望结果**：${payload.expectedResult || '-'}`);
  lines.push('');

  if (payload.discussionMetrics) {
    lines.push('## 讨论仪表盘');
    lines.push('');
    lines.push(`- 当前轮次：${payload.discussionMetrics.round}`);
    lines.push(`- 新观点数：${payload.discussionMetrics.new_points}`);
    lines.push(`- 重复率：${payload.discussionMetrics.duplicate_rate}%`);
    lines.push(`- 问题:方案：${payload.discussionMetrics.problem_solution_ratio}`);
    lines.push(`- 冲突点：${payload.discussionMetrics.conflict_count}`);
    lines.push(`- 平均角色耗时：${payload.discussionMetrics.avg_role_duration_ms}ms`);
    lines.push(`- 已解议题：${payload.discussionMetrics.resolved_topics}`);
    lines.push('');
  }

  lines.push('## 书记员看板');
  lines.push('');
  lines.push(`**摘要**：${payload.consensusBoard.summary || '暂无'}`);
  lines.push('');
  lines.push('### 当前共识');
  if (payload.consensusBoard.consensus.length === 0) {
    lines.push('- 暂无');
  } else {
    payload.consensusBoard.consensus.forEach((item) => lines.push(`- ${item}`));
  }
  lines.push('');
  lines.push('### 核心争议');
  if (payload.consensusBoard.disputes.length === 0) {
    lines.push('- 暂无');
  } else {
    payload.consensusBoard.disputes.forEach((item) => {
      lines.push(`- ${item.topic || '未命名争议'}`);
      lines.push(`  - 正方：${item.pro || '待补充'}`);
      lines.push(`  - 反方：${item.con || '待补充'}`);
    });
  }
  lines.push('');
  lines.push('## 对话记录');
  lines.push('');
  payload.messages.forEach((msg) => {
    lines.push(`### ${msg.speakerName} · ${msg.createdAt}`);
    lines.push('');
    lines.push(msg.content || (msg.streaming ? '生成中' : ''));
    lines.push('');
  });

  return lines.join('\n');
};

export const exportRoundtableMarkdown = async (payload: RoundtableExportPayload) => {
  const content = buildMarkdownContent(payload);
  triggerDownload(new Blob([content], { type: 'text/markdown;charset=utf-8' }), `${sanitizeFileName(payload.fileBaseName)}.md`);
};

export const exportRoundtableDocx = async (payload: RoundtableExportPayload) => {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: '圆桌讨论导出', heading: HeadingLevel.TITLE }),
        new Paragraph({ children: [new TextRun({ text: `导出时间：${new Date().toLocaleString('zh-CN')}` })] }),
        new Paragraph({ children: [new TextRun({ text: `目标达成度：${payload.judgeScore}%` })] }),
        new Paragraph({ children: [new TextRun({ text: `裁判结论：${payload.judgeReason || '暂无'}` })] }),
        new Paragraph({ text: '需求信息', heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ children: [new TextRun({ text: `原始需求：${payload.initialDemand || '-'}` })] }),
        new Paragraph({ children: [new TextRun({ text: `期望结果：${payload.expectedResult || '-'}` })] }),
        ...(payload.discussionMetrics ? [
          new Paragraph({ text: '讨论仪表盘', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: `当前轮次：${payload.discussionMetrics.round}` }),
          new Paragraph({ text: `新观点数：${payload.discussionMetrics.new_points}` }),
          new Paragraph({ text: `重复率：${payload.discussionMetrics.duplicate_rate}%` }),
          new Paragraph({ text: `问题:方案：${payload.discussionMetrics.problem_solution_ratio}` }),
          new Paragraph({ text: `冲突点：${payload.discussionMetrics.conflict_count}` }),
          new Paragraph({ text: `平均角色耗时：${payload.discussionMetrics.avg_role_duration_ms}ms` }),
          new Paragraph({ text: `已解议题：${payload.discussionMetrics.resolved_topics}` }),
        ] : []),
        new Paragraph({ text: '书记员看板', heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ text: `摘要：${payload.consensusBoard.summary || '暂无'}` }),
        new Paragraph({ text: '当前共识', heading: HeadingLevel.HEADING_2 }),
        ...(payload.consensusBoard.consensus.length > 0
          ? payload.consensusBoard.consensus.map((item) => new Paragraph({ text: item, bullet: { level: 0 } }))
          : [new Paragraph({ text: '暂无' })]),
        new Paragraph({ text: '核心争议', heading: HeadingLevel.HEADING_2 }),
        ...(payload.consensusBoard.disputes.length > 0
          ? payload.consensusBoard.disputes.flatMap((item) => [
              new Paragraph({ text: item.topic || '未命名争议', bullet: { level: 0 } }),
              new Paragraph({ text: `正方：${item.pro || '待补充'}` }),
              new Paragraph({ text: `反方：${item.con || '待补充'}` }),
            ])
          : [new Paragraph({ text: '暂无' })]),
        new Paragraph({ text: '对话记录', heading: HeadingLevel.HEADING_1 }),
        ...payload.messages.flatMap((msg) => [
          new Paragraph({ text: `${msg.speakerName} · ${msg.createdAt}`, heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: msg.content || (msg.streaming ? '生成中' : '') }),
        ]),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, `${sanitizeFileName(payload.fileBaseName)}.docx`);
};

const buildPdfHtml = (payload: RoundtableExportPayload) => {
  const metricsHtml = payload.discussionMetrics ? `
    <div class="grid">
      <div><strong>当前轮次</strong><div>${payload.discussionMetrics.round}</div></div>
      <div><strong>新观点数</strong><div>${payload.discussionMetrics.new_points}</div></div>
      <div><strong>重复率</strong><div>${payload.discussionMetrics.duplicate_rate}%</div></div>
      <div><strong>问题:方案</strong><div>${payload.discussionMetrics.problem_solution_ratio}</div></div>
      <div><strong>冲突点</strong><div>${payload.discussionMetrics.conflict_count}</div></div>
      <div><strong>平均耗时</strong><div>${payload.discussionMetrics.avg_role_duration_ms}ms</div></div>
    </div>
  ` : '';

  const messageHtml = payload.messages.map((msg) => `
    <div class="message">
      <div class="meta">${msg.speakerName} · ${msg.createdAt}</div>
      <div class="content">${(msg.content || (msg.streaming ? '生成中' : '')).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br/>')}</div>
    </div>
  `).join('');

  const disputesHtml = payload.consensusBoard.disputes.length > 0
    ? payload.consensusBoard.disputes.map((item) => `<li><strong>${item.topic || '未命名争议'}</strong><br/>正方：${item.pro || '待补充'}<br/>反方：${item.con || '待补充'}</li>`).join('')
    : '<li>暂无</li>';

  const consensusHtml = payload.consensusBoard.consensus.length > 0
    ? payload.consensusBoard.consensus.map((item) => `<li>${item}</li>`).join('')
    : '<li>暂无</li>';

  return `
    <div style="width: 960px; padding: 32px; font-family: 'Microsoft YaHei', Arial, sans-serif; color: #111827; background: #fff;">
      <h1 style="margin: 0 0 12px;">圆桌讨论导出</h1>
      <p>导出时间：${new Date().toLocaleString('zh-CN')}</p>
      <p>目标达成度：${payload.judgeScore}%</p>
      <p>裁判结论：${payload.judgeReason || '暂无'}</p>
      <h2>需求信息</h2>
      <p><strong>原始需求：</strong>${payload.initialDemand || '-'}</p>
      <p><strong>期望结果：</strong>${payload.expectedResult || '-'}</p>
      <h2>讨论仪表盘</h2>
      ${metricsHtml || '<p>暂无</p>'}
      <h2>书记员看板</h2>
      <p><strong>摘要：</strong>${payload.consensusBoard.summary || '暂无'}</p>
      <h3>当前共识</h3>
      <ul>${consensusHtml}</ul>
      <h3>核心争议</h3>
      <ul>${disputesHtml}</ul>
      <h2>对话记录</h2>
      ${messageHtml}
    </div>
  `;
};

export const exportRoundtablePdf = async (payload: RoundtableExportPayload) => {
  const [{ default: jsPDF }, { toPng }] = await Promise.all([
    import('jspdf'),
    import('html-to-image'),
  ]);
  const wrapper = document.createElement('div');
  wrapper.style.position = 'fixed';
  wrapper.style.left = '-10000px';
  wrapper.style.top = '0';
  wrapper.innerHTML = buildPdfHtml(payload);
  document.body.appendChild(wrapper);

  try {
    const target = wrapper.firstElementChild as HTMLElement;
    const dataUrl = await toPng(target, { pixelRatio: 2, cacheBust: true, backgroundColor: '#ffffff' });
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('加载导出图像失败'));
      img.src = dataUrl;
    });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('初始化 PDF 画布失败');
    }

    const pagePixelHeight = Math.floor(img.width * (pageHeight / pageWidth));
    let renderedHeight = 0;
    let firstPage = true;

    while (renderedHeight < img.height) {
      const sliceHeight = Math.min(pagePixelHeight, img.height - renderedHeight);
      canvas.width = img.width;
      canvas.height = sliceHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, renderedHeight, img.width, sliceHeight, 0, 0, img.width, sliceHeight);
      const sliceData = canvas.toDataURL('image/png');
      const renderHeightMm = (sliceHeight / img.width) * pageWidth;
      if (!firstPage) {
        pdf.addPage();
      }
      pdf.addImage(sliceData, 'PNG', 0, 0, pageWidth, renderHeightMm);
      renderedHeight += sliceHeight;
      firstPage = false;
    }

    pdf.save(`${sanitizeFileName(payload.fileBaseName)}.pdf`);
  } finally {
    document.body.removeChild(wrapper);
  }
};
