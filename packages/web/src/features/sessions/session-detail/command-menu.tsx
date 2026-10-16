import type { AgentKind } from '@baton/shared'
import { CloseIcon } from '../../../components/icons'
import { type SlashCommand, slashCommands } from './commands'

export const CommandMenu = ({
  commands,
  activeIndex,
  onPick,
  id,
}: {
  commands: SlashCommand[]
  activeIndex: number
  onPick(cmd: SlashCommand): void
  id: string
}) => (
  <>
    {commands.map((command, index) => (
      <button
        key={command.name}
        id={`${id}-${index}`}
        type="button"
        role="option"
        aria-selected={index === activeIndex}
        tabIndex={-1}
        className="composer-command-option"
        onMouseDown={event => event.preventDefault()}
        onClick={() => onPick(command)}
      >
        <strong>/{command.name}</strong>
        <span>{command.desc}</span>
      </button>
    ))}
  </>
)

export const CommandHelp = ({ agentKind, onClose }: { agentKind: AgentKind; onClose(): void }) => (
  <div className="composer-command-help">
    <div className="composer-help-heading">
      <h2>会话命令</h2>
      <button
        type="button"
        className="composer-icon-button"
        aria-label="关闭命令帮助"
        onClick={onClose}
      >
        <CloseIcon />
      </button>
    </div>
    <ul>
      {slashCommands(agentKind).map(command => (
        <li key={command.name}>
          <strong>/{command.name}</strong>
          <span>{command.desc}</span>
        </li>
      ))}
    </ul>
  </div>
)
