//! 模型 ID 纯字符串解析、归一化、基准线过滤与代号识别工具（零反代状态依赖）。

use once_cell::sync::Lazy;
use serde::Deserialize;
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Deserialize)]
struct SpecsAliases {
    #[serde(default)]
    aliases: HashMap<String, String>,
}

static MODEL_ALIASES: Lazy<HashMap<String, String>> = Lazy::new(|| {
    let json_str = include_str!("../../resources/model_specs.json");
    serde_json::from_str::<SpecsAliases>(json_str)
        .map(|s| s.aliases)
        .unwrap_or_default()
});

static CLAUDE_TO_GEMINI: Lazy<HashMap<&'static str, &'static str>> = Lazy::new(|| {
    let mut m = HashMap::new();
    m.insert("claude-sonnet-4-6-thinking", "claude-sonnet-4-6");
    m.insert("claude-opus-4-6", "claude-opus-4-6-thinking");
    m.insert("gpt-oss-120b", "gpt-oss-120b-medium");
    m.insert("internal-background-task", "gemini-3.1-flash-lite");
    m
});

/// 获取归一化后的模型 ID (基于 model_specs.json 别名表)
pub fn resolve_alias(model_id: &str) -> String {
    MODEL_ALIASES
        .get(model_id)
        .cloned()
        .unwrap_or_else(|| model_id.to_string())
}

/// 规范化客户端传入的 Claude 模型 ID（去掉前缀/上下文后缀并将短版本号点号转为连字符）
pub fn canonicalize_claude_client_model_id(input: &str) -> String {
    let mut id = input.trim().to_lowercase();
    for prefix in ["anthropic/", "models/"] {
        if let Some(rest) = id.strip_prefix(prefix) {
            id = rest.to_string();
        }
    }
    if let Some(bracket_idx) = id.find('[') {
        if let Some(close_idx) = id[bracket_idx..].find(']') {
            let before = &id[..bracket_idx];
            let after = &id[bracket_idx + close_idx + 1..];
            id = format!("{}{}", before, after);
        }
    }
    if id.contains("claude-open-") {
        id = id.replace("claude-open-", "claude-opus-");
    }
    if !id.contains("claude") {
        return input.trim().to_string();
    }

    let bytes = id.as_bytes();
    let mut out = String::with_capacity(id.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i].is_ascii_digit() {
            let start = i;
            while i < bytes.len() && bytes[i].is_ascii_digit() {
                i += 1;
            }
            if i < bytes.len() && bytes[i] == b'.' {
                let dot = i;
                let mut j = i + 1;
                while j < bytes.len() && bytes[j].is_ascii_digit() {
                    j += 1;
                }
                if j > dot + 1 && j - (dot + 1) <= 2 {
                    out.push_str(&id[start..dot]);
                    out.push('-');
                    out.push_str(&id[dot + 1..j]);
                    i = j;
                    continue;
                }
            }
            out.push_str(&id[start..i]);
        } else {
            out.push(bytes[i] as char);
            i += 1;
        }
    }

    for family in ["opus", "sonnet", "haiku"] {
        let bare = format!("claude-{}-5", family);
        if out == bare {
            out = format!("claude-{}-5-5", family);
        } else if let Some(rest) = out.strip_prefix(&format!("{}-", bare)) {
            if !rest.starts_with(|c: char| c.is_ascii_digit()) {
                out = format!("claude-{}-5-5-{}", family, rest);
            }
        }
        let reversed_bare = format!("claude-5-{}", family);
        if out == reversed_bare {
            out = format!("claude-{}-5-5", family);
        } else if let Some(rest) = out.strip_prefix(&format!("{}-", reversed_bare)) {
            if !rest.starts_with(|c: char| c.is_ascii_digit()) {
                out = format!("claude-{}-5-5-{}", family, rest);
            }
        }
    }

    if out == "claude-5-fable" || out == "claude-fable" {
        out = "claude-fable-5".to_string();
    } else if let Some(rest) = out.strip_prefix("claude-5-fable-") {
        if !rest.starts_with(|c: char| c.is_ascii_digit()) {
            out = format!("claude-fable-5-{}", rest);
        }
    } else if let Some(rest) = out.strip_prefix("claude-fable-") {
        if !rest.starts_with(|c: char| c.is_ascii_digit()) {
            out = format!("claude-fable-5-{}", rest);
        }
    }

    out
}

/// 将模型名映射为标准上游模型 ID
pub fn map_claude_model_to_gemini(input: &str) -> String {
    let canonical = canonicalize_claude_client_model_id(input);

    if let Some(mapped) = CLAUDE_TO_GEMINI.get(canonical.as_str()) {
        return mapped.to_string();
    }

    if canonical.starts_with("gemini-")
        || canonical.contains("thinking")
        || canonical.contains("claude")
    {
        return canonical;
    }

    input.trim().to_string()
}

