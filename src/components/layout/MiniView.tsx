import { useEffect, useState, useMemo, useRef } from 'react';
import {
    Maximize2, RefreshCw, Tag,
    Laptop, Code2, Terminal, Mail, Gem, Diamond, Circle, HelpCircle,
    ArrowRight, Check, ChevronDown, Shuffle, Power, Feather, Copy, Pin, X
} from 'lucide-react';
import { useAccountStore } from '../../stores/useAccountStore';
import { isTauri } from '../../utils/env';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import {
    getGroupQuotaSummaries,
    GroupQuotaSummary
} from '../../utils/quotaDisplay';
import { getAccountTier, type Account } from '../../types/account';
import { isAccountAbnormal } from '../../utils/accountStatus';
import { getLiveLimitForModel } from '../../utils/liveLimit';
import { GroupQuotaCard } from '../accounts/GroupQuotaCard';
import { useConfigStore } from '../../stores/useConfigStore';

type MiniTab = 'classic' | 'ide' | 'agy';

export default function MiniView() {
    const {
        accounts,
        currentAccount,
        activeClients,
        refreshQuota,
        fetchAccounts,
        fetchCurrentAccount,
        switchAccount
    } = useAccountStore();
    const { config, saveConfig, loadConfig } = useConfigStore();
    const { t } = useTranslation();

    const containerRef = useRef<HTMLDivElement>(null);
    const lastWindowHeightRef = useRef<number>(0);

    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isSwitching, setIsSwitching] = useState(false);
    const [showAccountList, setShowAccountList] = useState(false);
    const [copied, setCopied] = useState(false);
    const [isPinned, setIsPinned] = useState<boolean>(() => {
        try {
            return localStorage.getItem('mini_view_pinned') === 'true';
        } catch {
            return false;
        }
    });

    // 默认定位到活跃客户端 Tab，仅保留 经典款 / IDE / CLI
    const [activeTab, setActiveTab] = useState<MiniTab>(() => {
        const saved = localStorage.getItem('mini_view_tab');
        if (saved === 'classic' || saved === 'ide' || saved === 'agy') {
            return saved;
        }
        return 'classic';
    });

    useEffect(() => {
        localStorage.setItem('mini_view_tab', activeTab);
    }, [activeTab]);

    useEffect(() => {
        if (!config) {
            loadConfig();
        }
    }, [config, loadConfig]);

    useEffect(() => {
        fetchAccounts();
        fetchCurrentAccount();
        const handleFocus = () => {
            loadConfig();
            fetchAccounts();
            fetchCurrentAccount();
        };
        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, [fetchAccounts, fetchCurrentAccount, loadConfig]);

    const getClientAccountId = (tab: MiniTab) => {
        switch (tab) {
            case 'classic':
                return activeClients?.classic_account_id;
            case 'ide':
                return activeClients?.ide_account_id;
            case 'agy':
                return activeClients?.agy_account_id;
        }
    };

    const displayedAccount = useMemo(() => {
        const currentClientAccountId = getClientAccountId(activeTab);
        if (currentClientAccountId && accounts.length > 0) {
            const found = accounts.find((a) => a.id === currentClientAccountId);
            if (found) return found;
        }
        if (activeTab === 'classic' && currentAccount) {
            return currentAccount;
        }
        return null;
    }, [activeTab, activeClients, accounts, currentAccount]);

    // 选中/切换不同客户端 Tab 或账号时，实时同步托盘菜单状态
    useEffect(() => {
        if (isTauri()) {
            invoke('update_tray_for_account', { accountId: displayedAccount?.id ?? null }).catch(() => {});
        }
    }, [displayedAccount?.id, displayedAccount?.quota]);

    const tier = displayedAccount ? getAccountTier(displayedAccount) : 'free';

    const groupSummaries: GroupQuotaSummary[] = useMemo(() => {
        if (!displayedAccount) return [];
        return getGroupQuotaSummaries(
            displayedAccount.quota?.quota_groups,
            displayedAccount.quota?.models,
            tier
        );
    }, [displayedAccount, tier]);

    const isGroupProtected = (key: 'gemini' | 'claude') => {
        if (!displayedAccount?.protected_models || displayedAccount.protected_models.length === 0) {
            return false;
        }
        if (key === 'gemini') {
            return displayedAccount.protected_models.some(
                (m: string) => m.toLowerCase().includes('gemini')
            );
        }
        return displayedAccount.protected_models.some(
            (m: string) => m.toLowerCase().includes('claude') || m.toLowerCase().includes('gpt')
        );
    };

    const handleRefresh = async () => {
        if (isRefreshing) return;
        setIsRefreshing(true);
        try {
            if (displayedAccount) {
                await refreshQuota(displayedAccount.id);
                await fetchCurrentAccount();
            } else {
                await fetchAccounts();
                await fetchCurrentAccount();
            }
        } catch (e) {
            console.error('Refresh failed:', e);
        } finally {
            setTimeout(() => setIsRefreshing(false), 800);
        }
    };

    // 初始化并同步置顶状态到后端及当前原生窗口
    useEffect(() => {
        if (!isTauri()) return;
        try {
            const saved = localStorage.getItem('mini_view_pinned');
            if (saved !== null) {
                const pinned = saved === 'true';
                setIsPinned(pinned);
                invoke('set_mini_view_pinned', { pinned }).catch(() => {});
                getCurrentWindow().setAlwaysOnTop(pinned).catch(() => {});
            } else {
                invoke<boolean>('is_mini_view_pinned')
                    .then((pinned) => setIsPinned(pinned))
                    .catch(() => {});
            }
        } catch {
            invoke<boolean>('is_mini_view_pinned')
                .then((pinned) => setIsPinned(pinned))
                .catch(() => {});
        }
    }, []);

    // 保持迷你窗口最上层置顶状态与固定按钮实时同步
    useEffect(() => {
        if (isTauri()) {
            getCurrentWindow().setAlwaysOnTop(isPinned).catch(() => {});
        }
    }, [isPinned]);

    // 根据实际渲染内容动态贴合窗口高度，消除底部空白
    useEffect(() => {
        if (!isTauri()) return;
        const el = containerRef.current;
        if (!el) return;

        let rafId = 0;
        const syncWindowSize = () => {
            cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                const h = Math.ceil(el.getBoundingClientRect().height);
                if (h >= 120 && h !== lastWindowHeightRef.current) {
                    lastWindowHeightRef.current = h;
                    getCurrentWindow().setSize(new LogicalSize(360, h)).catch(() => {});
                }
            });
        };

        syncWindowSize();
        const observer = new ResizeObserver(syncWindowSize);
        observer.observe(el);
        return () => {
            cancelAnimationFrame(rafId);
            observer.disconnect();
        };
    }, [displayedAccount?.id, showAccountList, activeTab, groupSummaries.length]);

    // 支持 Esc 快捷键收起迷你悬浮窗至托盘
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isTauri()) {
                invoke('hide_mini_view').catch(() => {});
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // 统一原生窗口拖拽处理（避免与 data-tauri-drag-region 混用引发卡死）
    const handleStartDrag = (e: React.MouseEvent<HTMLElement>) => {
        if (e.button !== 0 || !isTauri()) return;
        const target = e.target as HTMLElement;
        if (target.closest('button, a, input, select, textarea, [data-no-drag="true"]')) {
            return;
        }
        getCurrentWindow().startDragging().catch(() => {});
    };

    const handleTogglePin = async () => {
        const next = !isPinned;
        setIsPinned(next);
        try {
            localStorage.setItem('mini_view_pinned', String(next));
        } catch {
            // ignore storage failure
        }
        if (isTauri()) {
            try {
                await invoke('set_mini_view_pinned', { pinned: next });
                await getCurrentWindow().setAlwaysOnTop(next);
            } catch (e) {
                console.error('Failed to toggle pin always-on-top:', e);
            }
        }
    };

    const handleClose = async () => {
        await invoke('hide_mini_view').catch(() => {});
    };

    const handleMaximize = () => {
        invoke('switch_to_main_window').catch((err) => {
            console.error('Failed to switch to main window:', err);
        });
    };

    const handleQuitApp = async () => {
        try {
            await invoke('exit_app');
        } catch (e) {
            console.error('Failed to exit app:', e);
        }
    };

    const handleToggleLightweight = async () => {
        if (!config) return;
        try {
            await saveConfig({
                ...config,
                lightweight_mode: !config.lightweight_mode,
            }, true);
        } catch (e) {
            console.error('Failed to toggle lightweight mode:', e);
        }
    };

    const handleCopyEmail = (email?: string) => {
        if (!email) return;
        navigator.clipboard.writeText(email);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const availableAccounts = useMemo(() => {
        return accounts.filter(
            a => !a.disabled && !isAccountAbnormal(a)
        );
    }, [accounts]);

    const activePool = useMemo(() => {
        return availableAccounts.length > 0
            ? availableAccounts
            : accounts.filter(a => !isAccountAbnormal(a));
    }, [availableAccounts, accounts]);

    const handleSwitchAccount = async (accountId: string) => {
        if (isSwitching) return;
        setIsSwitching(true);
        setShowAccountList(false);
        try {
            await switchAccount(accountId, activeTab);
            await fetchAccounts();
            await fetchCurrentAccount();
        } catch (err) {
            console.error('Failed to switch account in mini view:', err);
        } finally {
            setTimeout(() => setIsSwitching(false), 800);
        }
    };

    const handleQuickNextAccount = async () => {
        if (isSwitching || accounts.length <= 1) return;
        const poolToUse = availableAccounts.length > 0 ? availableAccounts : activePool;
        if (poolToUse.length === 0) return;
        const currentId = displayedAccount?.id;
        const currentIndex = poolToUse.findIndex((a: Account) => a.id === currentId);
        const nextIndex = (currentIndex + 1) % poolToUse.length;
        const nextAcc = poolToUse[nextIndex];
        if (nextAcc) {
            await handleSwitchAccount(nextAcc.id);
        }
    };

    const getTabStatus = (tabKey: MiniTab) => {
        const id = getClientAccountId(tabKey);
        if (!id && tabKey === 'classic' && currentAccount) {
            const isHealthy = !currentAccount.disabled && !isAccountAbnormal(currentAccount);
            return { hasAccount: true, isHealthy };
        }
        if (!id) return { hasAccount: false, isHealthy: false };
        const acc = accounts.find((a) => a.id === id);
        if (!acc) return { hasAccount: false, isHealthy: false };
        const isHealthy = !acc.disabled && !isAccountAbnormal(acc);
        return { hasAccount: true, isHealthy };
    };

    const tabs = [
        {
            key: 'classic' as const,
            label: t('accounts.client_classic', '经典款'),
            icon: Laptop,
            tooltip: t('accounts.client_classic_tooltip', '当前 Antigravity 经典款客户端登录账号'),
        },
        {
            key: 'ide' as const,
            label: t('accounts.client_ide', 'IDE'),
            icon: Code2,
            tooltip: t('accounts.client_ide_tooltip', '当前 Antigravity IDE 客户端登录账号'),
        },
        {
            key: 'agy' as const,
            label: t('accounts.client_cli', 'CLI'),
            icon: Terminal,
            tooltip: t('accounts.client_cli_tooltip', '当前 Antigravity CLI (agy) 登录账号'),
        },
    ];

    return (
        <div
            ref={containerRef}
            className="w-full flex flex-col bg-white/95 dark:bg-[#15161a]/95 backdrop-blur-2xl rounded-2xl border border-gray-200/80 dark:border-white/[0.12] overflow-hidden select-none"
        >
            {/* 1. 紧凑顶栏：3 客户端 Tab + 可拖拽空白区 + 刷新 / 固定置顶 / 关闭 */}
            <div
                className="flex-none flex items-center justify-between px-2.5 py-1.5 bg-gray-50/80 dark:bg-white/[0.03] rounded-t-2xl border-b border-gray-100 dark:border-white/[0.06] select-none cursor-move"
                onMouseDown={handleStartDrag}
            >
                <div
                    className="flex items-center bg-black/[0.04] dark:bg-white/[0.07] p-0.5 rounded-xl gap-0.5"
                    data-no-drag="true"
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.key;
                        const status = getTabStatus(tab.key);
                        return (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveTab(tab.key);
                                    setShowAccountList(false);
                                }}
                                title={tab.tooltip}
                                className={clsx(
                                    "relative flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] whitespace-nowrap shrink-0 transition-all cursor-pointer outline-none focus:outline-none focus:ring-0 focus-visible:ring-0 select-none",
                                    isActive
                                        ? "bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 font-bold shadow-xs border border-black/[0.06] dark:border-white/[0.1]"
                                        : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-medium hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
                                )}
                            >
                                <Icon className="w-3 h-3 shrink-0" />
                                <span className="shrink-0">{tab.label}</span>
                                <span
                                    className={clsx(
                                        "w-1.5 h-1.5 rounded-full shrink-0 transition-colors",
                                        !status.hasAccount
                                            ? "bg-gray-300 dark:bg-zinc-600"
                                            : status.isHealthy
                                                ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]"
                                                : "bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]"
                                    )}
                                />
                            </button>
                        );
                    })}
                </div>

                {/* 居中拖拽空白区 */}
                <div className="flex-1 self-stretch min-w-[20px] cursor-move" />

                {/* 右侧核心操作：刷新 / 显式固定置顶按钮 / 关闭 */}
                <div
                    className="flex items-center gap-1 shrink-0"
                    data-no-drag="true"
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <button
                        type="button"
                        onClick={handleRefresh}
                        className="p-1 rounded-lg text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.08] transition-colors cursor-pointer outline-none focus:outline-none focus:ring-0 focus-visible:ring-0"
                        title={t('common.refresh', '刷新当前额度')}
                    >
                        <RefreshCw size={13} className={clsx(isRefreshing && "animate-spin text-blue-500")} />
                    </button>
                    <button
                        type="button"
                        onClick={handleTogglePin}
                        className={clsx(
                            "flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold border transition-all cursor-pointer outline-none focus:outline-none focus:ring-0 focus-visible:ring-0",
                            isPinned
                                ? "bg-blue-600 text-white border-blue-600 shadow-xs hover:bg-blue-500"
                                : "bg-white dark:bg-zinc-800/80 text-gray-600 dark:text-gray-300 border-gray-200/80 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-zinc-700/80"
                        )}
                        title={isPinned ? t('tray.unpin_desc', '已固定在屏幕最上层（点击取消）') : t('tray.pin_desc', '点击固定在屏幕最上层')}
                    >
                        <Pin size={11} className={clsx("transition-transform", isPinned && "fill-current rotate-45")} />
                        <span>{isPinned ? t('tray.pinned_short', '已固定') : t('tray.pin_short', '固定')}</span>
                    </button>
                    <button
                        type="button"
                        onClick={handleClose}
                        className="p-1 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-black/[0.04] dark:hover:bg-white/[0.08] transition-colors cursor-pointer outline-none focus:outline-none focus:ring-0 focus-visible:ring-0"
                        title={t('common.close', '收起至托盘 (Esc)')}
                    >
                        <X size={13} />
                    </button>
                </div>
            </div>

            {/* 2. 紧凑核心内容区：严格贴合内容高度，消除下方多余空白 */}
            <div className="px-2.5 py-2 space-y-1.5" onMouseDown={handleStartDrag}>
                {showAccountList ? (
                    <div className="flex flex-col space-y-1.5" data-no-drag="true">
                        <div className="flex items-center justify-between pb-1 border-b border-gray-100 dark:border-white/5">
                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                                <Shuffle className="w-3.5 h-3.5 text-blue-500" />
                                <span>{t('dashboard.switch_account', '切换当前应用账号')}</span>
                                <span className="text-[10px] text-gray-400 font-mono">({accounts.length})</span>
                            </span>
                            <button
                                type="button"
                                onClick={() => setShowAccountList(false)}
                                className="text-xs font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white px-2 py-0.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                            >
                                {t('common.close', '返回')}
                            </button>
                        </div>

                        <div className="overflow-y-auto space-y-1 pr-0.5 scrollbar-thin max-h-[144px]">
                            {accounts.map((acc) => {
                                const isCurrent = acc.id === displayedAccount?.id;
                                const accTier = getAccountTier(acc);
                                const isHealthy = !acc.disabled && !isAccountAbnormal(acc);

                                return (
                                    <button
                                        key={acc.id}
                                        type="button"
                                        disabled={isSwitching}
                                        onClick={() => handleSwitchAccount(acc.id)}
                                        className={clsx(
                                            "w-full flex items-center justify-between px-2 py-1.5 rounded-xl text-left transition-all cursor-pointer group",
                                            isCurrent
                                                ? "bg-blue-50/80 dark:bg-blue-900/30 border border-blue-200/70 dark:border-blue-700/50 shadow-xs"
                                                : "hover:bg-black/[0.03] dark:hover:bg-white/[0.05] border border-transparent"
                                        )}
                                    >
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <span className={clsx(
                                                "w-1.5 h-1.5 rounded-full shrink-0",
                                                isHealthy ? "bg-emerald-500" : "bg-rose-500"
                                            )} />
                                            <span className={clsx(
                                                "text-xs truncate",
                                                isCurrent
                                                    ? "font-semibold text-blue-600 dark:text-blue-400"
                                                    : "text-gray-700 dark:text-gray-200"
                                            )}>
                                                {acc.email}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                            {accTier === 'ultra' && (
                                                <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400">
                                                    ULTRA
                                                </span>
                                            )}
                                            {accTier === 'pro' && (
                                                <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
                                                    PRO
                                                </span>
                                            )}
                                            {accTier === 'free' && (
                                                <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-gray-100 dark:bg-zinc-800 text-gray-500">
                                                    FREE
                                                </span>
                                            )}
                                            {isCurrent ? (
                                                <Check className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                            ) : (
                                                <ArrowRight className="w-3 h-3 text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ) : !displayedAccount ? (
                    <div className="flex flex-col items-center justify-center text-center space-y-1.5 py-3">
                        <div className="w-9 h-9 rounded-2xl bg-gray-100 dark:bg-white/[0.05] flex items-center justify-center text-gray-400">
                            <HelpCircle className="w-5 h-5 text-gray-400/80" />
                        </div>
                        <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                            {t('dashboard.no_client_account', '该应用当前暂无登录或绑定的账号')}
                        </div>
                        <div className="text-[11px] text-gray-400 max-w-[240px]">
                            {tabs.find((tab) => tab.key === activeTab)?.tooltip}
                        </div>

                        <button
                            type="button"
                            data-no-drag="true"
                            onClick={() => setShowAccountList(true)}
                            className="mt-1 px-3 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                            <span>{t('dashboard.go_switch_account', '为该应用指派账号')}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                ) : (
                    <div className="space-y-1.5">
                        {/* 账号信息与换号入口卡片 */}
                        <div className="bg-gradient-to-br from-black/[0.02] to-black/[0.04] dark:from-white/[0.04] dark:to-white/[0.02] rounded-xl px-2.5 py-1.5 border border-black/[0.05] dark:border-white/[0.08] space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                                <div
                                    data-no-drag="true"
                                    onClick={() => handleCopyEmail(displayedAccount.email)}
                                    className="flex items-center gap-1.5 min-w-0 flex-1 cursor-pointer hover:opacity-80 transition-opacity group"
                                    title={t('common.copy_to_clipboard', '点击复制邮箱')}
                                >
                                    <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                    <span className="text-xs font-semibold text-gray-800 dark:text-zinc-200 truncate">
                                        {displayedAccount.email}
                                    </span>
                                    {copied ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                    ) : (
                                        <Copy className="w-2.5 h-2.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                    )}
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                    {tier === 'ultra' && (
                                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-[9px] font-bold shadow-xs">
                                            <Gem className="w-2.5 h-2.5 fill-current" />
                                            ULTRA
                                        </span>
                                    )}
                                    {tier === 'pro' && (
                                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-[9px] font-bold shadow-xs">
                                            <Diamond className="w-2.5 h-2.5 fill-current" />
                                            PRO
                                        </span>
                                    )}
                                    {tier === 'free' && (
                                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-400 text-[9px] font-bold border border-gray-200 dark:border-white/10">
                                            <Circle className="w-2 h-2" />
                                            FREE
                                        </span>
                                    )}

                                    {displayedAccount.custom_label && (
                                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 text-[9px] font-bold">
                                            <Tag className="w-2.5 h-2.5" />
                                            {displayedAccount.custom_label}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center gap-1.5" data-no-drag="true">
                                <button
                                    type="button"
                                    onClick={() => setShowAccountList(true)}
                                    className="flex-1 flex items-center justify-between px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white dark:bg-zinc-800/80 hover:bg-gray-50 dark:hover:bg-zinc-700/80 text-gray-700 dark:text-zinc-200 border border-gray-200/80 dark:border-white/10 shadow-xs transition-colors cursor-pointer"
                                >
                                    <span className="flex items-center gap-1.5 truncate">
                                        <Shuffle className="w-3 h-3 text-blue-500" />
                                        <span>{t('dashboard.switch_account', '切换账号')}</span>
                                    </span>
                                    <ChevronDown className="w-3 h-3 text-gray-400" />
                                </button>

                                <button
                                    type="button"
                                    onClick={handleQuickNextAccount}
                                    disabled={isSwitching || accounts.length <= 1}
                                    title={t('tray.switch_next', '切换下一个账号')}
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-700/40 transition-colors disabled:opacity-40 cursor-pointer shrink-0"
                                >
                                    <Shuffle className={clsx("w-3 h-3", isSwitching && "animate-spin")} />
                                    <span>{t('accounts.switch_next_short', '切下个')}</span>
                                </button>
                            </div>
                        </div>

                        {/* 配额胶囊条：紧致排列 4 个核心条（Gemini 5H/周配额 + Claude 5H/周配额） */}
                        <div className="flex flex-col gap-1" data-no-drag="true">
                            {groupSummaries.map((summary) => (
                                <GroupQuotaCard
                                    key={summary.key}
                                    summary={summary}
                                    isProtected={isGroupProtected(summary.key === 'gemini' ? 'gemini' : 'claude')}
                                    liveLimit={
                                        summary.key === 'gemini'
                                            ? getLiveLimitForModel(displayedAccount, 'gemini-pro')
                                            : getLiveLimitForModel(displayedAccount, 'claude')
                                    }
                                />
                            ))}
                            {groupSummaries.length === 0 && (
                                <div className="text-center py-2 text-xs text-gray-400">
                                    {t('dashboard.no_quota_data', '暂无配额数据')}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* 3. 紧凑底栏：支持拖动的控制栏（轻量模式 / 打开主控制台 / 退出应用） */}
            <div
                className="flex-none h-8 bg-gray-50/95 dark:bg-black/40 rounded-b-2xl flex items-center justify-between px-2.5 text-[11px] text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-white/[0.06] select-none cursor-move"
                onMouseDown={handleStartDrag}
            >
                <div
                    data-no-drag="true"
                    onClick={handleToggleLightweight}
                    className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
                    title={t('settings.lightweight_mode_desc', '开启后退出或最小化到托盘将彻底释放 WebView 内存')}
                >
                    <Feather size={12} className={clsx(config?.lightweight_mode ? "text-emerald-500" : "text-gray-400")} />
                    <span className="font-medium text-gray-600 dark:text-gray-300">
                        {t('tray.lightweight_mode', '轻量模式')}
                    </span>
                    <div className={clsx(
                        "w-6 h-3.5 rounded-full p-0.5 transition-colors relative flex items-center",
                        config?.lightweight_mode ? "bg-emerald-500" : "bg-gray-300 dark:bg-zinc-600"
                    )}>
                        <div className={clsx(
                            "w-2.5 h-2.5 rounded-full bg-white shadow-xs transition-transform",
                            config?.lightweight_mode ? "translate-x-2.5" : "translate-x-0"
                        )} />
                    </div>
                </div>

                <button
                    type="button"
                    data-no-drag="true"
                    onClick={handleMaximize}
                    className="flex items-center gap-1.5 px-3 py-0.5 rounded-lg text-[11px] font-semibold bg-white dark:bg-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-700 text-gray-800 dark:text-zinc-100 border border-gray-200/90 dark:border-white/10 shadow-xs transition-all active:scale-95 cursor-pointer"
                    title={t('tray.open_console', '打开主控制台')}
                >
                    <Maximize2 size={11} className="text-blue-500" />
                    <span>{t('tray.open_console', '打开主控制台')}</span>
                </button>

                <button
                    type="button"
                    data-no-drag="true"
                    onClick={handleQuitApp}
                    className="p-1 rounded-lg text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                    title={t('tray.quit', '退出应用')}
                >
                    <Power size={13} />
                </button>
            </div>
        </div>
    );
}
