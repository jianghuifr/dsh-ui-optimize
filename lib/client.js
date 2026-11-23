/**
 * `@jianghuifr/dsh-ui-optimize` — Web client half.
 *
 * A pure stylesheet switch. Three rules, each one measurable:
 *   S1 composer placeholder contrast: 2.14:1 -> about 5.9:1.
 *   S2 sidebar session timestamp: 10px / 3.72:1 -> 11px / 5.9:1.
 *   S3 an unselected session title sits one level below its workspace title.
 *
 * Only host theme tokens are used; removing the sheet restores the app exactly.
 */
window.__ModuleLoader__.load({
  id: '@jianghuifr/dsh-ui-optimize',
  factory(require) {
    'use strict'

    const React = require('react')
    const h = React.createElement

    // -----------------------------------------------------------------------
    // Identity and constants
    // -----------------------------------------------------------------------

    const ROW_ID = 'dsh-ui-optimize'
    const ROW_CONFIG_KEY = '@jianghuifr/dsh-ui-optimize#' + ROW_ID
    const LOCALE_NS = 'dshMaterialIconThemeUi'
    const STORAGE_KEY = '@jianghuifr/dsh-ui-optimize:features'
    /** Keys tried when this package's own key is absent: the previous split name, then the merged plugin. */
    const LEGACY_STORAGE_KEYS = [
      '@jianghuifr/dsh-material-icon-theme-ui:features',
      'dsh-material-icon-theme:features',
    ]
    const FEATURE_KEYS = ['styleTweaks']

    const DEFAULT_FEATURES = Object.freeze({ styleTweaks: true })

    /** The three tweaks, kept as one sheet so the switch is all-or-nothing. */
    const TWEAK_CSS = [
      '/* S1: composer placeholder 2.14:1 -> about 5.9:1. */',
      '[data-composer-placeholder]{color:var(--dsw-alias-label-secondary)!important}',
      '/* S2: sidebar session timestamp 10px/3.72:1 -> 11px/5.9:1. */',
      '[class*="_sidebarCol"] [class*="_timestamp"]{font-size:11px!important;color:var(--dsw-alias-label-secondary)!important}',
      '/* S3: an unselected session title sits one level below its workspace title. */',
      '[class*="_sessionRow"]:not([aria-selected="true"]) [class*="_title"]{color:var(--dsw-alias-label-secondary)!important}',
    ].join('\n')

    const SETTINGS_CSS = [
      '.dmi-feature-row{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:14px 0;border-bottom:.5px solid var(--dsw-alias-border-l3)}',
      '.dmi-feature-row:last-child{border-bottom:0}',
      '.dmi-feature-copy{display:flex;flex-direction:column;gap:3px;min-width:0}',
      '.dmi-feature-label{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:18px}',
      '.dmi-feature-description{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:17px}',
      '.dmi-feature-note{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:17px;padding:8px 0;margin:0}',
      '.dmi-switch{box-sizing:border-box;position:relative;flex:0 0 auto;width:36px;height:20px;padding:2px;border:0;border-radius:999px;background:var(--dsw-alias-border-l3);cursor:pointer}',
      '.dmi-switch[aria-checked="true"]{background:var(--dsw-alias-brand-primary)}',
      '.dmi-switch:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}',
      '.dmi-switch-thumb{display:block;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-switch-thumb);transition:transform .12s ease}',
      '.dmi-switch[aria-checked="true"] .dmi-switch-thumb{transform:translate(16px);background:var(--dsw-alias-label-primary-foreground)}',
      '.dmi-settings{display:flex;flex-direction:column;padding:2px 0}',
    ].join('\n')

    // -----------------------------------------------------------------------
    // Feature store (localStorage, shared by the settings page and runtime)
    // -----------------------------------------------------------------------

    let features = null
    const featureListeners = new Set()

    function readOwnFeatures() {
      const next = { ...DEFAULT_FEATURES }
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (raw !== null) {
          const parsed = JSON.parse(raw)
          if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
            for (const key of FEATURE_KEYS) {
              if (typeof parsed[key] === 'boolean') next[key] = parsed[key]
            }
          }
          return next
        }
        for (const legacyKey of LEGACY_STORAGE_KEYS) {
          const legacy = window.localStorage.getItem(legacyKey)
          if (legacy === null) continue
          try {
            const parsed = JSON.parse(legacy)
            if (parsed !== null && typeof parsed === 'object' && typeof parsed.styleTweaks === 'boolean') {
              next.styleTweaks = parsed.styleTweaks
              break
            }
          } catch {
            // Skip a corrupt legacy value and try the next key.
          }
        }
      } catch {
        // A corrupt or blocked store falls back to the defaults.
      }
      return next
    }

    function getFeatures() {
      if (features === null) features = Object.freeze(readOwnFeatures())
      return features
    }

    function subscribeFeatures(listener) {
      featureListeners.add(listener)
      return () => {
        featureListeners.delete(listener)
      }
    }

    function setFeature(key, value) {
      if (!FEATURE_KEYS.includes(key) || typeof value !== 'boolean') return
      const current = getFeatures()
      if (current[key] === value) return
      features = Object.freeze({ ...current, [key]: value })
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(features))
      } catch {
        // Persistence may be blocked; the live value still applies.
      }
      for (const listener of [...featureListeners]) {
        try {
          listener()
        } catch (error) {
          console.error('[dsh-ui-optimize] feature listener failed', error)
        }
      }
    }

    // -----------------------------------------------------------------------
    // Stylesheets
    // -----------------------------------------------------------------------

    function installStyle(name, css) {
      const existing = document.querySelector('style[data-dsh-mi-style="' + name + '"]')
      if (existing !== null) return existing
      const style = document.createElement('style')
      style.setAttribute('data-dsh-mi-style', name)
      style.textContent = css
      ;(document.head === null ? document.documentElement : document.head).appendChild(style)
      return style
    }

    function removeStyle(name) {
      for (const style of document.querySelectorAll('style[data-dsh-mi-style="' + name + '"]')) style.remove()
    }

    // -----------------------------------------------------------------------
    // Settings page
    // -----------------------------------------------------------------------

    function Switch({ checked, label, labelId, onChange }) {
      return h(
        'button',
        {
          type: 'button',
          role: 'switch',
          'aria-checked': checked,
          'aria-label': label,
          'aria-describedby': labelId,
          className: 'dmi-switch',
          onClick: () => onChange(!checked),
        },
        h('span', { className: 'dmi-switch-thumb' }),
      )
    }

    function SettingsView(props) {
      const t = props.t
      const current = React.useSyncExternalStore(subscribeFeatures, getFeatures, getFeatures)
      if (props.view === 'summary') return t('settings.summary')
      const descriptionId = 'dmi-description-styleTweaks'
      return h(
        'div',
        { className: 'dmi-settings' },
        h(
          'div',
          { className: 'dmi-feature-row' },
          h(
            'div',
            { className: 'dmi-feature-copy' },
            h('span', { className: 'dmi-feature-label' }, t('settings.styleTweaks.label')),
            h('span', { id: descriptionId, className: 'dmi-feature-description' }, t('settings.styleTweaks.description')),
          ),
          h(Switch, {
            checked: current.styleTweaks,
            label: t('settings.styleTweaks.label'),
            labelId: descriptionId,
            onChange: value => setFeature('styleTweaks', value),
          }),
        ),
        h('p', { className: 'dmi-feature-note' }, t('settings.note.storage')),
      )
    }

    // -----------------------------------------------------------------------
    // Locale dictionaries (en + zh are required by the locale service)
    // -----------------------------------------------------------------------

    const zh = {
      'settings.summary': '三条可读性微调：placeholder 对比度、会话时间戳、未选中会话标题层级。',
      'settings.note.storage': '设置保存在当前浏览器，切换立即生效、刷新后保持。',
      'settings.styleTweaks.label': '样式微调',
      'settings.styleTweaks.description': '提高输入框 placeholder 与会话时间戳的对比度，并让未选中会话标题弱一档。',
    }

    const en = {
      'settings.summary': 'Three readability tweaks: placeholder contrast, session timestamps and unselected session title hierarchy.',
      'settings.note.storage': 'Settings are stored in this browser and apply immediately; they survive a reload.',
      'settings.styleTweaks.label': 'Style tweaks',
      'settings.styleTweaks.description': 'Raise contrast of the composer placeholder and session timestamps, and soften unselected session titles.',
    }

    // -----------------------------------------------------------------------
    // Runtime: stylesheet switch
    // -----------------------------------------------------------------------

    function createRuntime() {
      let disposed = false
      let unsubscribeStore = null

      function applyTweaks(enabled) {
        if (enabled) installStyle('dsh-ui-optimize:tweaks', TWEAK_CSS)
        else removeStyle('dsh-ui-optimize:tweaks')
      }

      return {
        start() {
          installStyle('dsh-ui-optimize:settings', SETTINGS_CSS)
          applyTweaks(getFeatures().styleTweaks)
          unsubscribeStore = subscribeFeatures(() => applyTweaks(getFeatures().styleTweaks))
          return () => {
            if (disposed) return
            disposed = true
            if (unsubscribeStore !== null) {
              unsubscribeStore()
              unsubscribeStore = null
            }
            removeStyle('dsh-ui-optimize:tweaks')
            removeStyle('dsh-ui-optimize:settings')
          }
        },
      }
    }

    // -----------------------------------------------------------------------
    // Plugin export
    // -----------------------------------------------------------------------

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }), 'dsh-ui-optimize: locale')

      ctx.effect(
        () => ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
          name: 'plugins.row.config',
          key: ROW_CONFIG_KEY,
          locale: LOCALE_NS,
        }, SettingsView)),
        'dsh-ui-optimize: settings row',
      )

      ctx.effect(
        () => createRuntime().start(),
        'dsh-ui-optimize: stylesheet runtime',
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply,
    }
  },
})
