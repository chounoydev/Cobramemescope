import { ref } from 'vue'

export const currencyOptions = [
  { code: 'USD', locale: 'en-US' },
  { code: 'PHP', locale: 'en-PH' },
  { code: 'EUR', locale: 'en-IE' },
  { code: 'GBP', locale: 'en-GB' },
  { code: 'JPY', locale: 'ja-JP' },
  { code: 'CAD', locale: 'en-CA' },
  { code: 'AUD', locale: 'en-AU' },
  { code: 'SGD', locale: 'en-SG' },
  { code: 'INR', locale: 'en-IN' },
  { code: 'KRW', locale: 'ko-KR' },
  { code: 'CHF', locale: 'de-CH' },
  { code: 'NZD', locale: 'en-NZ' },
  { code: 'SEK', locale: 'sv-SE' },
  { code: 'NOK', locale: 'nb-NO' },
  { code: 'DKK', locale: 'da-DK' },
  { code: 'PLN', locale: 'pl-PL' },
  { code: 'CZK', locale: 'cs-CZ' },
  { code: 'HUF', locale: 'hu-HU' },
  { code: 'RON', locale: 'ro-RO' },
  { code: 'TRY', locale: 'tr-TR' },
  { code: 'BRL', locale: 'pt-BR' },
  { code: 'MXN', locale: 'es-MX' },
  { code: 'CNY', locale: 'zh-CN' },
  { code: 'HKD', locale: 'zh-HK' },
  { code: 'IDR', locale: 'id-ID' },
  { code: 'MYR', locale: 'ms-MY' },
  { code: 'THB', locale: 'th-TH' },
  { code: 'ZAR', locale: 'en-ZA' },
  { code: 'ILS', locale: 'he-IL' },
  { code: 'TWD', locale: 'zh-TW' },
  { code: 'ARS', locale: 'es-AR' },
  { code: 'CLP', locale: 'es-CL' },
  { code: 'COP', locale: 'es-CO' },
  { code: 'PEN', locale: 'es-PE' },
  { code: 'UYU', locale: 'es-UY' },
  { code: 'VES', locale: 'es-VE' },
  { code: 'BDT', locale: 'bn-BD' },
  { code: 'PKR', locale: 'ur-PK' },
  { code: 'LKR', locale: 'si-LK' },
  { code: 'VND', locale: 'vi-VN' },
  { code: 'KHR', locale: 'km-KH' },
  { code: 'AED', locale: 'ar-AE' },
  { code: 'SAR', locale: 'ar-SA' },
  { code: 'EGP', locale: 'ar-EG' },
  { code: 'MAD', locale: 'ar-MA' },
  { code: 'NGN', locale: 'en-NG' },
  { code: 'KES', locale: 'en-KE' },
  { code: 'GHS', locale: 'en-GH' },
  { code: 'TZS', locale: 'sw-TZ' },
  { code: 'UGX', locale: 'en-UG' },
  { code: 'RWF', locale: 'rw-RW' },
  { code: 'CRC', locale: 'es-CR' },
  { code: 'DOP', locale: 'es-DO' },
  { code: 'JMD', locale: 'en-JM' },
  { code: 'BGN', locale: 'bg-BG' },
  { code: 'ISK', locale: 'is-IS' },
  { code: 'ALL', locale: 'sq-AL' },
  { code: 'MKD', locale: 'mk-MK' },
  { code: 'NPR', locale: 'ne-NP' },
  { code: 'MMK', locale: 'my-MM' },
  { code: 'MNT', locale: 'mn-MN' },
  { code: 'UZS', locale: 'uz-UZ' },
  { code: 'KZT', locale: 'kk-KZ' },
  { code: 'AZN', locale: 'az-AZ' },
  { code: 'GEL', locale: 'ka-GE' },
  { code: 'AMD', locale: 'hy-AM' },
  { code: 'MDL', locale: 'ro-MD' },
  { code: 'BAM', locale: 'bs-BA' },
  { code: 'RSD', locale: 'sr-RS' },
  { code: 'XOF', locale: 'fr-SN' },
  { code: 'XAF', locale: 'fr-CM' },
  { code: 'ETB', locale: 'am-ET' },
  { code: 'ZMW', locale: 'en-ZM' },
  { code: 'MUR', locale: 'en-MU' },
  { code: 'BWP', locale: 'en-BW' },
  { code: 'NAD', locale: 'en-NA' },
  { code: 'BHD', locale: 'ar-BH' },
  { code: 'QAR', locale: 'ar-QA' },
  { code: 'KWD', locale: 'ar-KW' },
  { code: 'OMR', locale: 'ar-OM' },
  { code: 'JOD', locale: 'ar-JO' },
  { code: 'IQD', locale: 'ar-IQ' },
  { code: 'AFN', locale: 'fa-AF' },
  { code: 'IRR', locale: 'fa-IR' },
  { code: 'KGS', locale: 'ky-KG' },
  { code: 'TJS', locale: 'tg-TJ' },
] as const

