import type { ReactNode } from 'react'
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels'
import { MobileDrawer } from '../mobile-drawer'

const PANEL_IDS = ['resources', 'detail']

// Desktop: the resizable two-pane split. useDefaultLayout lives here so its
// stored layout is only read when this pane is actually mounted — phones skip it.
export const DesktopSplit = ({ left, detail }: { left: ReactNode; detail: ReactNode }) => {
  const layout = useDefaultLayout({
    id: 'baton-main-split',
    panelIds: PANEL_IDS,
    storage: localStorage,
  })
  return (
    <Group
      orientation="horizontal"
      className="min-h-0 flex-1"
      defaultLayout={layout.defaultLayout}
      onLayoutChanged={layout.onLayoutChanged}
    >
      <Panel id="resources" defaultSize="22%" minSize="1%" maxSize="50%">
        {left}
      </Panel>
      <Separator className="w-px bg-gray-200 transition-colors hover:bg-gray-300" />
      <Panel id="detail" minSize="1%">
        {detail}
      </Panel>
    </Group>
  )
}

// Phone: single column with the rail tucked behind a slide-in drawer.
export const MobileMain = ({
  left,
  detail,
  drawerOpen,
  onCloseDrawer,
}: {
  left: ReactNode
  detail: ReactNode
  drawerOpen: boolean
  onCloseDrawer: () => void
}) => (
  <div className="relative min-h-0 flex-1">
    {detail}
    <MobileDrawer open={drawerOpen} onClose={onCloseDrawer}>
      {left}
    </MobileDrawer>
  </div>
)
