import { useState } from 'react'
import { readingSurfaceProps, useReadingPreferences } from './reading-preferences'

// An image file: fitted to the tab by default, or at its own size to inspect
// detail. Remount with a new key when `src` changes so a past error clears.
export const ImageView = ({ src, name }: { src: string; name: string }) => {
  const [preferences] = useReadingPreferences()
  const [actualSize, setActualSize] = useState(false)
  const [failed, setFailed] = useState(false)
  return (
    <div {...readingSurfaceProps(preferences)}>
      <div className="image-view">
        <div className="image-view-toolbar">
          <button
            type="button"
            className="ui-button"
            aria-pressed={actualSize}
            onClick={() => setActualSize(value => !value)}
          >
            原始大小
          </button>
        </div>
        {failed ? (
          <p role="alert" className="files-notice text-ui-danger">
            无法显示图片。
          </p>
        ) : (
          <img
            src={src}
            alt={name}
            className={actualSize ? 'image-view-actual' : 'image-view-fit'}
            onError={() => setFailed(true)}
          />
        )}
      </div>
    </div>
  )
}