export type CurrencyCode = typeof currencyOptions[number]['code']

export const countryOptions = [
  { code: 'US', flag: '🇺🇸', country: 'United States', currency: 'USD' },
  { code: 'PH', flag: '🇵🇭', country: 'Philippines', currency: 'PHP' },
  { code: 'CA', flag: '🇨🇦', country: 'Canada', currency: 'CAD' },
  { code: 'MX', flag: '🇲🇽', country: 'Mexico', currency: 'MXN' },
  { code: 'BR', flag: '🇧🇷', country: 'Brazil', currency: 'BRL' },
  { code: 'GB', flag: '🇬🇧', country: 'United Kingdom', currency: 'GBP' },
  { code: 'IE', flag: '🇮🇪', country: 'Ireland', currency: 'EUR' },
  { code: 'DE', flag: '🇩🇪', country: 'Germany', currency: 'EUR' },
  { code: 'FR', flag: '🇫🇷', country: 'France', currency: 'EUR' },
  { code: 'ES', flag: '🇪🇸', country: 'Spain', currency: 'EUR' },
  { code: 'IT', flag: '🇮🇹', country: 'Italy', currency: 'EUR' },
  { code: 'PT', flag: '🇵🇹', country: 'Portugal', currency: 'EUR' },
  { code: 'NL', flag: '🇳🇱', country: 'Netherlands', currency: 'EUR' },
  { code: 'BE', flag: '🇧🇪', country: 'Belgium', currency: 'EUR' },
  { code: 'AT', flag: '🇦🇹', country: 'Austria', currency: 'EUR' },
  { code: 'CH', flag: '🇨🇭', country: 'Switzerland', currency: 'CHF' },
  { code: 'PL', flag: '🇵🇱', country: 'Poland', currency: 'PLN' },
  { code: 'CZ', flag: '🇨🇿', country: 'Czechia', currency: 'CZK' },
  { code: 'HU', flag: '🇭🇺', country: 'Hungary', currency: 'HUF' },
  { code: 'RO', flag: '🇷🇴', country: 'Romania', currency: 'RON' },
  { code: 'SE', flag: '🇸🇪', country: 'Sweden', currency: 'SEK' },
  { code: 'NO', flag: '🇳🇴', country: 'Norway', currency: 'NOK' },
  { code: 'DK', flag: '🇩🇰', country: 'Denmark', currency: 'DKK' },
  { code: 'TR', flag: '🇹🇷', country: 'Türkiye', currency: 'TRY' },
  { code: 'JP', flag: '🇯🇵', country: 'Japan', currency: 'JPY' },
  { code: 'KR', flag: '🇰🇷', country: 'South Korea', currency: 'KRW' },
  { code: 'CN', flag: '🇨🇳', country: 'China', currency: 'CNY' },
  { code: 'TW', flag: '🇹🇼', country: 'Taiwan', currency: 'TWD' },
  { code: 'HK', flag: '🇭🇰', country: 'Hong Kong', currency: 'HKD' },
  { code: 'SG', flag: '🇸🇬', country: 'Singapore', currency: 'SGD' },
  { code: 'IN', flag: '🇮🇳', country: 'India', currency: 'INR' },
  { code: 'ID', flag: '🇮🇩', country: 'Indonesia', currency: 'IDR' },
  { code: 'MY', flag: '🇲🇾', country: 'Malaysia', currency: 'MYR' },
  { code: 'TH', flag: '🇹🇭', country: 'Thailand', currency: 'THB' },
  { code: 'ZA', flag: '🇿🇦', country: 'South Africa', currency: 'ZAR' },
  { code: 'AU', flag: '🇦🇺', country: 'Australia', currency: 'AUD' },
  { code: 'NZ', flag: '🇳🇿', country: 'New Zealand', currency: 'NZD' },
  { code: 'IL', flag: '🇮🇱', country: 'Israel', currency: 'ILS' },
  { code: 'GR', flag: '🇬🇷', country: 'Greece', currency: 'EUR' },
  { code: 'HR', flag: '🇭🇷', country: 'Croatia', currency: 'EUR' },
  { code: 'AR', flag: '🇦🇷', country: 'Argentina', currency: 'ARS' },
  { code: 'CL', flag: '🇨🇱', country: 'Chile', currency: 'CLP' },
  { code: 'CO', flag: '🇨🇴', country: 'Colombia', currency: 'COP' },
  { code: 'PE', flag: '🇵🇪', country: 'Peru', currency: 'PEN' },
  { code: 'UY', flag: '🇺🇾', country: 'Uruguay', currency: 'UYU' },
  { code: 'BD', flag: '🇧🇩', country: 'Bangladesh', currency: 'BDT' },
  { code: 'PK', flag: '🇵🇰', country: 'Pakistan', currency: 'PKR' },
  { code: 'LK', flag: '🇱🇰', country: 'Sri Lanka', currency: 'LKR' },
  { code: 'VN', flag: '🇻🇳', country: 'Vietnam', currency: 'VND' },
  { code: 'KH', flag: '🇰🇭', country: 'Cambodia', currency: 'KHR' },
  { code: 'AE', flag: '🇦🇪', country: 'United Arab Emirates', currency: 'AED' },
  { code: 'SA', flag: '🇸🇦', country: 'Saudi Arabia', currency: 'SAR' },
  { code: 'EG', flag: '🇪🇬', country: 'Egypt', currency: 'EGP' },
  { code: 'MA', flag: '🇲🇦', country: 'Morocco', currency: 'MAD' },
  { code: 'NG', flag: '🇳🇬', country: 'Nigeria', currency: 'NGN' },
  { code: 'KE', flag: '🇰🇪', country: 'Kenya', currency: 'KES' },
  { code: 'GH', flag: '🇬🇭', country: 'Ghana', currency: 'GHS' },
  { code: 'TZ', flag: '🇹🇿', country: 'Tanzania', currency: 'TZS' },
  { code: 'UG', flag: '🇺🇬', country: 'Uganda', currency: 'UGX' },
  { code: 'RW', flag: '🇷🇼', country: 'Rwanda', currency: 'RWF' },
  { code: 'CR', flag: '🇨🇷', country: 'Costa Rica', currency: 'CRC' },
  { code: 'DO', flag: '🇩🇴', country: 'Dominican Republic', currency: 'DOP' },
  { code: 'JM', flag: '🇯🇲', country: 'Jamaica', currency: 'JMD' },
  { code: 'BG', flag: '🇧🇬', country: 'Bulgaria', currency: 'EUR' },
  { code: 'IS', flag: '🇮🇸', country: 'Iceland', currency: 'ISK' },
  { code: 'AL', flag: '🇦🇱', country: 'Albania', currency: 'ALL' },
  { code: 'MK', flag: '🇲🇰', country: 'North Macedonia', currency: 'MKD' },
  { code: 'NP', flag: '🇳🇵', country: 'Nepal', currency: 'NPR' },
  { code: 'MM', flag: '🇲🇲', country: 'Myanmar', currency: 'MMK' },
  { code: 'MN', flag: '🇲🇳', country: 'Mongolia', currency: 'MNT' },
  { code: 'UZ', flag: '🇺🇿', country: 'Uzbekistan', currency: 'UZS' },
  { code: 'KZ', flag: '🇰🇿', country: 'Kazakhstan', currency: 'KZT' },
  { code: 'AZ', flag: '🇦🇿', country: 'Azerbaijan', currency: 'AZN' },
  { code: 'GE', flag: '🇬🇪', country: 'Georgia', currency: 'GEL' },
  { code: 'AM', flag: '🇦🇲', country: 'Armenia', currency: 'AMD' },
  { code: 'MD', flag: '🇲🇩', country: 'Moldova', currency: 'MDL' },
  { code: 'BA', flag: '🇧🇦', country: 'Bosnia and Herzegovina', currency: 'BAM' },
  { code: 'RS', flag: '🇷🇸', country: 'Serbia', currency: 'RSD' },
  { code: 'SN', flag: '🇸🇳', country: 'Senegal', currency: 'XOF' },
  { code: 'CM', flag: '🇨🇲', country: 'Cameroon', currency: 'XAF' },
  { code: 'ET', flag: '🇪🇹', country: 'Ethiopia', currency: 'ETB' },
  { code: 'ZM', flag: '🇿🇲', country: 'Zambia', currency: 'ZMW' },
  { code: 'MU', flag: '🇲🇺', country: 'Mauritius', currency: 'MUR' },
  { code: 'BW', flag: '🇧🇼', country: 'Botswana', currency: 'BWP' },
  { code: 'NA', flag: '🇳🇦', country: 'Namibia', currency: 'NAD' },
  { code: 'BH', flag: '🇧🇭', country: 'Bahrain', currency: 'BHD' },
  { code: 'QA', flag: '🇶🇦', country: 'Qatar', currency: 'QAR' },
  { code: 'KW', flag: '🇰🇼', country: 'Kuwait', currency: 'KWD' },
  { code: 'OM', flag: '🇴🇲', country: 'Oman', currency: 'OMR' },
  { code: 'JO', flag: '🇯🇴', country: 'Jordan', currency: 'JOD' },
  { code: 'IQ', flag: '🇮🇶', country: 'Iraq', currency: 'IQD' },
  { code: 'AF', flag: '🇦🇫', country: 'Afghanistan', currency: 'AFN' },
  { code: 'IR', flag: '🇮🇷', country: 'Iran', currency: 'IRR' },
  { code: 'KG', flag: '🇰🇬', country: 'Kyrgyzstan', currency: 'KGS' },
  { code: 'TJ', flag: '🇹🇯', country: 'Tajikistan', currency: 'TJS' },
] as const

