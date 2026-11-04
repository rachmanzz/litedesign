import type { Gap, Graph, GraphNode, Issue } from '@litedesign/core/types'

export type Viewport = { w: number; h: number }

export type ShotOptions = {
  selector?: string
  fullPage?: boolean
}

export type AnnotateOptions = {
  /** Scroll this element into view before capturing. */
  selector?: string
  /** Annotate only these rules. Omit to annotate every issue. */
  rules?: string[]
}

export type MeasuredGap = Pick<Gap, 'axis' | 'distance' | 'kind'> & {
  /** The neighbour on the other side of the gap. */
  to: string
}

export type MeasureResult = {
  id: string
  selector: string
  tag: string
  /** Document coordinates, matching the overlay. */
  rect: GraphNode['rect']
  styles: GraphNode['styles']
  gaps: MeasuredGap[]
}

export type WaitResult =
  | { status: 'ready'; url: string }
  | { status: 'timeout' }
  | { status: 'mismatch'; url: string }

/**
 * The tool layer never knows which driver is active. Playwright and the
 * extension bridge implement the same surface.
 */
export type Driver = {
  open(url: string, viewport?: Viewport): Promise<void>
  graph(): Promise<Graph>
  issues(rules?: string[]): Promise<Issue[]>
  measure(selector: string): Promise<MeasureResult>
  screenshot(options?: ShotOptions): Promise<Buffer>
  annotate(options?: AnnotateOptions): Promise<Buffer>
  close(): Promise<void>
  /** Extension only: block until a page with this URL connects. */
  waitForPage?(url: string, timeoutMs: number): Promise<WaitResult>
}
