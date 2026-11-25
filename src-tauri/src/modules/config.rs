use serde_json;
use std::fs;

use super::account::get_data_dir;
use crate::models::AppConfig;

const CONFIG_FILE: &str = "gui_config.json";

/// Load application configuration
pub fn load_app_config() -> Result<AppConfig, String> {
    let data_dir = get_data_dir()?;
    let config_path = data_dir.join(CONFIG_FILE);

    if !config_path.exists() {
        let config = AppConfig::new();
        // [FIX #1460] Persist initial config to prevent new API Key on every refresh
        if let Err(e) = save_app_config(&config) {
            tracing::warn!(
                "Failed to persist initial config to {}: {}. An in-memory config will be used; the next start may generate a new API key if the file is still missing.",
                config_path.display(),
                e
            );
        }
        return Ok(config);
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("failed_to_read_config_file: {}", e))?;

    let (config, modified) = parse_and_migrate_config(&content)?;

    // If migration occurred or empty config was generated, auto-save once to clean up the file
    if modified {
        if let Err(e) = save_app_config(&config) {
            tracing::warn!(
                "Failed to persist healed or migrated config to {}: {}. An in-memory config will be used; the next start may generate a new API key if the file is still empty.",
                config_path.display(),
                e
            );
        }
    }

    Ok(config)
}

/// Parse raw configuration JSON string.
/// Returns (AppConfig, modified_flag).
pub fn parse_and_migrate_config(content: &str) -> Result<(AppConfig, bool), String> {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        tracing::warn!("Configuration content is empty, generating default configuration");
        return Ok((AppConfig::new(), true));
    }

    let v: serde_json::Value =
        serde_json::from_str(trimmed).map_err(|e| format!("failed_to_parse_config_file: {}", e))?;

    let config: AppConfig = serde_json::from_value(v)
        .map_err(|e| format!("failed_to_convert_config_after_migration: {}", e))?;

    Ok((config, false))
}

/// Save application configuration (atomic write)
pub fn save_app_config(config: &AppConfig) -> Result<(), String> {
    let data_dir = get_data_dir()?;
    let config_path = data_dir.join(CONFIG_FILE);

    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("failed_to_serialize_config: {}", e))?;

    crate::utils::fs::write_atomic(&config_path, content.as_bytes())
        .map_err(|e| format!("failed_to_save_config: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_and_migrate_empty_or_whitespace_config() {
        let (empty_cfg, modified_empty) =
            parse_and_migrate_config("").expect("empty config should parse to default");
        assert!(modified_empty);
        assert_eq!(empty_cfg.refresh_interval, 10);

        let (ws_cfg, modified_ws) = parse_and_migrate_config("   \n\t  \r\n  ")
            .expect("whitespace config should parse to default");
        assert!(modified_ws);
        assert_eq!(ws_cfg.refresh_interval, 10);
    }

    #[test]
    fn test_parse_and_migrate_valid_and_invalid_json() {
        let invalid = parse_and_migrate_config("{ invalid_json: ");
        assert!(invalid.is_err());
        assert!(invalid.unwrap_err().contains("failed_to_parse_config_file"));

        let default_json = serde_json::to_string(&AppConfig::new()).unwrap();
        let (valid_cfg, _) =
            parse_and_migrate_config(&default_json).expect("valid config should parse");
        assert_eq!(valid_cfg.refresh_interval, 10);
    }
}