const currencyStorageKey = 'memescope-display-currency'
const countryStorageKey = 'memescope-display-country'
const ratesStorageKey = 'memescope-usd-exchange-rates'
const supportedCurrencyCodes = new Set<string>(currencyOptions.map(({ code }) => code))

function readSavedCurrency(): CurrencyCode {
  const saved = localStorage.getItem(currencyStorageKey)
  return saved && supportedCurrencyCodes.has(saved) ? saved as CurrencyCode : 'USD'
}

function readSavedCountry() {
  const saved = localStorage.getItem(countryStorageKey)
  const country = countryOptions.find((option) => option.code === saved)
  if (country) return country.code
  const legacyCurrency = readSavedCurrency()
  return countryOptions.find((option) => option.currency === legacyCurrency)?.code || 'US'
}

function readSavedRates(): { rates: Record<string, number>; date: string | null } {
  try {
    const saved = JSON.parse(localStorage.getItem(ratesStorageKey) || 'null') as {
      rates?: Record<string, number>
      date?: string
    } | null
    if (!saved?.rates || typeof saved.rates !== 'object') return { rates: { USD: 1 }, date: null }
    const rates = Object.fromEntries(
      Object.entries(saved.rates).filter(([, rate]) => Number.isFinite(rate) && rate > 0),
    )
    return { rates: { USD: 1, ...rates }, date: saved.date || null }
  } catch {
    return { rates: { USD: 1 }, date: null }
  }
}

