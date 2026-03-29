import { OptimizedBuffer, Renderable } from "@opentui/core"
import type { RGBA, RenderContext, RenderableOptions } from "@opentui/core"
import { extend } from "@opentui/solid"

export class PixelBufferRenderable extends Renderable {
  constructor(ctx: RenderContext, options: RenderableOptions<PixelBufferRenderable>) {
    super(ctx, options)
    this.frameBuffer = OptimizedBuffer.create(1, 1, this._ctx.widthMethod, {
      respectAlpha: false,
      id: options.id || `pixelbufferrenderable-${this.id}`,
    })
  }

  clear() {
    if (!this.frameBuffer) return
    this.frameBuffer.buffers.fg.fill(0)
    this.frameBuffer.buffers.bg.fill(0)
    this.requestRender()
  }
  set(x: number, y: number, color: RGBA): void {
    if (
      !this.frameBuffer ||
      x < 0 ||
      y < 0 ||
      x >= this.frameBuffer.width ||
      y >= this.frameBuffer.height * 2
    )
      return

    const arr = y % 2 ? this.frameBuffer.buffers.bg : this.frameBuffer.buffers.fg
    arr.set(color.buffer, (Math.floor(y / 2) * this.frameBuffer.width + x) * 4)
    this.requestRender()
  }
  setBatch(fn: (set: (x: number, y: number, color: RGBA) => void) => void, clear = false) {
    if (!this.frameBuffer) return

    const { width, height } = this.frameBuffer
    const { bg, fg } = this.frameBuffer.buffers
    if (clear) {
      fg.fill(0)
      bg.fill(0)
      for (let i = 3; i < bg.length; i += 4) bg[i] = 1
    }
    const set = (x: number, y: number, color: RGBA) => {
      if (x < 0 || y < 0 || x >= width || y >= height * 2) return

      const arr = y % 2 ? bg : fg
      arr.set(color.buffer, (Math.floor(y / 2) * width + x) * 4)
    }
    fn(set)
    this.requestRender()
  }

  protected override onResize(width: number, height: number): void {
    if (!this.frameBuffer) return

    width = Math.max(1, width)
    height = Math.max(1, height)

    this.frameBuffer.resize(width, height)
    this.frameBuffer.buffers.fg.fill(0)
    this.frameBuffer.buffers.char.fill(0x2580 /*▀*/)

    super.onResize(width, height)
    this.requestRender()
  }

  protected override renderSelf(buffer: OptimizedBuffer): void {
    if (!this.visible || this.isDestroyed || !this.frameBuffer) return
    buffer.drawFrameBuffer(this.x, this.y, this.frameBuffer)
  }
}

export default function () {
  extend({ pixel_buffer: PixelBufferRenderable })
}
declare module "@opentui/solid" {
  interface OpenTUIComponents {
    pixel_buffer: typeof PixelBufferRenderable
  }
}
