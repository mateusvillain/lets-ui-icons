import { render, SearchTextbox, Toggle } from '@create-figma-plugin/ui'
import { emit } from '@create-figma-plugin/utilities'
import { h } from 'preact'
import { useMemo, useState } from 'preact/hooks'
import '!./styles.css'
import { allBaseNames, iconsData } from './icons-data'
import type { InsertIconHandler } from './types'

function getIconKey(baseName: string, isSolid: boolean): string {
  const solidKey = `${baseName}-solid`
  return isSolid && solidKey in iconsData ? solidKey : baseName
}

function Plugin() {
  const [searchQuery, setSearchQuery] = useState('')
  const [isSolid, setIsSolid] = useState(false)

  const filteredIcons = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return q ? allBaseNames.filter((name) => name.includes(q)) : allBaseNames
  }, [searchQuery])

  function handleClick(baseName: string) {
    const key = getIconKey(baseName, isSolid)
    emit<InsertIconHandler>('INSERT_ICON', { iconName: key, svgString: iconsData[key] })
  }

  return (
    <div class="plugin-root">
      <div class="plugin-header">
        <SearchTextbox
          onValueInput={setSearchQuery}
          placeholder="Search icons…"
          value={searchQuery}
        />
        <div class="controls-row">
          <div class="variant-toggle">
            <span
              class={`toggle-label ${!isSolid ? 'toggle-label--active' : 'toggle-label--inactive'}`}
            >
              Outline
            </span>
            <Toggle onValueChange={setIsSolid} value={isSolid}>
              {''}
            </Toggle>
            <span
              class={`toggle-label ${isSolid ? 'toggle-label--active' : 'toggle-label--inactive'}`}
            >
              Solid
            </span>
          </div>
        </div>
      </div>

      <div class="icon-grid">
        {filteredIcons.length === 0 ? (
          <div class="icon-empty">No icons found for "{searchQuery}"</div>
        ) : (
          filteredIcons.map((baseName) => {
            const key = getIconKey(baseName, isSolid)
            const svg = iconsData[key]
            return (
              <div
                key={key}
                class="icon-cell"
                title={key}
                onClick={() => handleClick(baseName)}
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            )
          })
        )}
      </div>
    </div>
  )
}

export default render(Plugin)
