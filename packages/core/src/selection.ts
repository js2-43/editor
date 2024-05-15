import type { Rectangle } from '@markdan/helper'
import { amendTop, getBlockIdByNode, getBlockPositionByClick, getIntersectionArea, getModifierKeys, isOnlyAltKey, isOnlyShiftKey, isPointInRect, isRectContainRect, isRectCross, setOriginalRange } from '@markdan/helper'
import type { MarkdanViewBlock } from '@markdan/engine'
import type { MarkdanContext } from './apiCreateApp'

export class EditorSelectionRange {
  #ctx: MarkdanContext
  #rectangles: Rectangle[] = []

  constructor(
    public anchorBlock: string,
    public anchorOffset: number,
    public focusBlock: string,
    public focusOffset: number,
    ctx: MarkdanContext,
  ) {
    this.#ctx = ctx
    this.setRangeRectangle()
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

  /**
   * 闭合选区，删除选区中的内容，并更新选区位置
   */
  collapse() {
    const {
      schema: {
        elements,
      },
      emitter,
    } = this.#ctx

    let anchorIdx = elements.findIndex(el => el.id === this.anchorBlock)
    let focusIdx = elements.findIndex(el => el.id === this.focusBlock)
    let { anchorBlock, anchorOffset, focusBlock, focusOffset } = this

    if (anchorIdx === focusIdx) {
      const element = elements[anchorIdx]
      elements.splice(anchorIdx, 1, {
        ...element,
        content: element.content.slice(0, Math.min(anchorOffset, focusOffset)) + element.content.slice(Math.max(anchorOffset, focusOffset)),
      })
      emitter.emit('schema:change', this.#ctx.schema)

      this.setEnd(this.anchorBlock, anchorOffset)
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
    elements.splice(anchorIdx, focusIdx - anchorIdx + 1, {
      ...anchorElement,
      content: anchorElement.content.slice(0, anchorOffset) + focusElement.content.slice(focusOffset),
    })

    emitter.emit('schema:change', this.#ctx.schema)

    this.setRange(anchorBlock, anchorOffset, anchorBlock, anchorOffset)
    emitter.emit('selection:change', this.#ctx.selection.ranges)
  }

  setStart(block: string, offset: number): EditorSelectionRange {
    this.anchorBlock = block
    this.anchorOffset = offset
    this.setRangeRectangle()
    return this
  }

  setEnd(block: string, offset: number): EditorSelectionRange {
    this.focusBlock = block
    this.focusOffset = offset
    this.setRangeRectangle()
    return this
  }

  setRange(anchorBlock: string, anchorOffset: number, focusBlock: string, focusOffset: number): EditorSelectionRange {
    this.anchorBlock = anchorBlock
    this.anchorOffset = anchorOffset
    this.focusBlock = focusBlock
    this.focusOffset = focusOffset
    this.setRangeRectangle()
    return this
  }

  setRangeRectangle() {
    if (this.isCollapsed) {
      // 闭合选区无需渲染
      this.#rectangles = []
      return
    }

    const {
      config: {
        containerRect: {
          x,
          y,
        },
      },
      schema: { elements },
      interface: {
        ui: { mainViewer },
        scrollbar: {
          scrollX,
          scrollY,
        },
      },
      renderedElements,
    } = this.#ctx

    const {
      anchorBlock,
      anchorOffset,
      focusBlock,
      focusOffset,
    } = this

    const rectangles: Rectangle[] = []

    const anchorBlockElement = elements.find(el => el.id === anchorBlock)!
    const focusBlockElement = elements.find(el => el.id === focusBlock)!

    const startViewLineId = anchorBlockElement.groupIds[0] ?? anchorBlock
    const endViewLineId = focusBlockElement.groupIds[0] ?? focusBlock

    const startViewLineRenderedElement = renderedElements.find(b => b.id === startViewLineId)!
    const endViewLineRenderedElement = renderedElements.find(b => b.id === endViewLineId)!

    const anchorDom = mainViewer.querySelector<HTMLElement>(`[data-id="${anchorBlock}"]`)
    const focusDom = mainViewer.querySelector<HTMLElement>(`[data-id="${focusBlock}"]`)

    if (!anchorDom || !focusDom) {
      throw new Error('Set range rectangle failed.')
    }
    const originalRange = new Range()

    setOriginalRange(originalRange, anchorDom, anchorOffset)

    let { left: startLeft, top: startTop } = (anchorDom.firstChild?.textContent?.length ?? 0) === 0
      ? anchorDom.getBoundingClientRect()
      : originalRange.getBoundingClientRect()

    setOriginalRange(originalRange, focusDom, focusOffset)

    let { left: endLeft, top: endTop } = (focusDom.firstChild?.textContent?.length ?? 0) === 0
      ? focusDom.getBoundingClientRect()
      : originalRange.getBoundingClientRect()

    startLeft = startLeft - x
    startTop = amendTop(startTop - y, startViewLineRenderedElement.y - scrollY, startViewLineRenderedElement.lineHeight, startViewLineRenderedElement.height)

    endLeft = endLeft - x
    endTop = amendTop(endTop - y, endViewLineRenderedElement.y - scrollY, endViewLineRenderedElement.lineHeight, endViewLineRenderedElement.height)

    if (startTop === endTop) {
      // 在同一行选取
      rectangles.push({
        x: Math.min(startLeft, endLeft),
        y: startTop,
        width: Math.abs(startLeft - endLeft),
        height: startViewLineRenderedElement.lineHeight,
      })
    } else {
      // 跨行选取
      const startViewLine = mainViewer.querySelector<HTMLElement>(`[data-id="${startViewLineId}"]`)!
      const endViewLine = mainViewer.querySelector<HTMLElement>(`[data-id="${endViewLineId}"]`)!

      let start
      let end

      if (startTop > endTop) {
        setOriginalRange(originalRange, focusDom, focusOffset, 'Start')
        originalRange.setEnd(endViewLine, endViewLine.childNodes.length)

        const startRect = (focusDom.firstChild?.textContent?.length ?? 0) === 0
          ? focusDom.getBoundingClientRect()
          : originalRange.getBoundingClientRect()

        start = {
          x: startRect.x - x,
          y: endTop,
          width: startRect.width,
          height: endViewLineRenderedElement.height,
        }

        setOriginalRange(originalRange, anchorDom, anchorOffset, 'End')
        originalRange.setStart(startViewLine, 0)

        const endRect = (anchorDom.firstChild?.textContent?.length ?? 0) === 0
          ? anchorDom.getBoundingClientRect()
          : originalRange.getBoundingClientRect()

        end = {
          x: endRect.x - x,
          y: startTop,
          width: endRect.width,
          height: startViewLineRenderedElement.height,
        }
      } else {
        setOriginalRange(originalRange, anchorDom, anchorOffset, 'Start')
        originalRange.setEnd(startViewLine, startViewLine.childNodes.length)

        const startRect = (anchorDom.firstChild?.textContent?.length ?? 0) === 0
          ? anchorDom.getBoundingClientRect()
          : originalRange.getBoundingClientRect()

        start = {
          x: startRect.x - x,
          y: startTop,
          width: startRect.width,
          height: startViewLineRenderedElement.height,
        }

        setOriginalRange(originalRange, focusDom, focusOffset, 'End')
        originalRange.setStart(endViewLine, 0)

        const endRect = (focusDom.firstChild?.textContent?.length ?? 0) === 0
          ? focusDom.getBoundingClientRect()
          : originalRange.getBoundingClientRect()

        end = {
          x: endRect.x - x,
          y: endTop,
          width: endRect.width,
          height: endViewLineRenderedElement.height,
        }
      }

      start.width = Math.max(10, start.width + 10) // 延长 10px 选择区
      end.width = Math.max(10, end.width)
      rectangles.push(start, end)

      const [sIdx, eIdx] = [
        renderedElements.findIndex(b => b.id === startViewLine.dataset.id),
        renderedElements.findIndex(b => b.id === endViewLine.dataset.id),
      ]

      renderedElements
        .slice(Math.min(sIdx, eIdx) + 1, Math.max(sIdx, eIdx))
        .map(({ x, y, width, height }) => {
          rectangles.push({
            x: x - scrollX,
            y: y - scrollY,
            width: width + 10, // 延长 10px 选择区
            height,
          })

          return null
        })
    }

    this.#rectangles = rectangles
  }
}

export class EditorSelection {
  #ctx: MarkdanContext
  #ranges = new Set<EditorSelectionRange>()
  #currentRange: EditorSelectionRange | null = null

  // 按住 alt 键点击了当前选区
  isClickCurrentWithAltKey = false

  constructor(ctx: MarkdanContext) {
    this.#ctx = ctx
  }

  get ranges() {
    return this.#ranges
  }

  get focusViewLine() {
    const currentRange = this.#currentRange
    if (!currentRange) {
      return undefined
    }
    const element = this.#ctx.schema.elements.find(e => e.id === currentRange.focusBlock)

    if (!element) {
      return undefined
    }

    return element.groupIds?.[0] ?? element.id
  }

  get isOnlyOneCollapsedRange() {
    const ranges = [...this.ranges]
    return ranges.length === 1 && ranges[0].isCollapsed
  }

  addRange(
    anchorBlock: EditorSelectionRange['anchorBlock'],
    anchorOffset: EditorSelectionRange['anchorOffset'],
    focusBlock = anchorBlock,
    focusOffset = anchorOffset,
  ) {
    const range = new EditorSelectionRange(anchorBlock, anchorOffset, focusBlock, focusOffset, this.#ctx)
    this.ranges.add(range)
    this.#currentRange = range

    this.#ctx.emitter.emit('selection:change', this.ranges)
  }

  setRange(
    focusBlock: EditorSelectionRange['focusBlock'],
    focusOffset: EditorSelectionRange['focusOffset'],
  ) {
    this.#currentRange?.setEnd(focusBlock, focusOffset)
    this.#ctx.emitter.emit('selection:change', this.ranges)
  }

  removeAllRanges() {
    this.ranges.clear()

    this.#ctx.emitter.emit('selection:change', this.ranges)
  }

  removeRange(range: EditorSelectionRange) {
    this.ranges.delete(range)

    this.#ctx.emitter.emit('selection:change', this.ranges)
  }

  /**
   * 1. 仅按住 alt 键时
   *    - 增加一个新选区操作；
   *    - 点击非当前选区时，删除该选区；
   *    - 点击当前选区时，将操作交给 move up，如果发生 move，则重选（以最小位置为起始点）。否则不处理;
   * 2. 同时按住 alt & shift 键，生成多选区（@todo - 暂时不做）
   * 3. 仅按住 shift 键时，修改当前选区的结束点
   * 4. 无 alt | shift 按键操作时，清空所有选区，新增一个选区
   */
  handleMouseDown(e: MouseEvent) {
    const keys = getModifierKeys(e)
    const { node, offset } = getBlockPositionByClick({
      x: e.clientX,
      y: e.clientY,
    })

    const block = getBlockIdByNode(node)
    if (isOnlyAltKey(keys)) {
      const clickRange = this.#isClickRange(e)

      if (clickRange === this.#currentRange) {
        this.isClickCurrentWithAltKey = true
        return
      }
      if (clickRange) {
        this.removeRange(clickRange)
        return
      }

      this.addRange(block, offset)
    } else if (isOnlyShiftKey(e)) {
      if (this.#currentRange) {
        this.setRange(block, offset)
      } else {
        this.addRange(block, offset)
      }
    } else if (keys.includes('alt') && keys.includes('shift')) {
      // @todo 同时按住 alt & shift 键，生成多选区
      this.addRange(block, offset)
    } else {
      this.removeAllRanges()
      this.addRange(block, offset)
    }
  }

  handleMouseMove(e: MouseEvent) {
    if (!this.#currentRange) {
      return
    }

    const {
      config: {
        scrollbarSize,
        containerRect: {
          x,
          y,
          width,
          height,
        },
      },
    } = this.#ctx

    // 超出编辑器可视区
    if (
      !isPointInRect({
        x: e.clientX,
        y: e.clientY,
      }, {
        x,
        y,
        width: width - scrollbarSize,
        height: height - scrollbarSize,
      })
    ) {
      this.#handleOutOfViewport(e)
    } else {
      const { node, offset } = getBlockPositionByClick({
        x: e.clientX,
        y: e.clientY,
      })

      const block = getBlockIdByNode(node)

      if (this.isClickCurrentWithAltKey) {
        this.isClickCurrentWithAltKey = false

        const { anchorBlock, anchorOffset } = this.#currentRange

        this.removeRange(this.#currentRange)
        this.addRange(anchorBlock, anchorOffset, block, offset)
      } else {
        this.setRange(block, offset)
      }
    }

    const ranges = this.#getIntersectionRanges()
    ranges.map((r) => {
      return this.removeRange(r)
    })
  }

  handleMouseUp(e: MouseEvent) {
    if (this.isClickCurrentWithAltKey) {
      this.isClickCurrentWithAltKey = false
      return
    }
    if (!this.#currentRange) {
      return
    }

    const {
      config: {
        scrollbarSize,
        containerRect: {
          x,
          y,
          width,
          height,
        },
      },
    } = this.#ctx

    // 超出编辑器可视区
    if (
      !isPointInRect({
        x: e.clientX,
        y: e.clientY,
      }, {
        x,
        y,
        width: width - scrollbarSize,
        height: height - scrollbarSize,
      })
    ) {
      this.#handleOutOfViewport(e)
      return
    }

    const { node, offset } = getBlockPositionByClick({
      x: e.clientX,
      y: e.clientY,
    })

    const block = getBlockIdByNode(node)

    this.setRange(block, offset)
  }

  #handleOutOfViewport(e: MouseEvent) {
    const {
      config: {
        scrollbarSize,
        containerRect: {
          x,
          y,
          width,
          height,
        },
      },
      emitter,
    } = this.#ctx
    emitter.emit('scrollbar:change', {
      x: scrollbarSize * (e.clientX > x + width - scrollbarSize ? 1 : e.clientX < x ? -1 : 0),
      y: scrollbarSize * (e.clientY > y + height - scrollbarSize ? 1 : e.clientY < y ? -1 : 0),
      action: 'scrollBy',
    })

    const { block, offset } = this.#getPositionWhenMouseout(e)

    this.setRange(
      block,
      offset,
    )
  }

  /**
   * 检测用户是否点击到了某个选区
   */
  #isClickRange(e: MouseEvent): EditorSelectionRange | false {
    const {
      config: {
        containerRect: {
          x,
          y,
        },
      },
      interface: {
        scrollbar: {
          scrollX,
          scrollY,
        },
      },
    } = this.#ctx

    const [left, top] = [
      e.clientX - x - scrollX,
      e.clientY - y - scrollY,
    ]

    const range = [...this.ranges].find((r) => {
      return (r.rectangles ?? []).some(rect => isPointInRect({ x: left, y: top }, rect))
    })

    return range ?? false
  }

  #getPositionWhenMouseout(e: MouseEvent) {
    const oMainViewer = this.#ctx.interface.ui.mainViewer
    const { anchorBlock } = this.#currentRange!
    const el = this.#ctx.schema.elements.find(i => i.id === anchorBlock)
    if (!el) {
      throw new Error('Cannot find anchor block\'s element.')
    }
    const viewLine = el.groupIds[0] ?? anchorBlock

    const renderedElements = this.#ctx.renderedElements
    const viewLienRenderBlock = this.#ctx.renderedElements.find(b => b.id === viewLine)
    if (!viewLienRenderBlock) {
      throw new Error('Cannot find render block.')
    }

    const rect = oMainViewer.getBoundingClientRect()

    const tMin = viewLienRenderBlock.y
    const tMax = tMin + viewLienRenderBlock.height

    const top = e.clientY - rect.top
    const left = e.clientX - rect.left

    let focusBlock: EditorSelectionRange['focusBlock']
    let focusOffset = 0

    const { scrollY } = this.#ctx.interface.scrollbar

    if (top < tMin) {
      // 往上选取
      focusBlock = (renderedElements.find(b => top >= (b.y - scrollY) && top <= (b.y - scrollY) + b.height) ?? renderedElements[0]).id
    } else if (top > tMax) {
      // 往下选取
      focusBlock = ([...renderedElements].reverse().find(b => top >= (b.y - scrollY) && top <= (b.y - scrollY) + b.height) ?? renderedElements.at(-1)!).id
    } else {
      // 当前行
      focusBlock = viewLine
    }

    // 鼠标位置超出编辑器右侧
    if (left >= rect.width) {
      let lastBlock: MarkdanViewBlock = this.#ctx.viewBlocks.find(b => b.id === focusBlock)!

      while (lastBlock.children?.length) {
        lastBlock = lastBlock.children.at(-1)!
      }
      focusOffset = lastBlock.content.length
    }

    return {
      block: focusBlock,
      offset: focusOffset,
    }
  }

  #getIntersectionRanges() {
    const currentRange = this.#currentRange
    const ranges = [...this.ranges].filter(r => r !== currentRange)

    const currentRectangles = currentRange?.rectangles || []

    if (currentRectangles.length === 0) return []

    return ranges.filter(({ rectangles }) => {
      return rectangles?.some(rect => EditorSelection.isRectIntersection(rect, currentRectangles))
    })
  }

  static isRectIntersection(rect1: Rectangle, rects: Rectangle[]): boolean {
    return rects.some((rect2) => {
      return (isRectCross(rect1, rect2) || isRectContainRect(rect1, rect2))
        && getIntersectionArea(rect1, rect2) > 1
    })
  }
}
