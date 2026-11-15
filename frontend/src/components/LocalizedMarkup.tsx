import { Children, cloneElement, isValidElement, type ReactNode } from 'react'
import { translate, type Language } from '../i18n'

function localizeNode(node: ReactNode, language: Language): ReactNode {
  if (typeof node === 'string') {
    const leading = node.match(/^\s*/)?.[0] ?? ''
    const trailing = node.match(/\s*$/)?.[0] ?? ''
    const content = node.trim()
    return content ? `${leading}${translate(language, content)}${trailing}` : node
  }
  if (Array.isArray(node)) return node.map((item) => localizeNode(item, language))
  if (!isValidElement<{ children?: ReactNode; [key: string]: unknown }>(node)) return node

  const props = { ...node.props }
  for (const key of ['title', 'placeholder', 'aria-label', 'aria-description', 'label', 'hint', 'description', 'unit']) {
    if (typeof props[key] === 'string') props[key] = translate(language, props[key] as string)
  }
  if (Array.isArray(props.series)) props.series = props.series.map((series) => isValidElement(series) ? series : ({ ...series as Record<string, unknown>, label: typeof (series as Record<string, unknown>).label === 'string' ? translate(language, (series as Record<string, string>).label) : (series as Record<string, unknown>).label }))
  if (props.children !== undefined) props.children = localizeNode(props.children, language)
  return cloneElement(node, props)
}

export default function LocalizedMarkup({ language, children }: { language: Language; children: ReactNode }) {
  return <>{Children.map(children, (child) => localizeNode(child, language))}</>
}
