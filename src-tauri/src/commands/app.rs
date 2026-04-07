use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DistributionContext {
    channel: Option<String>,
    update_strategy: Option<String>,
    package_name: Option<String>,
    store_name: Option<String>,
    store_url: Option<String>,
    store_instructions: Option<String>,
    version_source_type: Option<String>,
    version_source_url: Option<String>,
}

fn env_value(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[tauri::command]
pub fn get_distribution_context() -> DistributionContext {
    DistributionContext {
        channel: env_value("CLIPRITHM_DISTRIBUTION_CHANNEL"),
        update_strategy: env_value("CLIPRITHM_UPDATE_STRATEGY"),
        package_name: env_value("CLIPRITHM_PACKAGE_NAME"),
        store_name: env_value("CLIPRITHM_STORE_NAME"),
        store_url: env_value("CLIPRITHM_STORE_URL"),
        store_instructions: env_value("CLIPRITHM_STORE_INSTRUCTIONS"),
        version_source_type: env_value("CLIPRITHM_VERSION_SOURCE_TYPE"),
        version_source_url: env_value("CLIPRITHM_VERSION_SOURCE_URL"),
    }
}
