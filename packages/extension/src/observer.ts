export type ObserverOptions = {
  root: Element
  debounceMs?: number
  onChange(): void
}

export type Observer = {
  stop(): void
}

const DEFAULT_DEBOUNCE = 150

/**
 * Rebuilds after the page changes. MutationObserver catches DOM edits,
 * ResizeObserver catches layout-only changes, and window resize catches
 * viewport reflow. All paths share one debounce so a burst of mutations
 * produces one measurement pass.
 */
export function observeChanges(options: ObserverOptions): Observer {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE
  let timer: ReturnType<typeof setTimeout> | undefined

  const schedule = (): void => {
    if (timer !== undefined) clearTimeout(timer)

    timer = setTimeout(() => {
      timer = undefined
      options.onChange()
    }, debounceMs)
  }

  const mutation = new MutationObserver(schedule)
  mutation.observe(options.root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden'],
  })

  const resize = new ResizeObserver(schedule)
  resize.observe(options.root)

  const onResize = (): void => schedule()
  const onNavigate = (): void => schedule()

  window.addEventListener('resize', onResize)
  window.addEventListener('popstate', onNavigate)
  window.addEventListener('hashchange', onNavigate)

  return {
    stop(): void {
      if (timer !== undefined) clearTimeout(timer)
      mutation.disconnect()
      resize.disconnect()
      window.removeEventListener('resize', onResize)
      window.removeEventListener('popstate', onNavigate)
      window.removeEventListener('hashchange', onNavigate)
    },
  }
}
