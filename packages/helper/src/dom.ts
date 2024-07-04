export interface Point {
  x: number
  y: number
}
export interface Rectangle extends Point {
  width: number
  height: number
}

/**
 * 通过 editor 点击位置，分析选中的 block 位置，以及确定点击的是哪个字符
 */
export function getBlockPositionByClick({ x, y }: Point, _mode = '?') {
  let range
  let textNode: Node
  let offset: number

  const doc: Document & Record<string, any> = document

  if (doc.caretPositionFromPoint) {
    range = doc.caretPositionFromPoint(x, y)
    textNode = range.offsetNode
    offset = range.offset
  } else if (doc.caretRangeFromPoint) {
    // 使用 WebKit 专有回退方法
    range = doc.caretRangeFromPoint(x, y)!
    textNode = range.startContainer
    offset = range.startOffset
  } else {
    throw new Error('Your browse is not supported.')
  }

  if (!textNode) {
    throw new Error('Your browse is not supported.')
  }

  return {
    node: textNode,
    offset,
  }
}

export function getBlockIdByNode(node: Node) {
  const n = (node.nodeType === 3 ? node.parentNode : node) as HTMLElement

  const id = n?.dataset?.id

  if (!id) {
    throw new TypeError('Cannot find node')
  }

  return id
}

export function isPointInRect(point: Point, { x, y, width, height }: Rectangle): boolean {
  return point.x >= x
    && point.x <= x + width
    && point.y >= y
    && point.y <= y + height
}

export function isRectCross({ x: x1, y: y1, width: w1, height: h1 }: Rectangle, { x: x2, y: y2, width: w2, height: h2 }: Rectangle): boolean {
  return Math.max(x1, x2) <= Math.min(x1 + w1, x2 + w2)
    && Math.max(y1, y2) <= Math.min(y1 + h1, y2 + h2)
}

export function isRectContainRect({ x: x1, y: y1, width: w1, height: h1 }: Rectangle, { x: x2, y: y2, width: w2, height: h2 }: Rectangle): boolean {
  return (x1 <= x2 && y1 <= y2 && x1 + w1 >= x2 + w2 && y1 + h1 >= y2 + h2)
    || (x1 >= x2 && y1 >= y2 && x1 + w1 <= x2 + w2 && y1 + h1 <= y2 + h2)
}

export function getIntersectionArea({ x: x1, y: y1, width: w1, height: h1 }: Rectangle, { x: x2, y: y2, width: w2, height: h2 }: Rectangle) {
  return (Math.min(x1 + w1, x2 + w2) - Math.max(x1, x2)) * (Math.min(y1 + h1, y2 + h2) - Math.max(y1, y2))
}

export function getRangePosition(blockId: string, offset: number, el: HTMLElement) {
  const n = el.querySelector(`[data-id="${blockId}"]`)

  if (!n) {
    console.error(`Cannot find node by block id(${blockId})`)
    return n
  }

  if (n.firstChild?.nodeType !== 3 || (n.firstChild?.textContent?.length ?? 0) === 0) {
    // 兼容空行
    return n.getBoundingClientRect()
  }
  const range = new Range()
  range.setStart(n.firstChild!, offset)
  range.setEnd(n.firstChild!, offset)
  return range.getBoundingClientRect()
}

export function setOriginalRange(range: Range, el: HTMLElement, offset: number, position: 'Both' | 'Start' | 'End' = 'Both') {
  if ((el.firstChild?.textContent?.length ?? 0) === 0) {
    if (position === 'Both') {
      range.setStart(el, 0)
      range.setEnd(el, 0)
    } else {
      (range as any)[`set${position}`](el, 0)
    }
  } else {
    if (position === 'Both') {
      range.setStart(el.firstChild!, offset)
      range.setEnd(el.firstChild!, offset)
    } else {
      (range as any)[`set${position}`](el.firstChild!, offset)
    }
  }
  return range
}

/**
 * 修正选区中的 top 值，消除 DOM 的差异
 */
export function correctionCursorTop(cursorTop: number, elementTop: number, lineHeight: string, paddingTop: string | number) {
  if (cursorTop <= elementTop) return elementTop

  const diff = Math.abs(elementTop - cursorTop)

  let p = parseFloat(paddingTop as string)
  p = Number.isNaN(p) ? 0 : p

  return Math.floor(diff / parseFloat(lineHeight)) * parseFloat(lineHeight) + elementTop + p
}

export function createElement<T extends null = null> (tagName: T, props: null, children: Array<string | Text | HTMLElement | DocumentFragment>): Text
export function createElement<T extends (keyof HTMLElementTagNameMap)> (tagName: T, props: null | Record<string, string | boolean>, children?: Array<string | Text | HTMLElement | DocumentFragment>): HTMLElementTagNameMap[T]
export function createElement<T extends(keyof HTMLElementTagNameMap) | null> (
  tagName: null | T,
  props: null | Record<string, string | boolean>,
  children: Array<string | Text | HTMLElement | DocumentFragment> = [],
) {
  if (!tagName && !children?.[0]) {
    throw new TypeError(`"tagName" expect a HTMLElementTagName, but got "${tagName!}"`)
  }

  if (!tagName) {
    return document.createTextNode(children[0] as string)
  }

  const el = document.createElement(tagName)

  if (props) {
    Object.entries(props).forEach(([key, value]) => {
      el.setAttribute(key, value as string)
    })
  }

  children?.forEach((child) => {
    if (typeof child === 'string') {
      el.appendChild(document.createTextNode(child))
    } else {
      el.appendChild(child)
    }
  })

  return el
}
