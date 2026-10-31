import { FILE_DOWNLOAD_MAX_BYTES, type FileView } from '@baton/shared'
import { useEffect, useRef, useState } from 'react'
import { useApi } from '../../app/api-context'
import { DOWNLOAD_LIMIT_LABEL, fileErrorMessage } from './file-messages'
import { FilePage, type FileShell } from './file-page'

type Download =
  | { status: 'idle' }
  | { status: 'downloading' }
  | { status: 'failed'; message: string }

// Long enough for the browser to start saving from the link before it is released.
const SAVED_URL_LIFETIME_MS = 60_000

const noticeFor = (view: Extract<FileView, { kind: 'binary' | 'too_large' }>): string => {
  if (view.size > FILE_DOWNLOAD_MAX_BYTES)
    return `文件超过 ${DOWNLOAD_LIMIT_LABEL} 的下载上限，请在执行环境中获取。`
  return view.kind === 'binary'
    ? '此文件暂不支持在线预览，可下载后在本地打开。'
    : '文件超过现有预览上限，可下载后在本地打开。'
}

// Hands the bytes to the browser to save under `name`; returns the link to release.
const saveAs = (blob: Blob, name: string): string => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  return url
}

// A file the reader cannot show, offered as a download of its original bytes. The
// whole file is fetched before it is saved, so a broken transfer is reported here
// and never saved half-written. Hiding or closing the tab abandons a download still
// in flight.
export const UnpreviewableFile = ({
  shell,
  view,
}: {
  shell: FileShell
  view: Extract<FileView, { kind: 'binary' | 'too_large' }>
}) => {
  const api = useApi()
  const { workerId, branch } = shell.route
  const [download, setDownload] = useState<Download>({ status: 'idle' })
  const inFlight = useRef<AbortController | null>(null)
  const savedUrls = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const urls = savedUrls.current
    return () => {
      inFlight.current?.abort()
      urls.forEach((timer, url) => {
        clearTimeout(timer)
        URL.revokeObjectURL(url)
      })
      urls.clear()
    }
  }, [])

  const start = async () => {
    const controller = new AbortController()
    inFlight.current = controller
    setDownload({ status: 'downloading' })
    try {
      const blob = await api.files.download({ workerId, branch }, view.path, controller.signal)
      const url = saveAs(blob, view.name)
      const release = () => {
        URL.revokeObjectURL(url)
        savedUrls.current.delete(url)
      }
      savedUrls.current.set(url, setTimeout(release, SAVED_URL_LIFETIME_MS))
      setDownload({ status: 'idle' })
    } catch (error) {
      if (controller.signal.aborted) {
        setDownload({ status: 'idle' })
        return
      }
      console.error('[files] download failed', error)
      setDownload({ status: 'failed', message: fileErrorMessage(error, '下载失败，请重试') })
    } finally {
      if (inFlight.current === controller) inFlight.current = null
    }
  }

  const downloading = download.status === 'downloading'
  return (
    <FilePage shell={shell}>
      <div className="files-notice">
        <p>{noticeFor(view)}</p>
        <button
          type="button"
          className="ui-button mt-2"
          disabled={downloading || view.size > FILE_DOWNLOAD_MAX_BYTES}
          onClick={() => void start()}
        >
          {downloading ? '正在下载…' : '下载文件'}
        </button>
        {download.status === 'failed' && (
          <p role="alert" className="mt-2 text-ui-danger">
            {download.message}
          </p>
        )}
      </div>
    </FilePage>
  )
}