/// 解析形如 "4.6", "4-6", "3.10", "3" 的 (major, minor) 版本元组（过滤 8 位日期与 >= 1000 非语义数字）
pub fn parse_version_tuple(s: &str) -> Option<(u32, u32)> {
    let s = s.trim().trim_start_matches('v');
    let mut parts = s.split(|c: char| c == '.' || c == '-' || c == '_');
    let major_token = parts.next()?;
    if major_token.len() == 8 && (major_token.starts_with("202") || major_token.starts_with("201"))
    {
        return None;
    }
    let major = major_token.parse::<u32>().ok()?;
    if major >= 1000 {
        return None;
    }
    let minor = if let Some(minor_token) = parts.next() {
        if minor_token.len() == 8
            && (minor_token.starts_with("202") || minor_token.starts_with("201"))
        {
            0
        } else if let Ok(m) = minor_token.parse::<u32>() {
            if m >= 1000 {
                0
            } else {
                m
            }
        } else {
            0
        }
    } else {
        0
    };
    Some((major, minor))
}

/// 从 Claude 模型 ID 或名称中提取 (major, minor) 版本元组
pub fn parse_claude_version_tuple(model: &str) -> Option<(u32, u32)> {
    let lower = model.to_lowercase();
    let pos = lower.find("claude")?;
    let rest = &lower[pos..];
    let tokens: Vec<&str> = rest
        .split(|c: char| c == '-' || c == '_' || c == '.')
        .collect();
    let mut detected: Option<(u32, u32)> = None;
    let mut i = 0;
    while i < tokens.len() {
        let token = tokens[i];
        if token.len() == 8 && (token.starts_with("202") || token.starts_with("201")) {
            i += 1;
            continue;
        }
        if let Ok(major) = token.parse::<u32>() {
            if major >= 1000 {
                i += 1;
                continue;
            }
            let mut minor = 0;
            if i + 1 < tokens.len() {
                let next_tok = tokens[i + 1];
                if !(next_tok.len() == 8
                    && (next_tok.starts_with("202") || next_tok.starts_with("201")))
                {
                    if let Ok(m) = next_tok.parse::<u32>() {
                        if m < 1000 {
                            minor = m;
                            i += 1;
                        }
                    }
                }
            }
            let v = (major, minor);
            detected = Some(detected.map_or(v, |cur| cur.max(v)));
        } else if let Some(v) = parse_version_tuple(token) {
            detected = Some(detected.map_or(v, |cur| cur.max(v)));
        }
        i += 1;
    }
    if detected.is_none() {
        if let Some(ver) = parse_version_tuple(rest) {
            detected = Some(ver);
        }
    }
    detected
}

/// 核心基准线过滤器：过滤历史已下线/内部专用模型，仅保留官方当前有效模型家族
pub fn is_model_compliant_with_baseline(model: &str) -> bool {
    let lower = model.to_lowercase();
    let m = lower.trim();

    if m.contains("-disabled")
        || m.ends_with("_disabled")
        || m.starts_with("chat_")
        || m.starts_with("tab_")
        || m.contains("internal")
        || m.contains("-exp")
        || m.ends_with("-agent")
        || m == "gemini-3-flash"
        || m == "gemini-flash-worker-agy"
    {
        return false;
    }

    if let Some(rest) = m.strip_prefix("gemini-") {
        if let Some((major, _minor)) = parse_version_tuple(rest) {
            if major < 3 {
                return false;
            }
        }
    }

    if m.contains("argon")
        || m == "gemini-pro-orchestrator-g1-pro"
        || m == "gemini-3.1-flash-lite"
        || m == "gemini-3.5-flash-lite"
        || m == "gemini-3.1-flash-image"
        || m == "gemini-3-pro-image"
    {
        return true;
    }

    if m.contains("claude") {
        if (m.starts_with("claude-sonnet-") || m.contains("-5-5")) && m.contains("thinking") {
            return false;
        }

        if let Some(ver) = parse_claude_version_tuple(m) {
            if m.contains("fable") || m.contains("mythos") {
                return ver >= (5, 0);
            }
            return ver >= (4, 6);
        }
        return false;
    }

    if m.contains("gpt") || m.contains("o1") || m.contains("o3") {
        return m == "gpt-oss-120b-medium" || m == "gpt-oss-120b";
    }

    if m.contains("image") {
        return m == "gemini-3.1-flash-image" || m == "gemini-3-pro-image";
    }

    if m.contains("pro") {
        if m.contains("1.5")
            || m.contains("2.0")
            || m.contains("2.5")
            || m.contains("2-5")
            || m == "gemini-3-pro"
            || m.contains("preview")
        {
            return false;
        }
        if m.contains("3.1") {
            return true;
        }
        if let Some(pos) = m.find("gemini-") {
            let rest = &m[pos + 7..];
            if let Some(pro_pos) = rest.find("-pro") {
                if let Some(ver) = parse_version_tuple(&rest[..pro_pos]) {
                    return ver >= (3, 1);
                }
            }
        }
        return false;
    }

    if m.contains("flash") {
        if m.contains("2.5")
            || m.contains("2-5")
            || m.contains("3.5")
            || m.contains("3-5")
            || m.contains("3.6")
            || m.contains("3-6")
            || m.contains("3.7")
            || m.contains("3-7")
        {
            return false;
        }

        if let Some(pos) = m.find("gemini-") {
            let rest = &m[pos + 7..];
            if let Some(flash_pos) = rest.find("-flash") {
                let ver_str = &rest[..flash_pos];
                if let Some(ver) = parse_version_tuple(ver_str) {
                    return ver >= (3, 8);
                }
            }
        }

        if m.contains("3.8") || m.contains("3-8") || m.contains("3.9") || m.contains("3-9") {
            return true;
        }

        return false;
    }

    if m.starts_with("gemini-") {
        let rest = &m["gemini-".len()..];
        if let Some(ver) = parse_version_tuple(rest) {
            return ver.0 >= 4;
        }
        return false;
    }

    false
}