const savedRates = readSavedRates()
export const selectedCountry = ref(readSavedCountry())
export const selectedCurrency = ref<CurrencyCode>(countryOptions.find((option) => option.code === selectedCountry.value)?.currency || readSavedCurrency())
export const currencyRates = ref<Record<string, number>>(savedRates.rates)
export const currencyRateDate = ref<string | null>(savedRates.date)
export const currencyRateError = ref('')
export const currencyRatesLoading = ref(false)

export function setSelectedCountry(code: string) {
  const country = countryOptions.find((option) => option.code === code)
  if (!country) return null
  selectedCountry.value = country.code
  selectedCurrency.value = country.currency
  localStorage.setItem(countryStorageKey, country.code)
  localStorage.setItem(currencyStorageKey, country.currency)
  return country
}

export function setSelectedCurrency(code: string) {
  if (!supportedCurrencyCodes.has(code)) return
  selectedCurrency.value = code as CurrencyCode
  localStorage.setItem(currencyStorageKey, code)
}

export async function refreshCurrencyRates() {
  currencyRatesLoading.value = true
  currencyRateError.value = ''
  try {
    const response = await fetch('https://open.er-api.com/v6/latest/USD')
    if (!response.ok) throw new Error('Currency exchange rates are temporarily unavailable.')
    const payload = await response.json() as {
      result?: string
      time_last_update_utc?: string
      rates?: Record<string, number>
    }
    if (payload.result !== 'success' || !payload.time_last_update_utc || !payload.rates) {
      throw new Error('Currency exchange rates returned an invalid response.')
    }

    const rates = Object.fromEntries(
      Object.entries(payload.rates).filter(([, rate]) => Number.isFinite(rate) && rate > 0),
    )
    for (const { code } of currencyOptions) {
      if (code !== 'USD' && !rates[code]) throw new Error(`The exchange rate for ${code} is unavailable.`)
    }

    currencyRates.value = { USD: 1, ...rates }
    currencyRateDate.value = payload.time_last_update_utc
    localStorage.setItem(ratesStorageKey, JSON.stringify({ date: payload.time_last_update_utc, rates: currencyRates.value }))
  } catch (error) {
    currencyRateError.value = error instanceof Error ? error.message : 'Currency exchange rates could not be updated.'
    throw error
  } finally {
    currencyRatesLoading.value = false
  }
}

function currencyLocale(code: CurrencyCode) {
  return currencyOptions.find((option) => option.code === code)?.locale || 'en-US'
}

export function formatCurrency(value: number, compact = false) {
  const code = selectedCurrency.value
  const rate = currencyRates.value[code]
  if (!rate) {
    const usd = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      ...(compact ? { notation: 'compact' as const, maximumFractionDigits: 2 } : { maximumSignificantDigits: 7 }),
    }).format(value)
    return `${usd} USD`
  }

  return new Intl.NumberFormat(currencyLocale(code), {
    style: 'currency',
    currency: code,
    ...(compact ? { notation: 'compact', maximumFractionDigits: 2 } : { maximumSignificantDigits: 7 }),
  }).format(value * rate)
}
