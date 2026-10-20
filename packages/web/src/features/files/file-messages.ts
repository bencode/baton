import type { FileErrorCode } from '@baton/shared'
import { FileApiError } from '../../api/files'

const MESSAGES: Record<FileErrorCode, string> = {
  worker_offline: '执行环境离线',
  worker_timeout: '执行环境未响应，可能需要升级 baton CLI',
  branch_not_found: '分支不存在',
  file_not_found: '文件不存在',
  forbidden_path: '受保护的文件，不提供读取',
  unsupported: '文件内容与类型不符，或格式不支持预览',
  invalid_request: '无效的文件地址',
  unavailable: '执行环境读取失败',
}

export const fileErrorMessage = (error: unknown): string =>
  error instanceof FileApiError && error.code ? MESSAGES[error.code] : '无法加载文件'

const KIB = 1024
const MIB = 1024 * KIB

export const formatFileSize = (bytes: number): string => {
  if (bytes < KIB) return `${bytes} B`
  if (bytes < MIB) return `${(bytes / KIB).toFixed(1)} KiB`
  return `${(bytes / MIB).toFixed(1)} MiB`
}
