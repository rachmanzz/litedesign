import type { LayerName } from '@litedesign/core'
import type { Gap, Graph, GraphNode, Issue } from '@litedesign/core/types'

export type Viewport = { w: number; h: number }

export type OverlayOptions = {
  enabled: boolean
  /** Layers to show. Omit to keep the ones the user last chose. */
  layers?: LayerName[]
  /**
   * Spotlight one component: everything else dims and the target is outlined.
   * A selector string sets it, null clears it, omit to leave it unchanged.
   * Focusing scrolls the target to the center of the viewport.
   */
  focus?: string | null
}

/** What the page reports after applying an overlay change. */
export type OverlayResult = {
  enabled: boolean
  layers: LayerName[]
  /** The focused selector as the page reports it; null when nothing is. */
  focus: string | null
}

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
 * A name the human pinned onto a part of the page, so the agent can address
 * it by name. Labels belong to the human; the driver surface is read-only.
 */
export type LabelMark = {
  label: string
  selector: string
}

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
  /** Draw or clear the overlay in the page the human is looking at. */
  overlay(options: OverlayOptions): Promise<OverlayResult>
  /** Names the human pinned in the page the human is looking at. */
  labels(): Promise<LabelMark[] | null>
  close(): Promise<void>
  /**
   * Block until a page with this URL connects. Every driver implements it:
   * `await_page` must answer from a reading, never from assuming `open`
   * succeeded once.
   */
  waitForPage(url: string, timeoutMs: number): Promise<WaitResult>
}