/// 生图模型族变体归一化：剔除尺寸/分辨率/预览后缀，得到基底生图模型 ID
pub fn strip_image_variant_suffix(id: &str) -> String {
    const SUFFIXES: &[&str] = &[
        "-preview",
        "-2k",
        "-4k",
        "-1k",
        "-8k",
        "-16x9",
        "-9x16",
        "-1x1",
        "-3x4",
        "-4x3",
        "-high",
        "-medium",
        "-low",
        "-extra-low",
        "-tiered",
    ];
    let mut base = id.trim().to_lowercase();
    let mut changed = true;
    while changed {
        changed = false;
        for suffix in SUFFIXES {
            if let Some(stripped) = base.strip_suffix(suffix) {
                if !stripped.is_empty() {
                    base = stripped.to_string();
                    changed = true;
                }
            }
        }
    }
    base
}

/// 通用档位后缀剥离：从模型 ID 末尾去掉已知的思考档位/变体后缀，返回基底模型名
pub fn strip_tier_suffix(model: &str) -> String {
    const TIER_SUFFIXES: &[&str] = &[
        "-extra-low",
        "-xhigh",
        "-high",
        "-medium",
        "-low",
        "-thinking",
        "-tiered",
        "@default",
    ];
    let lower = model.trim().to_lowercase();
    for suffix in TIER_SUFFIXES {
        if lower.ends_with(suffix) {
            let prefix_len = model.len() - suffix.len();
            return model[..prefix_len].to_string();
        }
    }
    model.trim().to_string()
}

fn is_generic_gemini_role_token(token: &str) -> bool {
    matches!(
        token,
        "pro"
            | "flash"
            | "ultra"
            | "nano"
            | "lite"
            | "image"
            | "agent"
            | "exp"
            | "preview"
            | "disabled"
            | "thinking"
            | "tiered"
            | "models"
            | "model"
            | "wtu"
            | "weekly"
            | "5h"
            | "7d"
            | "hour"
            | "quota"
            | "pool"
            | "default"
            | "standard"
    )
}

fn extract_gemini_codename_with_version(model_name: &str) -> Option<(String, String)> {
    let lower = model_name.trim().to_lowercase();
    let stripped = strip_tier_suffix(&lower);
    if let Some(after_gemini) = stripped.strip_prefix("gemini-") {
        if let Some((ver_part, rest)) = after_gemini.split_once('-') {
            let major_ok = ver_part
                .split('.')
                .next()
                .and_then(|m| m.parse::<u32>().ok())
                .map(|m| m >= 4)
                .unwrap_or(false);
            if major_ok {
                let code = rest.split('-').next().unwrap_or("").trim();
                if !code.is_empty()
                    && code.bytes().any(|b| b.is_ascii_alphabetic())
                    && !is_generic_gemini_role_token(code)
                {
                    return Some((ver_part.to_string(), code.to_string()));
                }
            }
        }
    }
    if lower.contains("argon") || stripped == "gemini-pro-orchestrator-g1-pro" {
        return Some(("4".to_string(), "argon".to_string()));
    }
    None
}

