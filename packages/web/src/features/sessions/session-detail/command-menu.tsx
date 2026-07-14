import type { AgentKind } from '@baton/shared'
import { type SlashCommand, slashCommands } from './commands'

type CommandMenuProps = {
  commands: SlashCommand[]
  activeIndex: number
  onPick: (cmd: SlashCommand) => void
}

// Autocomplete list above the textarea while typing "/<name>". The composer owns
// the highlight (arrow keys) and Enter/Tab selection; clicking picks too —
// onMouseDown (not onClick) so the textarea keeps focus.
export const CommandMenu = ({ commands, activeIndex, onPick }: CommandMenuProps) => (
  <div className="mb-2 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
    {commands.map((cmd, i) => (
      <button
        key={cmd.name}
        type="button"
        onMouseDown={e => {
          e.preventDefault()
          onPick(cmd)
        }}
        className={`flex w-full items-baseline gap-2 px-3 py-1.5 text-left ${i === activeIndex ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
      >
        <span className="font-mono text-sm text-blue-700">/{cmd.name}</span>
        <span className="text-xs text-gray-500">{cmd.desc}</span>
      </button>
    ))}
  </div>
)

// /help panel — the full command list with a dismiss button. Shown above the
// composer. agentKind picks which agent's /model presets the list describes.
export const CommandHelp = ({
  agentKind,
  onClose,
}: {
  agentKind: AgentKind
  onClose: () => void
}) => (
  <div className="mx-auto mb-2 max-w-5xl rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
    <div className="mb-1.5 flex items-center justify-between">
      <span className="text-sm font-medium text-gray-700">commands</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="close help"
        className="text-gray-400 hover:text-gray-700"
      >
        ×
      </button>
    </div>
    <ul className="flex flex-col gap-1">
      {slashCommands(agentKind).map(cmd => (
        <li key={cmd.name} className="flex items-baseline gap-2">
          <span className="font-mono text-sm text-blue-700">/{cmd.name}</span>
          <span className="text-xs text-gray-500">{cmd.desc}</span>
        </li>
      ))}
    </ul>
  </div>
)
