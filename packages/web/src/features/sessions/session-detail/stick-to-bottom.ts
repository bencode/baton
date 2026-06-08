// Stick-to-bottom: auto-scroll the transcript only while the view is pinned to
// (or within `threshold` px of) the bottom. Reading earlier messages — i.e. the
// user has scrolled up past the threshold — must not be interrupted by streaming
// events. The threshold absorbs sub-pixel rounding and a tall trailing message.
export const STICK_THRESHOLD = 60

// Pure decision from scroll metrics: is the viewport pinned to the bottom?
// Negative distance (content shorter than the viewport) counts as pinned.
export const atBottom = (
  scrollHeight: number,
  scrollTop: number,
  clientHeight: number,
  threshold: number = STICK_THRESHOLD,
): boolean => scrollHeight - scrollTop - clientHeight <= threshold
