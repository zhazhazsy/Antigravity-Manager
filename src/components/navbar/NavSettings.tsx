import { Sun, Moon, Minimize2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LanguageDropdown, MoreDropdown } from './NavDropdowns';
import { LANGUAGES } from './constants';
import { invoke } from '@tauri-apps/api/core';

interface NavSettingsProps {
    theme: 'light' | 'dark';
    currentLanguage: string;
    onThemeToggle: (event: React.MouseEvent<HTMLButtonElement>) => void;
    onLanguageChange: (langCode: string) => void;
}

/**
 * 设置按钮组件 - 独立处理响应式
 *
 * 响应式策略:
 * - ≥ 480px: 独立按钮 (MiniView + 主题 + 语言)
 * - < 480px: 更多下拉菜单
 */
export function NavSettings({
    theme,
    currentLanguage,
    onThemeToggle,
    onLanguageChange
}: NavSettingsProps) {
    const { t } = useTranslation();

    return (
        <>
            {/* 独立按钮 (≥ 480px) */}
            <div className="hidden min-[480px]:flex items-center gap-2">
                {/* 迷你视图切换按钮 */}
                <button
                    onClick={() => {
                        invoke('show_mini_view').catch(() => {});
                    }}
                    className="w-10 h-10 rounded-full bg-gray-100 dark:bg-base-200 hover:bg-gray-200 dark:hover:bg-base-100 flex items-center justify-center transition-colors"
                    title={t('nav.mini_view', 'Mini View')}
                >
                    <Minimize2 className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                </button>

                {/* 主题切换按钮 */}
                <button
                    onClick={onThemeToggle}
                    className="w-10 h-10 rounded-full bg-gray-100 dark:bg-base-200 hover:bg-gray-200 dark:hover:bg-base-100 flex items-center justify-center transition-colors"
                    title={theme === 'light' ? t('nav.theme_to_dark') : t('nav.theme_to_light')}
                >
                    {theme === 'light' ? (
                        <Moon className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                    ) : (
                        <Sun className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                    )}
                </button>

                {/* 语言切换下拉菜单 */}
                <LanguageDropdown
                    currentLanguage={currentLanguage}
                    languages={LANGUAGES}
                    onLanguageChange={onLanguageChange}
                />
            </div>

            {/* 更多菜单 (< 480px) */}
            <div className="min-[480px]:hidden">
                <MoreDropdown
                    theme={theme}
                    currentLanguage={currentLanguage}
                    languages={LANGUAGES}
                    onThemeToggle={onThemeToggle}
                    onLanguageChange={onLanguageChange}
                />
            </div>
        </>
    );
}
