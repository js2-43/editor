import type { MarkdanInterface, MarkdanInterfaceOptions, MarkdanInterfaceStyle, MarkdanInterfaceTheme } from '@markdan/editor'
import { createEditorInterfaceApi, initialStyle, initialTheme, normalizeStyle } from '@markdan/editor'
import type { MarkdanRenderedElement, MarkdanViewBlock } from '@markdan/engine'
import { initEngine } from '@markdan/engine'
import type { DeepPartialObject } from '@markdan/helper'
import { EditorSelection } from './selection'
import EventEmitter from './emitter'
import { registerEventHandler } from './events'
import type { MarkdanSchema, MarkdanSchemaElement } from './schema'
import { createSchemaApi } from './schema'
import type { MarkdanCommand } from './command'
import { breakLineCommand, createCommandApi, deleteContentCommand, insertCommand, redoCommand, undoCommand } from './command'
import { type MarkdanPlugin, createPluginApi } from './plugin'
import { EditorHistory } from './history'

import templateElements from './data/template.element.json'

export interface Markdan {
  version: string

  use(): this

  mount(): any
  unmount(): void
}

export interface MarkdanConfig {
  uid: string
  containerRect: DOMRect
  theme: MarkdanInterfaceTheme
  style: MarkdanInterfaceStyle
  originalOptions: DeepPartialObject<MarkdanInterfaceOptions>
  lineNumber: boolean
  scrollbarSize: number
  /** 编辑区右侧 Padding 值 */
  paddingRight: number
  /** 最新一行应该挂载的 top 值 */
  lastTop: number
  /** viewer 容器中最大宽度 */
  maxWidth: number
  gap: number
}

export interface MarkdanContext {
  config: MarkdanConfig
  selection: EditorSelection
  dataSource: string
  viewBlocks: MarkdanViewBlock[]
  renderedElements: MarkdanRenderedElement[]
  schema: MarkdanSchema
  emitter: EventEmitter
  interface: MarkdanInterface
  command: MarkdanCommand
  plugin: MarkdanPlugin
  focused: boolean
  history: EditorHistory
}

export function createAppContext() {
  const ctx: MarkdanContext = {
    config: {} as MarkdanConfig,
    selection: {} as EditorSelection,
    schema: {} as MarkdanSchema,
    dataSource: '',
    viewBlocks: [],
    renderedElements: [],
    emitter: new EventEmitter(),
    interface: {} as MarkdanInterface,
    command: {} as MarkdanCommand,
    plugin: {} as MarkdanPlugin,
    focused: false,
    history: {} as EditorHistory,
  }

  ctx.schema = createSchemaApi(ctx)
  ctx.selection = new EditorSelection(ctx)
  ctx.history = new EditorHistory(ctx)
  const command = createCommandApi(ctx)
  const plugin = createPluginApi(ctx)

  command.registerCommand('delete', deleteContentCommand)
  command.registerCommand('break-line', breakLineCommand)
  command.registerCommand('insert', insertCommand)
  command.registerCommand('undo', undoCommand)
  command.registerCommand('redo', redoCommand)

  ctx.command = command
  ctx.plugin = plugin

  return ctx
}

