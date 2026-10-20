import type { FileView } from '@baton/shared'
import { useState } from 'react'
import { useApi } from '../../app/api-context'
import {
  ImageRenderer,
  type ImageSize,
  ImageSizeToggle,
} from '../../components/renderers/image/image-renderer'
import { useIsMobile } from '../../hooks/use-media-query'
import { FilePage, type FileShell } from './file-page'

// An image file, loaded again on every refresh. Phones keep it fitted and zoom
// with the system pinch.
export const ImageFile = ({
  shell,
  view,
}: {
  shell: FileShell
  view: Extract<FileView, { kind: 'image' }>
}) => {
  const api = useApi()
  const mobile = useIsMobile()
  const [size, setSize] = useState<ImageSize>('fit')
  const { workerId, branch } = shell.route
  return (
    <FilePage shell={shell} tools={!mobile && <ImageSizeToggle value={size} onChange={setSize} />}>
      <ImageRenderer
        src={api.files.rawUrl({ workerId, branch }, view.path, shell.revision)}
        alt={view.name}
        size={mobile ? 'fit' : size}
      />
    </FilePage>
  )
}
