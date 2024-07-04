import { type Rectangle, createRandomId, isPointInRect, setOriginalRange } from '@markdan/helper'
import type { MarkdanContext } from './apiCreateApp'
import { getMouseOverElement } from './selection'

export class EditorSelectionRange {
  #ctx: MarkdanContext
  #rectangles: Array<Rectangle & { _originY?: number }> = []

  id: string = createRandomId()

  constructor(
    public anchorBlock: string,
    public anchorOffset: number,
    public focusBlock: string,
    public focusOffset: number,
    ctx: MarkdanContext,
  ) {
    this.#ctx = ctx
  }

  get uid() {
    return this.#ctx.config.uid
  }

  get rectangles() {
    return this.#rectangles
  }

  get isCollapsed() {
    return this.anchorBlock === this.focusBlock
      && this.anchorOffset === this.focusOffset
  }

  /** 物理选区，从左到右，从上到下 */
  get physicsRange() {
    const {
      anchorBlock,
      anchorOffset,
      focusBlock,
      focusOffset,
    } = this
    const { elements } = this.#ctx.schema
    if (anchorBlock === focusBlock) {
      return {
        anchorBlock,
        anchorOffset: Math.min(anchorOffset, focusOffset),
        focusBlock,
        focusOffset: Math.max(anchorOffset, focusOffset),
      }
    }

    const anchorBlockIdx = elements.findIndex(item => item.id === anchorBlock)
    const focusBlockIdx = elements.findIndex(item => item.id === focusBlock)

    if (anchorBlockIdx > focusBlockIdx) {
      return {
        anchorBlock: focusBlock,
        anchorOffset: focusOffset,
        focusBlock: anchorBlock,
        focusOffset: anchorOffset,
      }
    }

    return {
      anchorBlock,
      anchorOffset,
      focusBlock,
      focusOffset,
    }
  }

