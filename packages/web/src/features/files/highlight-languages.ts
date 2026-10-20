import clojure from 'highlight.js/lib/languages/clojure'
import dart from 'highlight.js/lib/languages/dart'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import elixir from 'highlight.js/lib/languages/elixir'
import erlang from 'highlight.js/lib/languages/erlang'
import fsharp from 'highlight.js/lib/languages/fsharp'
import haskell from 'highlight.js/lib/languages/haskell'
import julia from 'highlight.js/lib/languages/julia'
import lisp from 'highlight.js/lib/languages/lisp'
import matlab from 'highlight.js/lib/languages/matlab'
import nix from 'highlight.js/lib/languages/nix'
import ocaml from 'highlight.js/lib/languages/ocaml'
import powershell from 'highlight.js/lib/languages/powershell'
import scala from 'highlight.js/lib/languages/scala'
import scheme from 'highlight.js/lib/languages/scheme'
import { common } from 'lowlight'

// Grammars for fenced code in rendered documents: lowlight's common set plus the
// languages gamma-reader added. A fence is highlighted only when its info string
// names one of these (or an alias); unknown languages stay plain.
export const highlightLanguages = {
  ...common,
  clojure,
  dart,
  dockerfile,
  elixir,
  erlang,
  fsharp,
  haskell,
  julia,
  lisp,
  matlab,
  nix,
  ocaml,
  powershell,
  scala,
  scheme,
}
