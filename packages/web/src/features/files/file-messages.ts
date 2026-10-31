import { FILE_DOWNLOAD_MAX_BYTES, type FileErrorCode } from '@baton/shared'
import { FileApiError } from '../../api/files'

const KIB = 1024
const MIB = 1024 * KIB

export const DOWNLOAD_LIMIT_LABEL = `${FILE_DOWNLOAD_MAX_BYTES / MIB} MiB`

const MESSAGES: Record<FileErrorCode, string> = {
  worker_offline: '执行环境离线',
  worker_timeout: '执行环境未响应，可能需要升级 baton CLI',
  branch_not_found: '分支不存在',
  file_not_found: '文件不存在',
  forbidden_path: '受保护的文件，不提供读取',
  unsupported: '文件内容与类型不符，或格式不支持预览',
  file_too_large: `文件超过 ${DOWNLOAD_LIMIT_LABEL} 的下载上限`,
  invalid_request: '无效的文件地址',
  unavailable: '执行环境读取失败',
}

// `fallback` names the failed action when the error carries no known code.
export const fileErrorMessage = (error: unknown, fallback = '无法加载文件'): string =>
  error instanceof FileApiError && error.code ? MESSAGES[error.code] : fallback

export const formatFileSize = (bytes: number): string => {
  if (bytes < KIB) return `${bytes} B`
  if (bytes < MIB) return `${(bytes / KIB).toFixed(1)} KiB`
  return `${(bytes / MIB).toFixed(1)} MiB`
}
