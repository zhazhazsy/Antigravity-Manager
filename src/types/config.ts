export interface UpstreamProxyConfig {
    enabled: boolean;
    url: string;
}

export interface ProxyConfig {
    upstream_proxy: UpstreamProxyConfig;
}

export interface ScheduledWarmupConfig {
    enabled: boolean;
    monitored_models: string[];
}

export interface ClassicAutoSwitchConfig {
    enabled: boolean;
    threshold_percentage: number;
    monitored_models: string[];
}

export interface AppConfig {
    language: string;
    theme: string;
    auto_refresh: boolean;
    refresh_interval: number;
    /** 启动完成、账号加载就绪后异步刷新一次全部配额 */
    startup_refresh?: boolean;
    /** 批量配额刷新与启动探测时的同时探测账号数（滑动窗口容量），默认 5，范围 1~20 */
    refresh_concurrency?: number;
    /** 全量配额刷新的滑动窗口延迟（秒）；账号完成后等待该时间再让位给下一个账号 */
    refresh_slide_delay_secs?: number;
    auto_switch_classic_depleted?: boolean; // [NEW] 兼容旧版开关
    classic_auto_switch?: ClassicAutoSwitchConfig; // [NEW] 经典款配额自动热切换配置
    default_export_path?: string;
    antigravity_executable?: string; // [NEW] 手动指定的反重力程序路径
    antigravity_ide_executable?: string; // [NEW] 手动指定的 Antigravity IDE 程序路径
    antigravity_cli_executable?: string; // [NEW] 手动指定的 Antigravity CLI (agy) 路径
    antigravity_args?: string[]; // [NEW] Antigravity 启动参数
    auto_launch?: boolean; // 开机自动启动
    quiet_autostart?: boolean; // 开机自启时留在托盘。缺省视为开启
    auto_check_update?: boolean; // 自动检查更新
    update_check_interval?: number; // 更新检查间隔（小时）
    update_channel?: 'stable' | 'beta'; // 更新通道：正式版 vs 预览版
    accounts_page_size?: number; // 账号列表每页显示数量,默认 0 表示自动计算
    scheduled_warmup: ScheduledWarmupConfig;
    proxy: ProxyConfig;
    lightweight_mode?: boolean; // [NEW] 轻量模式：关闭到托盘时释放 WebView
    tray_click_action?: 'mini' | 'main'; // [NEW] 托盘左键点击行为：'mini' 为弹出悬浮窗，'main' 为直接打开主控制台
}
