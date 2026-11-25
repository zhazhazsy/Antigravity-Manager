use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UpstreamProxyConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct NetworkProxyConfig {
    #[serde(default)]
    pub upstream_proxy: UpstreamProxyConfig,
}

/// Application configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub language: String,
    pub theme: String,
    pub auto_refresh: bool,
    pub refresh_interval: i32, // minutes
    /// 启动完成、账号加载就绪后，异步刷新一次全部账号配额
    #[serde(default = "default_startup_refresh")]
    pub startup_refresh: bool,
    /// 批量配额刷新与启动探测时的同时探测账号数（滑动窗口容量），默认 5，范围 1~20
    #[serde(default = "default_refresh_concurrency")]
    pub refresh_concurrency: u32,
    /// 全量配额刷新的滑动窗口延迟（秒）：账号完成后等待该时间再释放槽位给下一个账号。
    /// 并发上限固定为 5；0 表示完成后立即让位。
    #[serde(default = "default_refresh_slide_delay_secs")]
    pub refresh_slide_delay_secs: f64,
    pub default_export_path: Option<String>,
    #[serde(default)]
    pub proxy: NetworkProxyConfig,
    pub antigravity_executable: Option<String>, // [NEW] Manually specified Antigravity executable path
    pub antigravity_ide_executable: Option<String>, // [NEW] Manually specified Antigravity IDE executable path
    pub antigravity_cli_executable: Option<String>, // [NEW] Manually specified Antigravity CLI (agy) path
    pub antigravity_args: Option<Vec<String>>,      // [NEW] Antigravity startup arguments
    #[serde(default)]
    pub auto_launch: bool,     // Launch on startup
    /// Login-item launches stay in the tray. Missing values stay on so existing
    /// autostart entries, which already pass `--minimized`, keep that behavior.
    #[serde(default = "default_quiet_autostart")]
    pub quiet_autostart: bool,
    #[serde(default)]
    pub scheduled_warmup: ScheduledWarmupConfig, // [NEW] Scheduled warmup configuration
    #[serde(default)]
    pub lightweight_mode: bool, // [NEW] Lightweight mode: destroy webview on minimize/close to tray
    #[serde(default)]
    pub auto_switch_classic_depleted: bool, // [NEW] 兼容旧版开关
    #[serde(default)]
    pub classic_auto_switch: ClassicAutoSwitchConfig, // [NEW] 经典款配额自动热切换配置
    #[serde(default = "default_tray_click_action")]
    pub tray_click_action: String, // [NEW] 托盘左键点击行为: "mini" | "main"
}

fn default_tray_click_action() -> String {
    "mini".to_string()
}

fn default_quiet_autostart() -> bool {
    true
}

fn default_startup_refresh() -> bool {
    true
}

fn default_refresh_concurrency() -> u32 {
    5
}

fn default_refresh_slide_delay_secs() -> f64 {
    0.2
}

/// Scheduled warmup configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduledWarmupConfig {
    /// Whether smart warmup is enabled
    pub enabled: bool,

    /// List of models to warmup
    #[serde(default = "default_warmup_models")]
    pub monitored_models: Vec<String>,
}

fn default_warmup_models() -> Vec<String> {
    vec![
        "gemini-3.8-flash".to_string(),
        "claude".to_string(),
        "gemini-3.1-pro-high".to_string(),
        "gemini-3.1-flash-image".to_string(),
    ]
}

impl ScheduledWarmupConfig {
    pub fn new() -> Self {
        Self {
            enabled: false,
            monitored_models: default_warmup_models(),
        }
    }
}

impl Default for ScheduledWarmupConfig {
    fn default() -> Self {
        Self::new()
    }
}

/// Classic auto-switch configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClassicAutoSwitchConfig {
    /// Whether classic auto switch is enabled
    pub enabled: bool,
    /// Quota threshold percentage (0-99). Trigger switch when quota <= threshold
    #[serde(default = "default_classic_auto_switch_threshold")]
    pub threshold_percentage: u32,
    /// List of monitored models
    #[serde(default = "default_classic_monitored_models")]
    pub monitored_models: Vec<String>,
}

fn default_classic_auto_switch_threshold() -> u32 {
    0
}

fn default_classic_monitored_models() -> Vec<String> {
    vec!["gemini".to_string(), "claude".to_string()]
}

