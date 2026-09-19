import React from 'react';
import { InterviewRoom, Problem, getRoomStatusConfig, getDifficultyTag, formatTime } from '../types';
import { useInterviewStore, ExecutionHistoryItem } from '../store/interview';

interface CandidateProgressPanelProps {
  room: InterviewRoom | null;
  problem: Problem | null;
  durationLabel: string;
  onRetry: () => void;
  onClose: () => void;
}

const HISTORY_STATUS_CONFIG: Record<
  ExecutionHistoryItem['status'],
  { label: string; color: string; bg: string; border: string; icon: string }
> = {
  running: { label: '运行中', color: '#2196f3', bg: 'rgba(33, 150, 243, 0.1)', border: 'rgba(33, 150, 243, 0.3)', icon: '⏳' },
  pending: { label: '等待中', color: '#ff9800', bg: 'rgba(255, 152, 0, 0.1)', border: 'rgba(255, 152, 0, 0.3)', icon: '◷' },
  success: { label: '通过', color: '#4caf50', bg: 'rgba(76, 175, 80, 0.1)', border: 'rgba(76, 175, 80, 0.3)', icon: '✓' },
  failed: { label: '失败', color: '#f44336', bg: 'rgba(244, 67, 54, 0.1)', border: 'rgba(244, 67, 54, 0.3)', icon: '✗' },
};

const cardStyle: React.CSSProperties = {
  background: '#2a2a2a',
  border: '1px solid #3a3a3a',
  borderRadius: '8px',
  padding: '12px',
};

const retryButtonStyle: React.CSSProperties = {
  padding: '6px 20px',
  background: '#2196f3',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 500,
};

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    fontSize: '12px',
    fontWeight: 600,
    color: '#888',
    letterSpacing: '0.5px',
    marginBottom: '8px',
  }}>
    {children}
  </div>
);

