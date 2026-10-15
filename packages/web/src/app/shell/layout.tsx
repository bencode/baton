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
}: {
  left: ReactNode
  detail: ReactNode
  isMobile: boolean
}) => {
  const resourcePanel = usePanelRef()
  const desktopWidth = useRef(274)
  const previousMobile = useRef(isMobile)
  useLayoutEffect(() => {
    if (previousMobile.current === isMobile) return
    previousMobile.current = isMobile
    resourcePanel.current?.resize(isMobile ? '0px' : `${desktopWidth.current}px`)
  }, [isMobile, resourcePanel])
  const layout = useDefaultLayout({
    id: 'baton-workbench-split-v1',
    panelIds: PANEL_IDS,
    storage: localStorage,
  })
  return (
    <Group
      orientation="horizontal"
      className="min-h-0 flex-1"
      defaultLayout={layout.defaultLayout}
      onLayoutChanged={isMobile ? undefined : layout.onLayoutChanged}
    >
      <Panel
        id="resources"
        panelRef={resourcePanel}
        onResize={size => {
          if (!isMobile && size.inPixels >= 240) desktopWidth.current = size.inPixels
        }}
        defaultSize="274px"
        minSize={isMobile ? '0px' : '240px'}
        maxSize={isMobile ? '0px' : '400px'}
        groupResizeBehavior="preserve-pixel-size"
      >
        {left}
      </Panel>
      {!isMobile && (
        <Separator className="w-px bg-ui-border transition-colors hover:bg-ui-accent" />
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
