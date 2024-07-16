import { createRandomId } from '@markdan/helper'
import { EditorSelectionRange, type MarkdanContext, type MarkdanSchemaElement } from '.'

export interface MarkdanCommand {
  registerCommand(name: string, command: CommandHandler): Command
  executeCommand(cmdName: string, ...args: any[]): void
}

export type CommandHandler = (...args: any[]) => any
class Command {
  static DEFAULT = 'default'
  static UNAVAILABLE = 'unavailable'
  static EXECUTED = 'executed'

  constructor(protected name: string, protected command: CommandHandler) {}

  getState() {}

  execute(ctx: MarkdanContext, ...args: any[]) {
    return this.command(ctx, ...args)
  }
}

export function createCommandApi(ctx: MarkdanContext): MarkdanCommand {
  const commands = new Map<string, Command>()

  return {
    registerCommand(name: string, command: CommandHandler) {
      if (commands.has(name)) {
        throw new Error(`Command '${name}' is already exists.`)
      }
      const cmd = new Command(name, command)
      commands.set(name, cmd)

      return cmd
    },

    executeCommand(cmdName: string, ...args: any[]) {
      const command = commands.get(cmdName)
      if (!command) {
        throw new Error(`Command '${command}' it not exists.`)
      }
      // if (!command.getState()) {
      //   //
      // }
      command.execute(ctx, ...args)
    },
  }
}

/**
 * 删除选区内容
 */
export function deleteContentCommand(ctx: MarkdanContext) {
  const { schema } = ctx
  const { elements } = schema
  ctx.selection.ranges.forEach((range) => {
    if (!range.isCollapsed) {
      range.collapse()
    } else {
      const { anchorBlock, anchorOffset } = range
      const idx = elements.findIndex(el => el.id === anchorBlock)
      if (idx === -1) {
        throw new Error('获取选区元素失败')
      }
      const element = elements[idx]

      if (anchorOffset !== 0) {
        schema.replace({
          ...element,
          content: `${element.content.slice(0, anchorOffset - 1)}${element.content.slice(anchorOffset)}`,
        }, element.id)

        range.setRange(anchorBlock, anchorOffset - 1, anchorBlock, anchorOffset - 1)
      } else {
        if (idx === 0) return

        // 删除当前元素，并将选区移动到上一个元素的最后一个字符
        // @todo - 如果当前位置是行首，且类型不是一个段落，则将其转为 Paragraph
        const prevElementIdx = idx - 1
        const prevElement = elements[prevElementIdx]
        const prevElementContentLength = prevElement.content.length
        schema.splice(idx, 1)
        range.setRange(prevElement.id, prevElementContentLength, prevElement.id, prevElementContentLength)
      }
    }
  })

  ctx.emitter.emit('schema:change')
  ctx.emitter.emit('selection:change', ctx.selection.ranges)
}

/**
 * 换行
 */
export function breakLineCommand(ctx: MarkdanContext) {
  // 删除选区内容
  ctx.selection.ranges.forEach((range) => {
    if (!range.isCollapsed) {
      range.collapse()
    }
  })

  // 拆分成两行
  const { schema } = ctx
  const { elements } = schema

  ctx.selection.ranges.forEach((range) => {
    // 新起行继承原行的所有父级信息
    const idx = elements.findIndex(el => el.id === range.anchorBlock)
    if (idx === -1) {
      throw new Error('获取选区位置元素失败')
    }
    const {
      id,
      content,
      type,
      groupIds,
    } = elements[idx]

    const parentId = groupIds?.[0] ?? id
    const tailElements = elements.filter((el, index) => index > idx && el.groupIds[0] === parentId)

    if (content.slice(range.focusOffset) === '' && tailElements.length === 0) {
      // 后面内容为空，直接起一个新行
      const newLine = ctx.schema.createElement('paragraph', [], '')

      schema.appendAfter(newLine, id)
      range.setRange(newLine.id, 0, newLine.id, 0)
    } else {
      // 保留行的元素更新截断处的内容，以及删除后续所有元素即可
      const reservedElement = {
        ...elements[idx],
        content: content.slice(0, range.anchorOffset),
      }
      // 新起行继承所有格式
      const idMapping = new Map<string, string>()
      const additionalElements = groupIds.reduce((prev, groupId) => {
        const el = elements.find(e => e.id === groupId)
        if (!el) {
          throw new Error('获取选区位置父级元素失败')
        }
        idMapping.set(groupId, createRandomId())
        return prev.concat({
          ...el,
          id: idMapping.get(groupId)!,
          groupIds: el.groupIds.map(i => idMapping.get(i) ?? i),
          content: '',
        })
      }, [] as MarkdanSchemaElement[])
      // 折断行新数据
      const newElement = schema.createElement(
        type,
        groupIds.map(id => idMapping.get(id)!),
        content.slice(range.focusOffset),
      )
      idMapping.set(id, newElement.id)

      // 1. 更新保留行
      schema.replace(reservedElement, id)
      // 2. 删除当前行剩余内容，并且增加新行数据
      schema.splice(
        idx + 1,
        tailElements.length,
        // 保留格式行
        ...additionalElements,
        // 折断行
        newElement,
        // 剩余行
        ...tailElements.map((item) => {
          return {
            ...item,
            groupIds: item.groupIds.map(i => idMapping.get(i)!),
          }
        }),
      )
      // 3. 让焦点位于新元素开始的位置
      range.setRange(newElement.id, 0, newElement.id, 0)
    }
  })

  ctx.emitter.emit('schema:change')
  ctx.emitter.emit('selection:change', ctx.selection.ranges)

  if (ctx.selection.currentRange) {
    EditorSelectionRange.detectRange(ctx.selection.currentRange.anchorBlock, ctx.selection.currentRange.anchorOffset, ctx)
  }
}

/**
 * 插入
 */
export function insertCommand(ctx: MarkdanContext, value: string) {
  // 删除选区内容
  ctx.selection.ranges.forEach((range) => {
    if (!range.isCollapsed) {
      range.collapse()
    }
  })

  // 新增
  const { schema } = ctx
  const { elements } = schema

  ctx.selection.ranges.forEach((range) => {
    const element = elements.find(el => el.id === range.anchorBlock)
    if (!element) return

    schema.replace({
      ...element,
      content: `${element.content.slice(0, range.anchorOffset)}${value}${element.content.slice(range.anchorOffset)}`,
    }, element.id)
    range.setRange(element.id, range.anchorOffset + value.length, element.id, range.anchorOffset + value.length)
  })
  ctx.emitter.emit('schema:change')
  ctx.emitter.emit('selection:change', ctx.selection.ranges)

  if (ctx.selection.currentRange) {
    EditorSelectionRange.detectRange(ctx.selection.currentRange.anchorBlock, ctx.selection.currentRange.anchorOffset, ctx)
  }
}

// 重做
export function redoCommand(ctx: MarkdanContext) {
  ctx.history.redo()
}

// 撤销
export function undoCommand(ctx: MarkdanContext) {
  ctx.history.undo()
}