const LatestResultCard: React.FC<{ item: ExecutionHistoryItem }> = ({ item }) => {
  const statusConfig = HISTORY_STATUS_CONFIG[item.status] || HISTORY_STATUS_CONFIG.failed;
  const isRunning = item.status === 'running' || item.status === 'pending';

  return (
    <div style={{ ...cardStyle, border: `1px solid ${statusConfig.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <span style={{
          fontSize: '11px',
          padding: '2px 8px',
          borderRadius: '4px',
          background: item.type === 'submit' ? 'rgba(33, 150, 243, 0.2)' : 'rgba(156, 39, 176, 0.2)',
          color: item.type === 'submit' ? '#64b5f6' : '#ba68c8',
          fontWeight: 700,
        }}>
          {item.type === 'submit' ? '提交' : '运行'}
        </span>
        <span style={{
          fontSize: '11px',
          padding: '2px 8px',
          borderRadius: '4px',
          background: statusConfig.bg,
          color: statusConfig.color,
          fontWeight: 600,
          border: `1px solid ${statusConfig.border}`,
        }}>
          {statusConfig.icon} {statusConfig.label}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#666', fontFamily: 'monospace' }}>
          {formatTime(item.timestamp)}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', fontSize: '12px', color: '#888' }}>
        <span>
          用例 <span style={{ color: statusConfig.color, fontWeight: 700, fontFamily: 'monospace' }}>
            {isRunning ? '---' : `${item.passedCount}/${item.totalCount || '-'}`}
          </span>
        </span>
        {item.runtime !== undefined && !isRunning && (
          <span>⏱ <span style={{ color: '#2196f3', fontWeight: 600, fontFamily: 'monospace' }}>{item.runtime}ms</span></span>
        )}
        {item.memory !== undefined && !isRunning && (
          <span>💾 <span style={{ color: '#9c27b0', fontWeight: 600, fontFamily: 'monospace' }}>{item.memory}MB</span></span>
        )}
        {isRunning && <span style={{ color: statusConfig.color }}>正在执行，请稍候...</span>}
      </div>
      {item.result.error && !isRunning && (
        <div style={{
          marginTop: '10px',
          padding: '8px 10px',
          background: 'rgba(244, 67, 54, 0.08)',
          border: '1px solid rgba(244, 67, 54, 0.2)',
          borderRadius: '4px',
          fontSize: '11px',
          color: '#e57373',
          fontFamily: 'monospace',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          maxHeight: '60px',
          overflowY: 'auto',
        }}>
          {item.result.error}
        </div>
      )}
    </div>
  );
};

export const CandidateProgressPanel: React.FC<CandidateProgressPanelProps> = ({
  room,
  problem,
  durationLabel,
  onRetry,
  onClose,
}) => {
  const { executionHistory } = useInterviewStore();

  const runCount = executionHistory.filter(h => h.type === 'run').length;
  const submitCount = executionHistory.filter(h => h.type === 'submit').length;
  const latest = executionHistory[0] || null;

  const dataReady = Boolean(room && problem);
  const statusConfig = room ? getRoomStatusConfig(room.status) : null;
  const difficultyTag = problem ? getDifficultyTag(problem.difficulty) : null;

  return (
    <div style={{
      padding: '16px',
      width: '300px',
      height: '100%',
      overflowY: 'auto',
      boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 500, color: '#999' }}>
          📊 个人进度概览
        </h4>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#888',
            cursor: 'pointer',
            fontSize: '16px',
            padding: '4px',
            borderRadius: '4px',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#333'; e.currentTarget.style.color = '#fff'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#888'; }}
        >
          ×
        </button>
      </div>

      {!dataReady || !statusConfig || !difficultyTag ? (
        <div style={{
          textAlign: 'center',
          padding: '40px 16px',
          background: '#2a2a2a',
          borderRadius: '8px',
          border: '1px dashed #444',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚠️</div>
          <div style={{ color: '#fff', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
            概览数据加载失败
          </div>
          <div style={{ color: '#888', fontSize: '12px', lineHeight: 1.6, marginBottom: '16px' }}>
            无法获取房间或题目信息
            <br />
            请检查网络连接后重试
          </div>
          <button onClick={onRetry} style={retryButtonStyle}>
            ↻ 重试
          </button>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '16px' }}>
            <SectionTitle>当前题目</SectionTitle>
            <div style={cardStyle}>
              <div style={{
                color: '#fff',
                fontSize: '13px',
                fontWeight: 600,
                lineHeight: 1.4,
                marginBottom: '8px',
                wordBreak: 'break-word',
              }}>
                {problem!.title}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: '11px',
                  padding: '2px 10px',
                  borderRadius: '10px',
                  color: difficultyTag.color,
                  background: difficultyTag.bgColor,
                  fontWeight: 600,
                }}>
                  {difficultyTag.label}
                </span>
                <span style={{ fontSize: '11px', color: '#888' }}>⏱ {problem!.timeLimit}ms</span>
                <span style={{ fontSize: '11px', color: '#888' }}>💾 {problem!.memoryLimit}MB</span>
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <SectionTitle>面试阶段</SectionTitle>
            <div style={{
              ...cardStyle,
              background: statusConfig.bgColor,
              border: `1px solid ${statusConfig.color}40`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: statusConfig.color,
                  flexShrink: 0,
                }} />
                <span style={{ color: statusConfig.color, fontSize: '13px', fontWeight: 600 }}>
                  {statusConfig.icon} {statusConfig.label}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: statusConfig.color, opacity: 0.85, marginTop: '6px' }}>
                {statusConfig.description}
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <SectionTitle>已用时长</SectionTitle>
            <div style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14px' }}>⏱</span>
                <span style={{
                  color: statusConfig.color,
                  fontSize: '14px',
                  fontWeight: 600,
                  fontFamily: 'monospace',
                }}>
                  {durationLabel || '—'}
                </span>
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <SectionTitle>执行情况</SectionTitle>
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ ...cardStyle, flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#ba68c8', fontFamily: 'monospace' }}>
                  {runCount}
                </div>
                <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>▶ 运行次数</div>
              </div>
              <div style={{ ...cardStyle, flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#64b5f6', fontFamily: 'monospace' }}>
                  {submitCount}
                </div>
                <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>✓ 提交次数</div>
              </div>
            </div>
          </div>

          <div>
            <SectionTitle>最近一次结果</SectionTitle>
            {latest ? (
              <LatestResultCard item={latest} />
            ) : (
              <div style={{
                textAlign: 'center',
                padding: '24px 16px',
                background: '#2a2a2a',
                borderRadius: '8px',
                border: '1px dashed #444',
              }}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>📭</div>
                <div style={{ color: '#ccc', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                  暂无运行记录
                </div>
                <div style={{ color: '#888', fontSize: '11px', lineHeight: 1.6, marginBottom: '12px' }}>
                  运行或提交代码后，这里会展示最近一次结果摘要；若数据未及时更新可手动刷新重试
                </div>
                <button onClick={onRetry} style={retryButtonStyle}>
                  ↻ 刷新
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default CandidateProgressPanel;
