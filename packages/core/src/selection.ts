import type { Point, Rectangle } from '@markdan/helper'
import { getBlockIdByNode, getBlockPositionByClick, getIntersectionArea, getModifierKeys, isBothCtrlAndShiftKeys, isOnlyAltKey, isOnlyCtrlKey, isOnlyShiftKey, isPointInRect, isRectContainRect, isRectCross } from '@markdan/helper'
import type { MarkdanContext } from './apiCreateApp'
import { EditorSelectionRange } from './range'
import type { MarkdanSchemaElement } from './schema'

export function getMouseOverElement(point: Point, ctx: MarkdanContext) {
  const {
    config: {
      containerRect,
      lastTop,
      scrollbarSize,
      gap,
    },
    interface: {
      scrollbar: {
        scrollX,
        scrollY,
      },
    },
    renderedElements,
    emitter,
  } = ctx

  const x = point.x - containerRect.x + scrollX
  const y = point.y - containerRect.y + scrollY

  const overViewLine = y > lastTop - gap / 2
    ? renderedElements.at(-1)
    : y <= gap / 2
      ? renderedElements[0]
      : renderedElements.find(item => y >= item.y - gap / 2 && y <= item.y + item.height + gap / 2)

  if (!overViewLine) {
    throw new Error('程序出错')
  }

  const isOutOfContainer = !isPointInRect(point, {
    x: containerRect.x,
    y: containerRect.y,
    width: containerRect.width - scrollbarSize - 4,
    height: containerRect.height - scrollbarSize - 4,
  })

  if (isOutOfContainer) {
    // 当前鼠标没在容器内部，让容器滚动
    emitter.emit('scrollbar:change', {
      x: scrollbarSize * 2 * (point.x > containerRect.x + containerRect.width - scrollbarSize ? 1 : point.x < containerRect.x ? -1 : 0),
      y: scrollbarSize * 2 * (point.y > containerRect.height - containerRect.y - scrollbarSize ? 1 : point.y < containerRect.y ? -1 : 0),
      action: 'scrollBy',
    })
  }
  const isOutOfViewLine = !isPointInRect({ x, y }, overViewLine)

  if (isOutOfViewLine) {
    const newX = x < overViewLine.x
      ? overViewLine.x + 1
      : x > overViewLine.x + overViewLine.width
        ? overViewLine.x + overViewLine.width - 1
        : x

    const newY = y < overViewLine.y
      ? overViewLine.y + 1
      : y > overViewLine.y + overViewLine.height
        ? overViewLine.y + overViewLine.height - 1
        : y

    return getMouseOverElement({
      x: Math.max(0, Math.min(containerRect.x + containerRect.width, newX + containerRect.x - scrollX)),
      y: Math.max(0, Math.min(lastTop, newY + containerRect.y - scrollY)),
    }, ctx)
  }

  const { node, offset } = getBlockPositionByClick({
    x: point.x,
    y: point.y,
  })

  const block = getBlockIdByNode(node)

  return {
    block,
    offset,
  }
}

export class EditorSelection {
  #ctx: MarkdanContext
  #ranges = new Set<EditorSelectionRange>()
  #currentRange: EditorSelectionRange | null = null

  // 按住 alt 键点击了当前选区
  isClickCurrentWithAltKey = false