  /**
   * 闭合选区，删除选区中的内容，并更新选区位置
   */
  collapse() {
    const {
      schema,
      emitter,
    } = this.#ctx
    const elements = schema.elements

    let anchorIdx = elements.findIndex(el => el.id === this.anchorBlock)
    let focusIdx = elements.findIndex(el => el.id === this.focusBlock)
    let { anchorBlock, anchorOffset, focusBlock, focusOffset } = this

    if (anchorIdx === focusIdx) {
      const element = elements[anchorIdx]
      const minOffset = Math.min(anchorOffset, focusOffset)

      schema.replace({
        ...element,
        content: element.content.slice(0, minOffset) + element.content.slice(Math.max(anchorOffset, focusOffset)),
      }, element.id)

      this.setStart(this.anchorBlock, minOffset)
      this.setEnd(this.anchorBlock, minOffset)

      emitter.emit('schema:change')
      emitter.emit('selection:change', this.#ctx.selection.ranges)

      return
    }

    if (anchorIdx > focusIdx) {
      [anchorIdx, focusIdx] = [focusIdx, anchorIdx];
      [anchorBlock, focusBlock] = [focusBlock, anchorBlock];
      [anchorOffset, focusOffset] = [focusOffset, anchorOffset]
    }

    const anchorElement = elements[anchorIdx]
    const focusElement = elements[focusIdx]

    // 删掉 [anchor, focus] 区间中的所有 element
    // 补充一个新拼接好的 element
    // 更新 focus view-line 中，后面所有的 elements 的 groupIds
    const anchorParentId = anchorElement.groupIds?.[0] ?? anchorElement.id
    const focusParentId = focusElement.groupIds?.[0] ?? focusElement.id
    const tailElements = elements.filter((el, index) => focusParentId === el.groupIds[0] && index > focusIdx)
    tailElements.forEach((el) => {
      el.groupIds = [...new Set(el.groupIds.map((id) => {
        return id === focusParentId
          ? anchorParentId
          : id === focusElement.id
            ? anchorElement.id
            : id
      }))]
    })

    schema.replace({
      ...anchorElement,
      content: anchorElement.content.slice(0, anchorOffset) + focusElement.content.slice(focusOffset),
    }, anchorElement.id)
    schema.splice(
      anchorIdx + 1, focusIdx - anchorIdx,
      ...tailElements,
    )

    this.setRange(anchorElement.id, anchorOffset, anchorElement.id, anchorOffset)

    emitter.emit('schema:change')
    emitter.emit('selection:change', this.#ctx.selection.ranges)
  }

  setStart(block: string, offset: number): EditorSelectionRange {
    this.anchorBlock = block
    this.anchorOffset = offset
    return this
  }

  setEnd(block: string, offset: number): EditorSelectionRange {
    this.focusBlock = block
    this.focusOffset = offset
    return this
  }

  setRange(anchorBlock: string, anchorOffset: number, focusBlock: string, focusOffset: number): EditorSelectionRange {
    this.anchorBlock = anchorBlock
    this.anchorOffset = anchorOffset
    this.focusBlock = focusBlock
    this.focusOffset = focusOffset
    return this
  }

  getEndBy(
    type: 'prev' | 'next' | 'line-start' | 'line-end' | 'first' | 'end' | 'prev-line' | 'next-line',
  ) {
    const { elements } = this.#ctx.schema
    const {
      anchorBlock,
      anchorOffset,
      focusBlock,
      focusOffset,
    } = this

    let block: string
    let offset: number

    // 上一行 / 下一行
    if (['prev-line', 'next-line'].includes(type)) {
      const oCursor = this.#ctx.interface.ui.cursor.querySelector(`[data-anchor-block="${anchorBlock}"][data-anchor-offset="${anchorOffset}"][data-focus-block="${focusBlock}"][data-focus-offset="${focusOffset}"]`)!
      const { height, left: x, top } = oCursor.getBoundingClientRect()

      const y = top + (type === 'prev-line' ? -2 : height + 2)

      ;({ block, offset } = getMouseOverElement({ x, y }, this.#ctx))
    } else if (type === 'first') {
      // 第一行行首
      block = elements[0].id
      offset = 0
    } else if (type === 'end') {
      // 最后一行行尾
      block = elements.at(-1)!.id
      offset = elements.at(-1)!.content.length
    } else {
      const elementIdx = elements.findIndex(item => item.id === focusBlock)
      const element = elements[elementIdx]!
      const viewLineId = element.groupIds[0] ?? element.id
      // 当前行首
      if (type === 'line-start') {
        block = viewLineId
        offset = 0
      } else if (type === 'line-end') {
        // 当前行尾
        let idx = elementIdx + 1
        while (elements[idx]?.groupIds[0] === viewLineId) {
          idx++
        }
        block = elements[idx - 1].id
        offset = elements[idx - 1].content.length
      } else if (type === 'prev') {
        // 前一个字符
        if (focusOffset === 0) {
          if (elementIdx === 0) {
            block = element.id
            offset = 0
          } else {
            block = elements[elementIdx - 1].id
            offset = elements[elementIdx - 1].content.length
          }
        } else {
          block = focusBlock
          offset = focusOffset - 1
        }
      } else if (focusOffset === element.content.length) {
        // 后一个字符 type === 'next'
        if (elementIdx === elements.length - 1) {
          block = elements.at(-1)!.id
          offset = focusOffset
        } else {
          block = elements[elementIdx + 1].id
          offset = 0
        }
      } else {
        block = focusBlock
        offset = focusOffset + 1
      }
    }

    // 选区位置检测
    EditorSelectionRange.detectRange(block, offset, this.#ctx)

    return { block, offset }
  }

  static detectRange(block: string, offset: number, ctx: MarkdanContext) {
    const {
      config: {
        containerRect: {
          x,
          y,
          width,
          height,
        },
        scrollbarSize,
      },
      interface: {
        ui: { mainViewer },
        scrollbar,
      },
      emitter,
      schema: { elements },
      renderedElements,
    } = ctx
    try {
      const range = new Range()
      const element = mainViewer.querySelector<HTMLElement>(`[data-id="${block}"]`)!
      setOriginalRange(range, element, offset, 'Both')

      const rect = range.getBoundingClientRect()

      const point = { x: rect.x, y: rect.y }
      const isOutOfContainer = !isPointInRect(point, {
        x,
        y,
        width: width - scrollbarSize - 4,
        height: height - scrollbarSize - 4,
      })

      if (isOutOfContainer) {
        // 当前指针没在容器内部，让容器滚动
        emitter.emit('scrollbar:change', {
          x: point.x > x + width - scrollbarSize
            ? point.x - (x + width - scrollbarSize)
            : point.x < x
              ? point.x - x
              : 0,
          y: point.y > height - y - scrollbarSize
            ? point.y - (height - y - scrollbarSize)
            : point.y < y
              ? point.y - y
              : 0,
          action: 'scrollBy',
        })
      }
    } catch (err) {
      // 当前内容没被渲染到容器，让容器滚动到指定位置

      const element = elements.find(item => item.id === block)!
      const viewLine = renderedElements.find(item => item.id === (element.groupIds[0] ?? element.id))!
      let x = 0
      let y = 0
      if (viewLine.y > height - y - scrollbarSize) {
        y = viewLine.y - (height - y - scrollbarSize)
        x = viewLine.x + viewLine.width
      } else if (viewLine.y < y) {
        y = -scrollbar.scrollY
        x = -scrollbar.scrollX
      }

      // 当前指针没在容器内部，让容器滚动
      emitter.emit('scrollbar:change', {
        x,
        y,
        action: 'scrollBy',
      })
    }
  }
}
