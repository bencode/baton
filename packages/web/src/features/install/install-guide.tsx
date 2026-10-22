import { Modal } from '../../components/modal'

export const InstallGuide = ({ onClose }: { onClose(): void }) => (
  <Modal title="添加到主屏幕" onClose={onClose}>
    <ol className="list-decimal space-y-2 pl-5 text-sm text-ui-text">
      <li>点浏览器的「分享」按钮</li>
      <li>选择「添加到主屏幕」</li>
      <li>从主屏幕上的 baton 图标打开</li>
    </ol>
    <p className="mt-4 text-xs text-ui-muted">如果主屏幕上的 baton 要求登录，登录一次即可。</p>
  </Modal>
)
