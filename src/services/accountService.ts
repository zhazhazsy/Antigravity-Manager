import i18n from '../i18n';
import { Account, ActiveClientsStatus, QuotaData, ImportAccountEntry, BatchImportResult } from '../types/account';
export type { ImportAccountEntry, BatchImportResult };
import { request as invoke } from '../utils/request';

// 检查环境 (可选)
function ensureTauriEnvironment() {
    if (typeof invoke !== 'function') {
        throw new Error(i18n.t('common.tauri_api_not_loaded'));
    }
}

export async function listAccounts(): Promise<Account[]> {
    const response = await invoke<any>('list_accounts');
    if (response && typeof response === 'object' && Array.isArray(response.accounts)) {
        return response.accounts;
    }
    if (Array.isArray(response)) {
        return response;
    }
    return [];
}

export async function getCurrentAccount(): Promise<Account | null> {
    return await invoke('get_current_account');
}

export async function getActiveClientsStatus(): Promise<ActiveClientsStatus> {
    const res = await invoke<ActiveClientsStatus>('get_active_clients_status');
    return res || {};
}

export async function addAccount(email: string, refreshToken: string): Promise<Account> {
    return await invoke('add_account', { email, refreshToken });
}

export async function deleteAccount(accountId: string): Promise<void> {
    return await invoke('delete_account', { accountId });
}

export async function deleteAccounts(accountIds: string[]): Promise<void> {
    return await invoke('delete_accounts', { accountIds });
}

export async function switchAccount(accountId: string, targetIde?: string): Promise<void> {
    return await invoke('switch_account', { accountId, targetIde });
}

export async function fetchAccountQuota(accountId: string): Promise<QuotaData> {
    return await invoke('fetch_account_quota', { accountId });
}

export interface RefreshStats {
    total: number;
    success: number;
    failed: number;
    details: string[];
}

export async function refreshAllQuotas(): Promise<RefreshStats> {
    return await invoke('refresh_all_quotas');
}

// OAuth
export async function startOAuthLogin(oauthClientKey?: string): Promise<Account> {
    ensureTauriEnvironment();

    try {
        return await invoke('start_oauth_login', oauthClientKey ? { oauthClientKey } : undefined);
    } catch (error) {
        if (typeof error === 'string') {
            if (error.includes('Refresh Token') || error.includes('refresh_token')) {
                throw error;
            }
            throw i18n.t('accounts.add.oauth_error', { error });
        }
        throw error;
    }
}

export async function completeOAuthLogin(): Promise<Account> {
    ensureTauriEnvironment();
    try {
        return await invoke('complete_oauth_login');
    } catch (error) {
        if (typeof error === 'string') {
            if (error.includes('Refresh Token') || error.includes('refresh_token')) {
                throw error;
            }
            throw i18n.t('accounts.add.oauth_error', { error });
        }
        throw error;
    }
}

export async function cancelOAuthLogin(): Promise<void> {
    ensureTauriEnvironment();
    return await invoke('cancel_oauth_login');
}

export interface OAuthClientInfo {
    key: string;
    label: string;
    client_id: string;
    is_active: boolean;
    is_builtin: boolean;
    is_gcp_tos?: boolean;
}

export async function prepareOAuthUrl(oauthClientKey?: string): Promise<string> {
    const res = await invoke<any>('prepare_oauth_url', oauthClientKey ? { oauthClientKey } : undefined);
    const url = typeof res === 'string' ? res : res?.url;
    return url || '';
}

export async function listOAuthClients(): Promise<OAuthClientInfo[]> {
    const res = await invoke<{ clients: OAuthClientInfo[] }>('list_oauth_clients');
    if (res && Array.isArray(res.clients)) return res.clients;
    return (res as unknown as OAuthClientInfo[]) || [];
}

export async function getActiveOAuthClient(): Promise<string> {
    const res = await invoke<{ client_key: string } | string>('get_active_oauth_client');
    if (typeof res === 'string') return res;
    return res?.client_key || '';
}

export async function setActiveOAuthClient(clientKey: string): Promise<void> {
    return await invoke('set_active_oauth_client', { clientKey });
}

// 导入
export async function batchImportAccounts(entries: ImportAccountEntry[]): Promise<BatchImportResult> {
    return await invoke<BatchImportResult>('batch_import_accounts', { entries });
}

export async function importV1Accounts(): Promise<Account[]> {
    return await invoke('import_v1_accounts');
}

export async function importFromDb(targetIde?: string): Promise<Account[]> {
    const res = await invoke<any>('import_from_db', { targetIde });
    if (Array.isArray(res)) return res;
    return res ? [res] : [];
}

export async function importFromCustomDb(path: string): Promise<Account> {
    return await invoke('import_custom_db', { path });
}

export async function syncAccountFromDb(): Promise<Account | null> {
    return await invoke('sync_account_from_db');
}

export async function clearAccountForbidden(accountId: string): Promise<void> {
    return await invoke('clear_account_forbidden', { accountId });
}

/**
 * 重新排序账号列表
 * @param accountIds 按新顺序排列的账号ID数组
 */
export async function reorderAccounts(accountIds: string[]): Promise<void> {
    return await invoke('reorder_accounts', { accountIds });
}

// 预热相关
export async function warmUpAllAccounts(): Promise<string> {
    return await invoke('warm_up_all_accounts');
}

export async function warmUpAccount(accountId: string): Promise<string> {
    return await invoke('warm_up_account', { accountId });
}

// 导出账号相关
export interface ExportAccountItem {
    email: string;
    refresh_token: string;
}

export interface ExportAccountsResponse {
    accounts: ExportAccountItem[];
}

export async function exportAccounts(accountIds: string[]): Promise<ExportAccountsResponse> {
    return await invoke('export_accounts', { accountIds });
}

// 自定义标签相关
export async function updateAccountLabel(accountId: string, label: string): Promise<void> {
    return await invoke('update_account_label', { accountId, label });
}

// GCP 项目 ID 相关
export async function updateAccountProjectId(accountId: string, projectId: string | null): Promise<void> {
    return await invoke('update_account_project_id', { accountId, projectId: projectId || null });
}

export async function autoFetchAccountProjectId(accountId: string): Promise<string> {
    return await invoke('auto_fetch_account_project_id', { accountId });
}

// 解除 403 模型冻结
export async function removeAccountForbiddenModel(accountId: string, model?: string): Promise<boolean> {
    return await invoke('remove_account_forbidden_model', { accountId, model: model || null });
}
