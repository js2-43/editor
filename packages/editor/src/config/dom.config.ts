import { hyphenToCamel } from '@markdan/helper'

const prefix = 'markdan'

type CamelCase<S extends string, Result extends string = '', IsFirst extends boolean = true> = S extends `${infer F}${infer R}`
  ? IsFirst extends true
    ? CamelCase<Uncapitalize<S>, Result, false>
    : F extends '-'
      ? CamelCase<Capitalize<R>, Result, false>
      : CamelCase<Uncapitalize<R>, `${Result}${F}`, false>
  : Result

type CamelCaseArray<T extends readonly string[]> = {
  [K in keyof T]: T[K] extends string ? CamelCase<T[K]> : T[K]
}

type DomClassesType<T extends readonly string[] = []> = {
  [K in CamelCaseArray<T>[number]]: K
}

const classNames = [
  'editor',
  'editor-main',
  'editor-container',
  'editor-toolbar',
  'editor-footer',
  'editor-viewer',
  'editor-cursor',
  'editor-cursor-canvas',
  'editor-range',
  'editor-scrollbar',
  'editor-locator',
  'editor-line-number',
] as const

export const CLASS_NAMES = (() => {
  return classNames.reduce((acc, curr) => {
    return {
      ...acc,
      [hyphenToCamel(curr)]: `${prefix}-${curr}`,
    }
  }, {} as DomClassesType<typeof classNames>)
})()
