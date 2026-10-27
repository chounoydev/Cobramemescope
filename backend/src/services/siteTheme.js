import { query } from '../db.js'

export const seasonalThemes = ['none', 'christmas', 'halloween', 'new-year']
export const defaultSeasonalTheme = 'new-year'

export async function getSeasonalTheme() {
  const result = await query(
    "SELECT setting_value, updated_at FROM site_settings WHERE setting_key = 'seasonal_theme'",
  )
  const row = result.rows[0]
  return {
    theme: seasonalThemes.includes(row?.setting_value) ? row.setting_value : defaultSeasonalTheme,
    updatedAt: row?.updated_at ?? null,
  }
}

export async function saveSeasonalTheme(theme) {
  if (!seasonalThemes.includes(theme)) throw new Error('Choose a supported seasonal theme.')

  const result = await query(
    `INSERT INTO site_settings (setting_key, setting_value, updated_at)
     VALUES ('seasonal_theme', $1, NOW())
     ON CONFLICT (setting_key)
     DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()
     RETURNING setting_value, updated_at`,
    [theme],
  )
  return { theme: result.rows[0].setting_value, updatedAt: result.rows[0].updated_at }
}
