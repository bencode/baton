import { type ReactNode, useLayoutEffect, useRef } from 'react'
import { Group, Panel, Separator, useDefaultLayout, usePanelRef } from 'react-resizable-panels'
import { MobileDrawer } from '../mobile-drawer'

const PANEL_IDS = ['resources', 'detail']

// The content panel stays mounted at every breakpoint. On phones the resource panel
// has zero width and the same navigation is rendered inside the drawer.
export const DesktopSplit = ({
  left,
  detail,
  isMobile,
  collapsed,
}: {
  left: ReactNode
  detail: ReactNode
  isMobile: boolean
  collapsed: boolean
}) => {
  const resourcePanel = usePanelRef()
  const desktopWidth = useRef(288)
  const hidden = isMobile || collapsed
  const previousHidden = useRef(hidden)
  const restoring = useRef(false)
  if (previousHidden.current !== hidden) restoring.current = true
  useLayoutEffect(() => {
    if (previousHidden.current === hidden) return
    previousHidden.current = hidden
    // Group re-registers changed constraints during commit; restore after it settles.
    const targetWidth = desktopWidth.current
    const frame = requestAnimationFrame(() => {
      resourcePanel.current?.resize(hidden ? '0px' : `${targetWidth}px`)
      restoring.current = false
    })
    return () => cancelAnimationFrame(frame)
  }, [hidden, resourcePanel])
  const layout = useDefaultLayout({
    id: 'baton-workbench-split-v1',
    panelIds: PANEL_IDS,
    storage: localStorage,
  })
  return (
    <Group
      orientation="horizontal"
      className="wb-split"
      defaultLayout={layout.defaultLayout}
      onLayoutChanged={hidden ? undefined : layout.onLayoutChanged}
    >
      <Panel
        id="resources"
        panelRef={resourcePanel}
        onResize={size => {
          if (
            hidden ||
            restoring.current ||
            window.matchMedia('(max-width: 767px)').matches ||
            size.inPixels < 220
          )
            return
          desktopWidth.current = size.inPixels
        }}
        defaultSize={hidden ? '0px' : '288px'}
        minSize={hidden ? '0px' : '220px'}
        maxSize={hidden ? '0px' : '100%'}
        groupResizeBehavior="preserve-pixel-size"
      >
        <div
          className="h-full"
          inert={hidden}
          style={{ visibility: hidden ? 'hidden' : undefined }}
        >
          {left}
        </div>
      </Panel>
      {!hidden && (
        <Separator className="wb-separator" aria-label="调整导航宽度" title="拖动调整导航宽度" />
      )}
      <Panel id="detail" minSize={isMobile ? '0px' : '320px'}>
        {detail}
      </Panel>
    </Group>
  )
}

// Keep the detail pane in DesktopSplit at every viewport width so a breakpoint
// change cannot unmount open conversations or discard their drafts.
export const MobileMain = ({
  left,
  drawerOpen,
  onCloseDrawer,
}: {
  left: ReactNode
  drawerOpen: boolean
  onCloseDrawer: () => void
}) => (
  <MobileDrawer open={drawerOpen} onClose={onCloseDrawer}>
    {left}
  </MobileDrawer>
)
