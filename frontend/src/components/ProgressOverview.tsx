import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getRoomById, getRoomParticipants } from '../services/interviewRoomService';
import { getProblemById } from '../services/problemService';
import { useInterviewStore } from '../store/interview';
import {
  InterviewRoom,
  getRoomStatusConfig,
  getDifficultyTag,
  getLanguageConfig,
  formatDuration,
  formatTime,
} from '../types';

interface ProgressOverviewProps {
  open: boolean;
  onClose: () => void;
  isNarrow: boolean;
}

const PANEL_WIDTH = 300;

type LoadState = 'loading' | 'ready' | 'error';

/** 计算当前阶段对应的已用时长（与主区域顶部逻辑保持一致） */
function getStageDuration(room: InterviewRoom): string {
  if (room.status === 'WAITING') {
    return formatDuration(room.createdAt);
  }
  if (room.status === 'ACTIVE' && room.startedAt) {
    return formatDuration(room.startedAt);
  }
  if (room.status === 'COMPLETED' && room.startedAt && room.endedAt) {
    return formatDuration(room.startedAt, room.endedAt);
  }
  return '--';
}

const getRelativeTime = (dateString: string) => {
  const diff = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
};

const StatCard: React.FC<{
  icon: string;
  label: string;
  value: React.ReactNode;
  accent: string;
  hint?: string;
}> = ({ icon, label, value, accent, hint }) => (
  <div style={{
    flex: 1,
    minWidth: 0,
    padding: '10px 12px',
    background: '#1e1e1e',
    border: '1px solid #333',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#888' }}>
      <span>{icon}</span>
      <span>{label}</span>
    </div>
    <div style={{ fontSize: '18px', fontWeight: 700, color: accent, fontFamily: 'monospace', lineHeight: 1.1 }}>
      {value}
    </div>
    {hint && <div style={{ fontSize: '10px', color: '#666', lineHeight: 1.3 }}>{hint}</div>}
  </div>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h4 style={{
    margin: '0 0 8px',
    fontSize: '11px',
    fontWeight: 600,
    color: '#666',
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
  }}>{children}</h4>
);

/**
 * 候选人个人进度概览：
 * - 集中展示当前题目、面试阶段、已用时长、运行/提交次数及最近一次结果摘要
 * - 与主区域共用同一份 store 数据，面试官切换状态或从历史返回后概览自动与主区一致
 * - 加载失败 / 无运行记录时给出可重试说明
 * - 窄屏下以浮层形式覆盖在侧栏之上（带背景遮罩），不遮挡代码与题目
 */
export const ProgressOverview: React.FC<ProgressOverviewProps> = ({ open, onClose, isNarrow }) => {
  const currentRoom = useInterviewStore((s) => s.currentRoom);
  const currentProblem = useInterviewStore((s) => s.currentProblem);
  const executionHistory = useInterviewStore((s) => s.executionHistory);
  const isRunning = useInterviewStore((s) => s.isRunning);
  const isSubmitting = useInterviewStore((s) => s.isSubmitting);
  const roomId = currentRoom?.id;
  const setCurrentRoom = useInterviewStore((s) => s.setCurrentRoom);
  const setParticipants = useInterviewStore((s) => s.setParticipants);
  const setProblem = useInterviewStore((s) => s.setProblem);

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [now, setNow] = useState(Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);

  // 概览独立拉取数据，失败时可重试；与主区域写入同一个 store，保证概览与主区一致
  const reload = useCallback(async (silent = false) => {
    if (!roomId) {
      setLoadState('error');
      return;
    }
    if (!silent) setLoadState('loading');
    else setRefreshing(true);
    try {
      const room = await getRoomById(roomId);
      if (!mountedRef.current) return;
      setCurrentRoom(room);
      if (room.problemId) {
        try {
          const problem = await getProblemById(room.problemId);
          if (mountedRef.current) setProblem(problem);
        } catch (error) {
          // 题目摘要加载失败不影响整体概览，主区域同样会自行重试
          console.error('Failed to fetch problem for overview:', error);
        }
      }
      try {
        const participants = await getRoomParticipants(roomId);
        if (mountedRef.current) setParticipants(participants);
      } catch (error) {
        console.error('Failed to fetch participants for overview:', error);
      }
      if (mountedRef.current) setLoadState('ready');
    } catch (error) {
      console.error('Failed to load progress overview:', error);
      if (mountedRef.current) setLoadState('error');
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }, [roomId, setCurrentRoom, setParticipants, setProblem]);

  // 打开时确保数据最新（从历史返回时 store 可能保留旧状态）
  useEffect(() => {
    mountedRef.current = true;
    if (open) {
      reload(currentRoom ? true : false);
    }
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, roomId]);

  // 等待中 / 进行中阶段每秒刷新已用时长
  useEffect(() => {
    if (!open || !currentRoom) return;
    if (currentRoom.status !== 'WAITING' && currentRoom.status !== 'ACTIVE') return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open, currentRoom?.status]);

  // 执行中的运行/提交完成后，重渲染以刷新次数与摘要（store 更新会触发渲染，这里仅兜底计时文案）
  useEffect(() => {
    if (isRunning || isSubmitting) {
      const timer = window.setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(timer);
    }
  }, [isRunning, isSubmitting]);

  const stats = useMemo(() => {
    const runs = executionHistory.filter((h) => h.type === 'run');
    const submissions = executionHistory.filter((h) => h.type === 'submit');
    const finished = (list: typeof executionHistory) => list.filter((h) => h.status === 'success' || h.status === 'failed');
    return {
      runCount: runs.length,
      runFinished: finished(runs).length,
      submitCount: submissions.length,
      submitFinished: finished(submissions).length,
      latest: executionHistory[0] || null,
    };
  }, [executionHistory]);

  if (!open) return null;

  const statusConfig = currentRoom ? getRoomStatusConfig(currentRoom.status) : null;
  const difficulty = currentProblem ? getDifficultyTag(currentProblem.difficulty) : null;
  const langConfig = stats.latest ? getLanguageConfig(stats.latest.language) : null;
  // now 仅用于驱动秒级计时
  void now;

  const renderLoading = () => (
    <div style={{ padding: '32px 16px', textAlign: 'center', color: '#888', fontSize: '13px' }}>
      <div className="progress-overview-spinner" style={{
        width: '24px', height: '24px',
        border: '3px solid #333',
        borderTopColor: '#2196f3',
        borderRadius: '50%',
        margin: '0 auto 12px',
      }} />
      正在加载个人进度...
    </div>
  );

  const renderError = () => (
    <div style={{
      margin: '12px 14px',
      padding: '18px 14px',
      background: 'rgba(244, 67, 54, 0.08)',
      border: '1px solid rgba(244, 67, 54, 0.3)',
      borderRadius: '8px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '28px', marginBottom: '8px' }}>📡</div>
      <div style={{ color: '#f44336', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
        进度数据加载失败
      </div>
      <div style={{ color: '#888', fontSize: '11px', lineHeight: 1.6, marginBottom: '14px' }}>
        网络连接可能不稳定，请检查网络后重试。
        <br />
        主区域不受影响，可继续作答。
      </div>
      <button
        onClick={() => reload()}
        style={{
          padding: '7px 20px',
          background: '#2196f3',
          color: '#fff',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 600,
        }}
      >
        重新加载
      </button>
    </div>
  );

  const renderLatestResult = () => {
    const latest = stats.latest;
    if (!latest) {
      return (
        <div style={{
          padding: '18px 14px',
          background: '#1e1e1e',
          border: '1px dashed #444',
          borderRadius: '8px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '26px', marginBottom: '8px' }}>🗒️</div>
          <div style={{ color: '#aaa', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
            暂无运行记录
          </div>
          <div style={{ color: '#777', fontSize: '11px', lineHeight: 1.6, marginBottom: '12px' }}>
            在编辑器中点击「运行」或「提交」后，
            <br />
            这里会展示最近一次结果摘要。
          </div>
          <button
            onClick={() => reload(true)}
            disabled={refreshing}
            style={{
              padding: '6px 16px',
              background: 'transparent',
              color: refreshing ? '#666' : '#2196f3',
              border: '1px solid ' + (refreshing ? '#444' : '#2196f3'),
              borderRadius: '6px',
              cursor: refreshing ? 'not-allowed' : 'pointer',
              fontSize: '11px',
              fontWeight: 500,
            }}
          >
            {refreshing ? '刷新中...' : '↻ 刷新记录'}
          </button>
        </div>
      );
    }

    const inProgress = latest.status === 'running' || latest.status === 'pending';
    const isSuccess = latest.status === 'success';
    const accent = inProgress ? '#2196f3' : isSuccess ? '#4caf50' : '#f44336';
    const bg = inProgress ? 'rgba(33, 150, 243, 0.08)' : isSuccess ? 'rgba(76, 175, 80, 0.08)' : 'rgba(244, 67, 54, 0.08)';
    const border = inProgress ? 'rgba(33, 150, 243, 0.3)' : isSuccess ? 'rgba(76, 175, 80, 0.3)' : 'rgba(244, 67, 54, 0.3)';
    const label = inProgress
      ? (latest.type === 'submit' ? '提交进行中' : '运行进行中')
      : `${latest.type === 'submit' ? '提交' : '运行'}${isSuccess ? '通过' : '失败'}`;

    const summaryText = latest.result.error
      ? latest.result.error
      : latest.result.output || '';

    return (
      <div style={{
        padding: '12px',
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: '8px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {inProgress ? (
              <div className="progress-overview-spinner" style={{
                width: '14px', height: '14px',
                border: '2px solid rgba(33,150,243,0.3)',
                borderTopColor: '#2196f3',
                borderRadius: '50%',
              }} />
            ) : (
              <span style={{ fontSize: '14px' }}>{isSuccess ? '✅' : '❌'}</span>
            )}
            <span style={{ color: accent, fontSize: '12px', fontWeight: 700 }}>{label}</span>
          </div>
          <span style={{ color: '#777', fontSize: '10px', whiteSpace: 'nowrap' }}>
            {getRelativeTime(latest.timestamp)}
          </span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', fontSize: '11px', marginBottom: '8px' }}>
          {latest.totalCount > 0 ? (
            <span style={{ color: '#ccc' }}>
              用例 <span style={{ color: accent, fontFamily: 'monospace', fontWeight: 700 }}>
                {latest.passedCount}/{latest.totalCount}
              </span>
            </span>
          ) : !inProgress ? (
            <span style={{ color: '#888' }}>无测试用例</span>
          ) : null}
          {latest.runtime !== undefined && (
            <span style={{ color: '#64b5f6', fontFamily: 'monospace' }}>⏱ {latest.runtime}ms</span>
          )}
          {latest.memory !== undefined && (
            <span style={{ color: '#ce93d8', fontFamily: 'monospace' }}>💾 {latest.memory}MB</span>
          )}
          {langConfig && (
            <span style={{ color: langConfig.color, fontFamily: 'monospace' }}>{langConfig.label}</span>
          )}
        </div>

        {!inProgress && summaryText && (
          <pre style={{
            margin: 0,
            padding: '8px 10px',
            background: 'rgba(0, 0, 0, 0.3)',
            borderRadius: '6px',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            fontSize: '11px',
            lineHeight: 1.5,
            color: isSuccess ? '#9cdcfe' : '#f48fb1',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: '72px',
            overflow: 'hidden',
            position: 'relative',
          }}>
            {summaryText.length > 160 ? summaryText.slice(0, 160) + '…' : summaryText}
          </pre>
        )}

        <div style={{ marginTop: '8px', fontSize: '10px', color: '#666' }}>
          {formatTime(latest.timestamp)} · 完整结果见编辑器下方详情
        </div>
      </div>
    );
  };

  const panel = (
    <div style={{
      width: isNarrow ? Math.min(PANEL_WIDTH + 40, window.innerWidth - 32) : PANEL_WIDTH,
      maxWidth: 'calc(100vw - 56px)',
      height: '100%',
      background: '#1a1a1a',
      borderLeft: isNarrow ? 'none' : '1px solid #333',
      display: 'flex',
      flexDirection: 'column',
      boxSizing: 'border-box',
      boxShadow: isNarrow ? '-8px 0 32px rgba(0, 0, 0, 0.5)' : 'none',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 16px',
        borderBottom: '1px solid #333',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '15px' }}>📈</span>
          <span style={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}>个人进度</span>
        </div>
        <button
          onClick={onClose}
          aria-label="关闭进度概览"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#888',
            cursor: 'pointer',
            fontSize: '16px',
            padding: '4px 8px',
            borderRadius: '4px',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#333'; e.currentTarget.style.color = '#fff'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#888'; }}
        >
          ×
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '14px 14px 20px' }}>
        {loadState === 'loading' && renderLoading()}
        {loadState === 'error' && renderError()}

        {loadState !== 'loading' && (
          <>
            {/* 当前题目 */}
            <div style={{ marginBottom: 16 }}>
              <SectionTitle>当前题目</SectionTitle>
              {currentProblem ? (
                <div style={{
                  padding: '12px',
                  background: '#1e1e1e',
                  border: '1px solid #333',
                  borderRadius: '8px',
                }}>
                  <div style={{
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: 600,
                    lineHeight: 1.5,
                    marginBottom: '8px',
                    wordBreak: 'break-word',
                  }}>
                    {currentProblem.title}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                    {difficulty && (
                      <span style={{
                        fontSize: '10px',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        color: difficulty.color,
                        background: difficulty.bgColor,
                        fontWeight: 600,
                      }}>
                        {difficulty.label}
                      </span>
                    )}
                    <span style={{ fontSize: '10px', color: '#888' }}>
                      {currentProblem.testCases.length} 个用例
                    </span>
                    <span style={{ fontSize: '10px', color: '#888' }}>
                      时限 {currentProblem.timeLimit}ms
                    </span>
                  </div>
                </div>
              ) : (
                <div style={{
                  padding: '12px',
                  background: '#1e1e1e',
                  border: '1px dashed #444',
                  borderRadius: '8px',
                  color: '#888',
                  fontSize: '11px',
                  textAlign: 'center',
                }}>
                  {loadState === 'error' ? '题目信息暂不可用，可重试' : '题目暂未指定'}
                  <div style={{ marginTop: 8 }}>
                    <button
                      onClick={() => reload()}
                      style={{
                        padding: '4px 12px',
                        background: 'transparent',
                        color: '#2196f3',
                        border: '1px solid #2196f3',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        fontSize: '11px',
                      }}
                    >
                      重试
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 面试阶段 */}
            <div style={{ marginBottom: 16 }}>
              <SectionTitle>面试阶段</SectionTitle>
              {currentRoom && statusConfig ? (
                <div style={{
                  padding: '12px',
                  background: statusConfig.bgColor,
                  border: `1px solid ${statusConfig.color}40`,
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}>
                  <span style={{ fontSize: '20px' }}>{statusConfig.icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: statusConfig.color, fontSize: '14px', fontWeight: 700 }}>
                      {statusConfig.label}
                    </div>
                    <div style={{ color: '#999', fontSize: '10px', marginTop: 2, lineHeight: 1.4 }}>
                      {statusConfig.description}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ color: '#888', fontSize: '11px' }}>阶段信息不可用</div>
              )}
            </div>

            {/* 已用时长 */}
            <div style={{ marginBottom: 16 }}>
              <SectionTitle>已用时长</SectionTitle>
              <div style={{
                padding: '12px',
                background: '#1e1e1e',
                border: '1px solid #333',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'baseline',
                gap: '8px',
              }}>
                <span style={{
                  fontSize: '20px',
                  fontWeight: 700,
                  color: statusConfig?.color || '#fff',
                  fontFamily: 'monospace',
                }}>
                  {currentRoom ? getStageDuration(currentRoom) : '--'}
                </span>
                {currentRoom?.status === 'WAITING' && (
                  <span style={{ fontSize: '10px', color: '#888' }}>等待开始</span>
                )}
                {currentRoom?.status === 'ACTIVE' && (
                  <span style={{ fontSize: '10px', color: '#888' }}>计时中</span>
                )}
              </div>
              {currentRoom?.startedAt && (
                <div style={{ fontSize: '10px', color: '#666', marginTop: 6 }}>
                  开始于 {formatTime(currentRoom.startedAt)}
                </div>
              )}
            </div>

            {/* 运行与提交次数 */}
            <div style={{ marginBottom: 16 }}>
              <SectionTitle>作答次数</SectionTitle>
              <div style={{ display: 'flex', gap: '8px' }}>
                <StatCard
                  icon="▶️"
                  label="运行"
                  accent="#4caf50"
                  value={
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      {stats.runCount}
                      {(isRunning) && (
                        <span className="progress-overview-spinner" style={{
                          width: '10px', height: '10px',
                          border: '2px solid rgba(76,175,80,0.3)',
                          borderTopColor: '#4caf50',
                          borderRadius: '50%',
                          display: 'inline-block',
                        }} />
                      )}
                    </span>
                  }
                  hint={stats.runCount > 0 ? `已完成 ${stats.runFinished} 次` : '尚未运行'}
                />
                <StatCard
                  icon="✓"
                  label="提交"
                  accent="#2196f3"
                  value={
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      {stats.submitCount}
                      {isSubmitting && (
                        <span className="progress-overview-spinner" style={{
                          width: '10px', height: '10px',
                          border: '2px solid rgba(33,150,243,0.3)',
                          borderTopColor: '#2196f3',
                          borderRadius: '50%',
                          display: 'inline-block',
                        }} />
                      )}
                    </span>
                  }
                  hint={stats.submitCount > 0 ? `已完成 ${stats.submitFinished} 次` : '尚未提交'}
                />
              </div>
            </div>

            {/* 最近一次结果摘要 */}
            <div style={{ marginBottom: 8 }}>
              <SectionTitle>最近一次结果</SectionTitle>
              {renderLatestResult()}
            </div>
          </>
        )}
      </div>

      <div style={{
        padding: '10px 16px',
        borderTop: '1px solid #333',
        fontSize: '10px',
        color: '#555',
        lineHeight: 1.5,
        flexShrink: 0,
      }}>
        概览与作答区实时同步 · 编码与结果详情保持不变
      </div>

      <style>{`
        .progress-overview-spinner {
          animation: progressOverviewSpin 0.8s linear infinite;
        }
        @keyframes progressOverviewSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );

  if (isNarrow) {
    // 窄屏：固定浮层 + 遮罩，不挤占、不遮挡代码与题目内容
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 2000 }}>
        <div
          onClick={onClose}
          style={{ position: 'absolute', inset: 0, background: 'rgba(0, 0, 0, 0.45)' }}
        />
        <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0 }}>
          {panel}
        </div>
      </div>
    );
  }

  // 宽屏：与参与者面板一致，作为侧栏内联挤压布局，不覆盖代码区
  return (
    <div style={{
      width: PANEL_WIDTH,
      flexShrink: 0,
      background: '#1a1a1a',
      borderLeft: '1px solid #333',
      overflow: 'hidden',
    }}>
      {panel}
    </div>
  );
};