export function createApp() {
  const ctx = createAppContext()

  // @todo parseDataSource => schema.elements

  return {
    use: ctx.plugin.install,
    mount(el: string | HTMLElement, options: DeepPartialObject<MarkdanInterfaceOptions> = {}) {
      const oEl = typeof el === 'string' ? document.querySelector<HTMLElement>(el) : el

      if (!oEl) {
        throw new TypeError(`el expect a selector or a HTML element, but got ${el}`)
      }

      const containerRect = oEl.getBoundingClientRect()
      const initialConfig: MarkdanConfig = {
        uid: '',
        containerRect,
        style: normalizeStyle({
          ...initialStyle,
          ...options.style,
        }, containerRect.width, containerRect.height),
        originalOptions: options,
        theme: options.theme ?? initialTheme,
        // lineNumber: !!options.lineNumber,
        lineNumber: false, /** @todo - 暂时不用这个功能 */
        scrollbarSize: 16,
        paddingRight: 16,
        lastTop: 0,
        maxWidth: 0,
        gap: 24,
      }
      Object.assign(ctx.config, initialConfig)

      // 注册事件处理
      registerEventHandler(ctx)

      // 初始化引擎
      initEngine(ctx)

      ctx.interface = createEditorInterfaceApi(oEl, ctx)

      // 初始化历史记录
      ctx.history.init()

      // @todo - 测试数据
      const elements = templateElements as unknown as MarkdanSchemaElement[]
      ctx.schema.splice(0, 1, elements[0])
      elements.slice(1).forEach((element) => {
        ctx.schema.append(element)
      })

      // ctx.schema.splice(0, 1, ctx.schema.createElement('h1', [], 'Heading 1'))
      // const h2 = ctx.schema.append(ctx.schema.createElement('h2', [], ''))
      // const strong = ctx.schema.append(ctx.schema.createElement('strong', [h2.id], 'Strong'))
      // ctx.schema.append(ctx.schema.createElement('italic', [h2.id, strong.id], 'Text'))
      // ctx.schema.append(ctx.schema.createElement('paragraph', [], 'mount(el: string | HTMLElement, options: MarkdanInterfaceOptions): void'))

      // ctx.schema.append(ctx.schema.createElement('h2', [], 'Heading 4'))
      // ctx.schema.append(ctx.schema.createElement('paragraph', [], 'mount(el: string | HTMLElement, options: MarkdanInterfaceOptions): void'))
      // ctx.schema.append(ctx.schema.createElement('h2', [], 'Heading 5'))
      // ctx.schema.append(ctx.schema.createElement('paragraph', [], 'mount(el: string | HTMLElement, options: MarkdanInterfaceOptions): void'))
      // ctx.schema.append(ctx.schema.createElement('h2', [], 'Heading 6'))
      // ctx.schema.append(ctx.schema.createElement('paragraph', [], 'mount(el: string | HTMLElement, options: MarkdanInterfaceOptions): void'))
      // ctx.schema.append(ctx.schema.createElement('h2', [], 'Heading 7'))
      // ctx.schema.append(ctx.schema.createElement('paragraph', [], 'mount(el: string | HTMLElement, options: MarkdanInterfaceOptions): void'))
      // ctx.schema.append(ctx.schema.createElement('h2', [], 'Heading 8'))
      // ctx.schema.append(ctx.schema.createElement('paragraph', [], 'mount(el: string | HTMLElement, options: MarkdanInterfaceOptions): void'))
      // ctx.schema.append(ctx.schema.createElement('h2', [], 'Heading 9'))
      // ctx.schema.append(ctx.schema.createElement('paragraph', [], 'mount(el: string | HTMLElement, options: MarkdanInterfaceOptions): void'))
      // ctx.schema.append(ctx.schema.createElement('h2', [], 'Heading 10'))
      // ctx.schema.append(ctx.schema.createElement('paragraph', [], 'mount(el: string | HTMLElement, options: MarkdanInterfaceOptions): void'))
      // ctx.schema.append(ctx.schema.createElement('h2', [], 'Heading 11'))
      // ctx.schema.append(ctx.schema.createElement('paragraph', [], 'mount(el: string | HTMLElement, options: MarkdanInterfaceOptions): void'))
      // ctx.schema.append(ctx.schema.createElement('h2', [], 'Heading 12'))
      // ctx.schema.append(ctx.schema.createElement('paragraph', [], 'mount(el: string | HTMLElement, options: MarkdanInterfaceOptions): void'))
      // ctx.schema.append(ctx.schema.createElement('h2', [], 'Heading 13'))
      // ctx.schema.append(ctx.schema.createElement('paragraph', [], 'mount(el: string | HTMLElement, options: MarkdanInterfaceOptions): void'))
      // ctx.schema.append(ctx.schema.createElement('h2', [], 'Heading 14'))
      // ctx.schema.append(ctx.schema.createElement('paragraph', [], 'mount(el: string | HTMLElement, options: MarkdanInterfaceOptions): void'))
      // ctx.schema.append(ctx.schema.createElement('h2', [], 'Heading 15'))
      // ctx.schema.append(ctx.schema.createElement('paragraph', [], 'mount(el: string | HTMLElement, options: MarkdanInterfaceOptions): void'))
      // ctx.schema.append(ctx.schema.createElement('h2', [], 'Heading 16'))
      // ctx.schema.append(ctx.schema.createElement('paragraph', [], 'mount(el: string | HTMLElement, options: MarkdanInterfaceOptions): void'))
      // ctx.schema.append(ctx.schema.createElement('h2', [], 'Heading 17'))
      // ctx.schema.append(ctx.schema.createElement('paragraph', [], 'mount(el: string | HTMLElement, options: MarkdanInterfaceOptions): void'))
      // ctx.schema.append(ctx.schema.createElement('h2', [], 'Heading 18'))
      // ctx.schema.append(ctx.schema.createElement('paragraph', [], 'mount(el: string | HTMLElement, options: MarkdanInterfaceOptions): void'))
      // ctx.schema.append(ctx.schema.createElement('h2', [], 'Heading 19'))
      // ctx.schema.append(ctx.schema.createElement('paragraph', [], 'mount(el: string | HTMLElement, options: MarkdanInterfaceOptions): void'))
      // ctx.schema.append(ctx.schema.createElement('h2', [], 'Heading 20'))
      // ctx.schema.append(ctx.schema.createElement('paragraph', [], 'mount(el: string | HTMLElement, options: MarkdanInterfaceOptions): void'))
      // ctx.schema.append(ctx.schema.createElement('h2', [], 'Heading 21'))
      // ctx.schema.append(ctx.schema.createElement('paragraph', [], 'mount(el: string | HTMLElement, options: MarkdanInterfaceOptions): void'))

      ctx.emitter.emit('schema:change', ctx.schema)
      ctx.emitter.emit('selection:change', ctx.selection.ranges)
    },
  }
}
