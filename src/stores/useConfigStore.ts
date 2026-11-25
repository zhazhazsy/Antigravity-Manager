import { create } from 'zustand';
import { AppConfig } from '../types/config';
import * as configService from '../services/configService';
import i18n from '../i18n';

// 规范化语言编码 (兼容方言与区域代码别名)
export function normalizeLanguageCode(code: string): string {
    if (!code) return 'en';
    if (code === 'zh-CN' || code === 'zh-Hans') return 'zh';
    if (code.startsWith('zh-TW') || code.startsWith('zh-HK') || code.startsWith('zh-Hant')) return 'zh-TW';
    if (code === 'ms' || code.startsWith('ms-')) return 'my';

    // 泛化支持如 en-US -> en, ja-JP -> ja, pt-BR -> pt 等常见 BCP 47 代码
    const primary = code.split(/[-_]/)[0].toLowerCase();
    const supported = ['en', 'zh', 'ja', 'tr', 'vi', 'pt', 'ko', 'ru', 'ar', 'es', 'my'];
    if (supported.includes(primary)) return primary;
    return code;
}

// 竞态隔离与尾随批处理锁：杜绝高频连续操作（如快速连续切换语言、主题或滑块）时后端 I/O 乱序回滚
let activeSavePromise: Promise<void> | null = null;
let queuedConfig: AppConfig | null = null;
let queuedWaiters: Array<{ resolve: () => void; reject: (err: unknown) => void }> = [];
let saveSequence = 0;

async function flushPersist(config: AppConfig): Promise<void> {
    await configService.saveConfig(config);
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('set_window_theme', { theme: config.theme }).catch(() => {});
}

async function executeSaveQueue(config: AppConfig): Promise<void> {
    if (activeSavePromise) {
        queuedConfig = config;
        return new Promise<void>((resolve, reject) => {
            queuedWaiters.push({ resolve, reject });
        });
    }

    activeSavePromise = (async () => {
        try {
            await flushPersist(config);
        } finally {
            while (queuedConfig) {
                const nextConfig = queuedConfig;
                const waiters = queuedWaiters;
                queuedConfig = null;
                queuedWaiters = [];
                try {
                    await flushPersist(nextConfig);
                    waiters.forEach(w => w.resolve());
                } catch (err) {
                    waiters.forEach(w => w.reject(err));
                }
            }
            activeSavePromise = null;
        }
    })();

    return activeSavePromise;
}

interface ConfigState {
    config: AppConfig | null;
    loading: boolean;
    error: string | null;

    // Actions
    loadConfig: () => Promise<void>;
    saveConfig: (config: AppConfig, silent?: boolean) => Promise<void>;
    updateTheme: (theme: string) => Promise<void>;
    updateLanguage: (language: string) => Promise<void>;
    toggleShowAllQuotas: () => void;
    showAllQuotas: boolean;
}

export const useConfigStore = create<ConfigState>((set, get) => ({
    config: null,
    loading: false,
    error: null,
    showAllQuotas: localStorage.getItem('antigravity_show_all_quotas') === 'true',

    loadConfig: async () => {
        set({ loading: true, error: null });
        try {
            const config = await configService.loadConfig();
            set({ config, loading: false });
        } catch (error) {
            set({ error: String(error), loading: false });
        }
    },

    saveConfig: async (config: AppConfig, silent: boolean = false) => {
        const currentSeq = ++saveSequence;
        // 1. 同步立即乐观更新 Zustand store 状态
        set({ config, loading: !silent, error: null });

        try {
            // 2. 串行/尾随有序持久化
            await executeSaveQueue(config);
            if (currentSeq === saveSequence) {
                set({ loading: false });
            }
        } catch (error) {
            if (currentSeq === saveSequence) {
                set({ error: String(error), loading: false });
            }
            throw error;
        }
    },

    updateTheme: async (theme: string) => {
        const current = get().config;
        if (!current || current.theme === theme) return;

        localStorage.setItem('app-theme-preference', theme);
        const latest = get().config || current;
        const newConfig = { ...latest, theme };
        await get().saveConfig(newConfig, true);

        const { emit } = await import('@tauri-apps/api/event');
        await emit('app://theme-changed', { theme }).catch(() => {});
    },

    updateLanguage: async (language: string) => {
        const current = get().config;
        if (!current) return;

        const normalized = normalizeLanguageCode(language);
        if (current.language === normalized && i18n.language === normalized) return;

        // 1. 同步切换物理布局方向
        document.documentElement.dir = normalized === 'ar' ? 'rtl' : 'ltr';

        // 2. 同步立即乐观更新 store 内存态并挂载异步落盘任务
        const latest = get().config || current;
        const newConfig = { ...latest, language: normalized };
        const savePromise = get().saveConfig(newConfig, true);

        // 3. 切换 i18n 并等待落盘完成
        await i18n.changeLanguage(normalized);
        await savePromise;

        const { emit } = await import('@tauri-apps/api/event');
        await emit('app://language-changed', { language: normalized }).catch(() => {});
    },

    toggleShowAllQuotas: () => {
        const current = get().showAllQuotas;
        const next = !current;
        localStorage.setItem('antigravity_show_all_quotas', String(next));
        set({ showAllQuotas: next });
    },
}));