/// 从模型名中提取 Gemini 4+ 专属代号（如 `argon`、`hydrogen`、`carbon` 等）
pub fn extract_gemini4_codename(model_name: &str) -> Option<String> {
    extract_gemini_codename_with_version(model_name).map(|(_, code)| code)
}

/// 从配额分组名称 / bucket_id 中识别专属 Gemini 4+ 代号
pub fn extract_group_g4_codename(
    display_name_lower: &str,
    bucket_id_lower: &str,
) -> Option<String> {
    if display_name_lower.contains("argon") || bucket_id_lower.contains("argon") {
        return Some("argon".to_string());
    }
    for text in [display_name_lower, bucket_id_lower] {
        let normalized = text.replace('_', "-").replace(' ', "-");
        let parts: Vec<&str> = normalized.split('-').filter(|s| !s.is_empty()).collect();
        for win in parts.windows(3) {
            if win[0] == "gemini" {
                let is_v4_plus = win[1]
                    .split('.')
                    .next()
                    .and_then(|m| m.parse::<u32>().ok())
                    .map(|m| m >= 4)
                    .unwrap_or(false);
                if is_v4_plus
                    && win[2].bytes().any(|b| b.is_ascii_alphabetic())
                    && !is_generic_gemini_role_token(win[2])
                {
                    return Some(win[2].to_string());
                }
                if win[2] == "wtu"
                    && win[1].bytes().any(|b| b.is_ascii_alphabetic())
                    && !is_generic_gemini_role_token(win[1])
                {
                    return Some(win[1].to_string());
                }
            }
        }
    }
    None
}

/// 结合当前账号模型目录动态收集到的代号集合，从配额分组识别专属 Gemini 4+ 代号
pub fn extract_group_g4_codename_with_known(
    display_name_lower: &str,
    bucket_id_lower: &str,
    known_codenames: &[String],
) -> Option<String> {
    if let Some(code) = extract_group_g4_codename(display_name_lower, bucket_id_lower) {
        return Some(code);
    }
    known_codenames
        .iter()
        .find(|code| {
            !code.is_empty()
                && (display_name_lower.contains(code.as_str())
                    || bucket_id_lower.contains(code.as_str()))
        })
        .cloned()
}

/// 将具体模型 ID 归一化为标准族/保护组标识
pub fn normalize_to_standard_id(model_name: &str) -> Option<String> {
    let lower = model_name.to_lowercase();
    if lower.contains("-disabled") || lower.ends_with("_disabled") {
        return None;
    }

    if let Some((ver, code)) = extract_gemini_codename_with_version(&lower) {
        return Some(format!("gemini-{}-{}", ver, code));
    }

    if lower.contains("image") {
        if lower.contains("flash") {
            return Some("gemini-3.1-flash-image".to_string());
        }
        return Some("gemini-3-pro-image".to_string());
    }

    if lower.contains("flash") {
        if lower.contains("3-flash")
            || lower.contains("2.5-flash")
            || lower.contains("2.0-flash")
            || lower.contains("1.5-flash")
        {
            return Some("gemini-3-flash".to_string());
        }
        let base = strip_tier_suffix(&lower);
        return Some(base);
    }

    if lower.contains("pro") && !lower.contains("image") {
        if lower.contains("3.1-pro") {
            return Some("gemini-3.1-pro".to_string());
        }
        if lower.contains("3-pro") {
            return Some("gemini-3-pro-high".to_string());
        }
        let base = strip_tier_suffix(&lower);
        return Some(base);
    }

    if lower.contains("claude")
        || lower.contains("opus")
        || lower.contains("sonnet")
        || lower.contains("haiku")
        || lower.contains("fable")
    {
        return Some("claude".to_string());
    }

    None
}

fn gemini_flash_version(model: &str, suffix: &str) -> Option<(u32, u32)> {
    let lower = model.to_lowercase();
    let rest = lower.strip_prefix("gemini-")?;
    let version = rest.strip_suffix(suffix)?;
    if version.is_empty() || version.contains("-flash") || version.contains('-') {
        return None;
    }
    parse_version_tuple(version)
}

/// 从给定模型集合中挑选预热兜底的轻量 Flash 模型（优先最新 `-flash-low`，其次无后缀 `-flash`）
pub fn pick_background_model(models: &HashSet<String>) -> Option<String> {
    let newest = |suffix: &str| -> Option<String> {
        models
            .iter()
            .filter_map(|m| gemini_flash_version(m, suffix).map(|v| (v, m.clone())))
            .max_by(|a, b| a.0.cmp(&b.0).then_with(|| b.1.cmp(&a.1)))
            .map(|(_, model)| model)
    };

    newest("-flash-low").or_else(|| newest("-flash"))
}