impl ClassicAutoSwitchConfig {
    pub fn new() -> Self {
        Self {
            enabled: false,
            threshold_percentage: 0,
            monitored_models: default_classic_monitored_models(),
        }
    }
}

impl Default for ClassicAutoSwitchConfig {
    fn default() -> Self {
        Self::new()
    }
}

impl AppConfig {
    pub fn new() -> Self {
        Self {
            language: crate::modules::i18n::default_language(),
            theme: "system".to_string(),
            auto_refresh: true,
            refresh_interval: 10,
            startup_refresh: true,
            refresh_concurrency: 5,
            refresh_slide_delay_secs: 0.2,
            default_export_path: None,
            proxy: NetworkProxyConfig::default(),
            antigravity_executable: None,
            antigravity_ide_executable: None,
            antigravity_cli_executable: None,
            antigravity_args: None,
            auto_launch: false,
            quiet_autostart: true,
            scheduled_warmup: ScheduledWarmupConfig::default(),
            lightweight_mode: false,
            auto_switch_classic_depleted: false,
            classic_auto_switch: ClassicAutoSwitchConfig::default(),
            tray_click_action: default_tray_click_action(),
        }
    }
}

impl Default for AppConfig {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::AppConfig;

    #[test]
    fn saved_language_is_preserved_when_loading_config() {
        let mut config = AppConfig::new();
        for language in ["en", "zh", "zh-TW", "ru"] {
            config.language = language.to_string();
            let saved = serde_json::to_string(&config).unwrap();
            let restored: AppConfig = serde_json::from_str(&saved).unwrap();
            assert_eq!(restored.language, language);
        }
    }

    #[test]
    fn quiet_autostart_defaults_to_true_when_missing() {
        let mut config = AppConfig::new();
        config.quiet_autostart = false;
        let mut value = serde_json::to_value(&config).unwrap();
        value.as_object_mut().unwrap().remove("quiet_autostart");
        let restored: AppConfig = serde_json::from_value(value).unwrap();
        assert!(restored.quiet_autostart);

        let saved = serde_json::to_string(&config).unwrap();
        let restored: AppConfig = serde_json::from_str(&saved).unwrap();
        assert!(!restored.quiet_autostart);
    }

    #[test]
    fn startup_refresh_defaults_are_backward_compatible() {
        let config = AppConfig::new();
        let mut value = serde_json::to_value(&config).unwrap();
        value.as_object_mut().unwrap().remove("startup_refresh");
        value.as_object_mut().unwrap().remove("refresh_concurrency");
        let restored: AppConfig = serde_json::from_value(value).unwrap();
        assert!(restored.startup_refresh);
        assert_eq!(restored.refresh_concurrency, 5);

        let mut config = AppConfig::new();
        config.startup_refresh = false;
        config.refresh_concurrency = 10;
        let saved = serde_json::to_string(&config).unwrap();
        let restored: AppConfig = serde_json::from_str(&saved).unwrap();
        assert!(!restored.startup_refresh);
        assert_eq!(restored.refresh_concurrency, 10);
    }

    #[test]
    fn refresh_slide_delay_defaults_to_0_2_seconds() {
        let config = AppConfig::new();
        assert!((config.refresh_slide_delay_secs - 0.2).abs() < f64::EPSILON);

        let mut value = serde_json::to_value(&config).unwrap();
        value
            .as_object_mut()
            .unwrap()
            .remove("refresh_slide_delay_secs");
        let restored: AppConfig = serde_json::from_value(value).unwrap();
        assert!((restored.refresh_slide_delay_secs - 0.2).abs() < f64::EPSILON);
    }

    #[test]
    fn tray_click_action_defaults_to_mini_when_missing() {
        let mut config = AppConfig::new();
        config.tray_click_action = "main".to_string();
        let mut value = serde_json::to_value(&config).unwrap();
        value.as_object_mut().unwrap().remove("tray_click_action");
        let restored: AppConfig = serde_json::from_value(value).unwrap();
        assert_eq!(restored.tray_click_action, "mini");

        let saved = serde_json::to_string(&config).unwrap();
        let restored: AppConfig = serde_json::from_str(&saved).unwrap();
        assert_eq!(restored.tray_click_action, "main");
    }
}