  /** 选区黑名单，在黑名单里面的元素及其下面的子元素都不应该被选区选中 */
  #blackList: string[] = [
    '.table-toolbar',
  ]

  constructor(ctx: MarkdanContext) {
    this.#ctx = ctx
  }

  get ranges() {
    return this.#ranges
  }

  get currentRange() {
    return this.#currentRange
  }

  set currentRange(range: EditorSelectionRange | null) {
    this.#currentRange = range
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

  get blackList() {
    return this.#blackList
  }

  addRange(
    anchorBlock: EditorSelectionRange['anchorBlock'],
    anchorOffset: EditorSelectionRange['anchorOffset'],
    focusBlock = anchorBlock,
    focusOffset = anchorOffset,
    trigger = true,
  ) {
    const range = new EditorSelectionRange(anchorBlock, anchorOffset, focusBlock, focusOffset, this.#ctx)
    this.ranges.add(range)
    this.#currentRange = range

    trigger && this.#ctx.emitter.emit('selection:change', this.ranges)
    return range
  }

  setRange(
    focusBlock: EditorSelectionRange['focusBlock'],
    focusOffset: EditorSelectionRange['focusOffset'],
    trigger = true,
  ) {
    this.#currentRange?.setEnd(focusBlock, focusOffset)
    trigger && this.#ctx.emitter.emit('selection:change', this.ranges)
    return this.#currentRange
  }

  removeAllRanges(trigger = true) {
    this.ranges.clear()

    trigger && this.#ctx.emitter.emit('selection:change', this.ranges)
  }

  removeRange(range: EditorSelectionRange, trigger = true) {
    this.ranges.delete(range)

    trigger && this.#ctx.emitter.emit('selection:change', this.ranges)
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
    if (this.inBlackList(e.target as HTMLElement)) {
      return
    }

    document.addEventListener('mousemove', this.handleMouseMove)
    document.addEventListener('mouseup', this.handleMouseUp)

    const keys = getModifierKeys(e)

    const { block, offset } = getMouseOverElement({
      x: e.clientX,
      y: e.clientY,
    }, this.#ctx)

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
      this.#ctx.interface.renderer.scrollIfCurrentRangeOutOfViewer()
    } else if (isOnlyShiftKey(e)) {
      if (this.#currentRange) {
        this.setRange(block, offset)
      } else {
        this.addRange(block, offset)
      }
      this.#ctx.interface.renderer.scrollIfCurrentRangeOutOfViewer()
    } else if (keys.includes('alt') && keys.includes('shift')) {
      // @todo 同时按住 alt & shift 键，生成多选区
      this.addRange(block, offset)
      this.#ctx.interface.renderer.scrollIfCurrentRangeOutOfViewer()
    } else {
      this.removeAllRanges()
      this.addRange(block, offset)
      this.#ctx.interface.renderer.scrollIfCurrentRangeOutOfViewer()
    }
  }

  handleMouseMove = (e: MouseEvent) => {
    if (this.inBlackList(e.target as HTMLElement)) {
      return
    }

    if (!this.#currentRange) {
      return
    }

    const { block, offset } = getMouseOverElement({
      x: e.clientX,
      y: e.clientY,
    }, this.#ctx)

    if (this.isClickCurrentWithAltKey) {
      this.isClickCurrentWithAltKey = false

      const { anchorBlock, anchorOffset } = this.#currentRange

      this.removeRange(this.#currentRange)
      this.addRange(anchorBlock, anchorOffset, block, offset)
    } else {
      this.setRange(block, offset)
    }

    const ranges = this.#getIntersectionRanges()
    ranges.map((r) => {
      return this.removeRange(r)
    })
  }

  handleMouseUp = (e: MouseEvent) => {
    document.removeEventListener('mousemove', this.handleMouseMove)
    document.removeEventListener('mouseup', this.handleMouseUp)

    if (this.inBlackList(e.target as HTMLElement)) {
      return
    }

    if (this.isClickCurrentWithAltKey) {
      this.isClickCurrentWithAltKey = false
      return
    }
    if (!this.#currentRange) {
      return
    }

    const { block, offset } = getMouseOverElement({
      x: e.clientX,
      y: e.clientY,
    }, this.#ctx)

    this.#focusAfterSelect()
    this.setRange(block, offset)
  }

  /**
   * 使用键盘选择
   * 1. 无辅助按键
   *    - 选区闭合，根据方向将选区移动
   *    - 选区不闭合，左右方向将选区闭合（不删除内容）；上下方向则将选区上下移动，同时将选区闭合（不删除内容）
   * 2. 存在辅助按键
   *    - 单独按住 ctrl，根据方向移动到行首/行尾/页首/页尾，同时将选区闭合（不删除内容）
   *    - 单独按住 shift，根据方向将 focus 改变
   *    - 同时按住 ctrl + shift，根据方向将 focus 移动到行首/行尾/页首/页尾
   */
  handleKeyboardSelect(e: KeyboardEvent) {
    const modifierKeys = getModifierKeys(e)
    const { key } = e

    if (key === 'a') {
      e.preventDefault()
      this.selectAll()
      return
    }

    const isUp = key === 'ArrowUp'
    const isLeft = key === 'ArrowLeft'
    const isRight = key === 'ArrowRight'

    this.ranges.forEach((range) => {
      if (isOnlyCtrlKey(modifierKeys)) {
        // 单独按住 ctrl，根据方向移动到行首/行尾/页首/页尾，同时将选区 focus 同步 anchor
        const { block, offset } = range.getEndBy({ ArrowUp: 'first', ArrowRight: 'line-end', ArrowDown: 'end', ArrowLeft: 'line-start' }[key] as any)
        range.setRange(block, offset, block, offset)
      } else if (isOnlyShiftKey(modifierKeys)) {
        // 单独按住 shift，根据方向将 focus 改变
        const { block, offset } = range.getEndBy({ ArrowUp: 'prev-line', ArrowRight: 'next', ArrowDown: 'next-line', ArrowLeft: 'prev' }[key] as any)
        range.setEnd(block, offset)
      } else if (isBothCtrlAndShiftKeys(modifierKeys)) {
        // 同时按住 ctrl + shift，根据方向将 focus 移动到行首/行尾/页首/页尾
        const { block, offset } = range.getEndBy({ ArrowUp: 'first', ArrowRight: 'line-end', ArrowDown: 'end', ArrowLeft: 'line-start' }[key] as any)
        range.setEnd(block, offset)
      } else {
        if (range.isCollapsed) {
          const { block, offset } = range.getEndBy({ ArrowUp: 'prev-line', ArrowRight: 'next', ArrowDown: 'next-line', ArrowLeft: 'prev' }[key] as any)
          range.setRange(block, offset, block, offset)
        } else {
          // 选区不闭合，左右方向将选区闭合（不删除内容）；上下方向则将选区上下移动，同时将选区闭合（不删除内容）
          if (isLeft) {
            range.setRange(
              range.physicsRange.anchorBlock,
              range.physicsRange.anchorOffset,
              range.physicsRange.anchorBlock,
              range.physicsRange.anchorOffset,
            )
          } else if (isRight) {
            range.setRange(
              range.physicsRange.focusBlock,
              range.physicsRange.focusOffset,
              range.physicsRange.focusBlock,
              range.physicsRange.focusOffset,
            )
          } else {
            const { block, offset } = range.getEndBy(isUp ? 'prev-line' : 'next-line')
            range.setRange(block, offset, block, offset)
          }
        }
      }
    })
    const ranges = this.#getIntersectionRanges()
    ranges.map((r) => {
      return this.removeRange(r)
    })
    this.#ctx.emitter.emit('selection:change', this.ranges)
  }

  selectAll() {
    this.removeAllRanges()
    const {
      schema: { elements },
      renderedElements,
      emitter,
    } = this.#ctx

    const viewLine = renderedElements.at(-1)!
    emitter.emit('scrollbar:change', {
      x: viewLine.width,
      y: viewLine.y,
      action: 'scrollBy',
    })

    this.addRange(
      elements[0].id,
      0,
      elements.at(-1)!.id,
      elements.at(-1)!.content.length,
    )
    this.#ctx.emitter.emit('selection:change', this.ranges)
  }

  inBlackList(el: Element) {
    const {
      interface: {
        ui: { mainViewer },
      },
    } = this.#ctx

    if (!this.blackList.length) return false

    const blackListElements = [].slice.apply(mainViewer.querySelectorAll(this.blackList.join(','))) as HTMLElement[]

    return blackListElements.some(element => element.contains(el))
  }

  /**
   * 检测用户是否点击到了某个选区
   * @todo - 使用新方式检测
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
      return (r.rangeArea ?? []).some(area => isPointInRect({ x: left, y: top }, {
        x: area[0].x,
        y: area[0].y,
        width: area[1].x - area[0].x,
        height: area[1].y - area[0].y,
      }))
    })

    return range ?? false
  }

  /**
   * 获取与当前正在进行的选区交叉的选区
   * @todo - 选区绘制形式变更，需要调整逻辑
   */
  #getIntersectionRanges() {
    const currentRange = this.#currentRange
    const ranges = [...this.ranges].filter(r => r !== currentRange)

    if (!currentRange) return []

    // const currentRectangles = currentRange?.rectangles || []

    // if (currentRectangles.length === 0) return []

    return ranges.filter((range) => {
      return EditorSelection.isRangesIntersection(currentRange, range)
    })
  }

  #focusAfterSelect() {
    const {
      schema: { elements },
      interface: {
        ui: { mainViewer },
      },
    } = this.#ctx

    const affectedElementIds = new Set<string>()
    ;[].slice.apply(mainViewer.querySelectorAll('.focus')).forEach((el: HTMLElement) => {
      el.classList.remove('focus')
      affectedElementIds.add(el.getAttribute('data-id') || '')
    })

    this.ranges.forEach((range) => {
      const anchorElement = elements.find(item => item.id === range.anchorBlock)!
      const focusElement = elements.find(item => item.id === range.focusBlock)!

      setFocus(anchorElement, range.anchorOffset, elements)
        .forEach(id => affectedElementIds.add(id))
      setFocus(focusElement, range.focusOffset, elements)
        .forEach(id => affectedElementIds.add(id))
    })

    const affectedBlocks = elements.filter(item => affectedElementIds.has(item.id))
      .map(item => item.groupIds[0] ?? item.id)

    this.#ctx.emitter.emit('elements:size:change', affectedBlocks)
  }

  /**
   * 比较两个选区是否交叉
   * @returns boolean
   */
  static isRangesIntersection(
    {
      rangeArea: rangeArea1,
    }: EditorSelectionRange,
    {
      rangeArea: rangeArea2,
    }: EditorSelectionRange,
  ): boolean {
    const rects1 = rangeArea1.map(([point1, point2]) => {
      return {
        x: point1.x,
        y: point1.y,
        width: point2.x - point1.x,
        height: point2.y - point1.y,
      } as Rectangle
    })
    const rects2 = rangeArea2.map(([point1, point2]) => {
      return {
        x: point1.x,
        y: point1.y,
        width: point2.x - point1.x,
        height: point2.y - point1.y,
      } as Rectangle
    })

    return rects1.some(rect1 => rects2.some((rect2) => {
      return (isRectCross(rect1, rect2) || isRectContainRect(rect1, rect2))
        && getIntersectionArea(rect1, rect2) > 1
    }))
  }
}

function getContainer(groupIds: string[], elements: MarkdanSchemaElement[]) {
  let element: MarkdanSchemaElement | null = null
  let i = groupIds.length

  while (i >= 0) {
    const item = elements.find(el => el.id === groupIds[i])
    if (item?.isContainer) {
      element = item
      break
    }
    i--
  }

  return element?.isBlock && element.type !== 'image' ? null : element
}
function getTableContainer(groupIds: string[], elements: MarkdanSchemaElement[]) {
  let element: MarkdanSchemaElement | null = null
  let i = groupIds.length

  while (i >= 0) {
    const item = elements.find(el => el.id === groupIds[i])
    if (item && item.isContainer && item.isBlock && item.type === 'container') {
      element = item
      break
    }
    i--
  }

  return element
}

function setFocus(item: MarkdanSchemaElement, offset: number, elements: MarkdanSchemaElement[]) {
  const container = item.type === 'image' && item.groupIds.length === 0
    ? item
    : ['th', 'td'].includes(item.type)
      ? getTableContainer(item.groupIds, elements)
      : getContainer(item.groupIds, elements)

  const focusIds: string[] = []

  const element = document.querySelector(`[data-id="${container?.id ?? item.id}"]`)
  if (element) {
    if (container) {
      element.classList.add('focus')
      focusIds.push(element.getAttribute('data-id') || '')
    }
    if (!container?.isBlock && offset === 0) {
      const prevElement = element.previousElementSibling
      if (prevElement?.classList.contains('is-container')) {
        prevElement.classList.add('focus')
        focusIds.push(prevElement.getAttribute('data-id') || '')
      }
    }
    if (offset !== 0 && offset === item.content.length) {
      const nextElement = element.nextElementSibling
      if (nextElement?.classList.contains('is-container')) {
        nextElement.classList.add('focus')
        focusIds.push(nextElement.getAttribute('data-id') || '')
      }
    }
  }

  return focusIds
}
