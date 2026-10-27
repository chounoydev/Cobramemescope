import { readFile } from 'node:fs/promises'

let contents
try {
  contents = await readFile(new URL('../.env.android', import.meta.url), 'utf8')
} catch (error) {
  if (error.code !== 'ENOENT') throw error
  throw new Error('Copy android.env.example to .env.android and set the deployed HTTPS API URL before building the Android app.')
}

const match = contents.match(/^\s*VITE_API_URL\s*=\s*(.*?)\s*$/m)
const value = match?.[1].replace(/^(['"])(.*)\1$/, '$2').trim()
if (!value) {
  throw new Error('Set VITE_API_URL in .env.android to the deployed HTTPS API origin before building the Android app.')
}

let apiUrl
try {
  apiUrl = new URL(value)
} catch {
  throw new Error('VITE_API_URL in .env.android must be a valid public HTTPS URL.')
}

if (apiUrl.protocol !== 'https:' || apiUrl.pathname !== '/' || apiUrl.search || apiUrl.hash) {
  throw new Error('VITE_API_URL in .env.android must be the public HTTPS origin, without a path, query, or fragment.')
}

const publicUrlMatch = contents.match(/^\s*VITE_PUBLIC_APP_URL\s*=\s*(.*?)\s*$/m)
const publicUrlValue = publicUrlMatch?.[1].replace(/^(['"])(.*)\1$/, '$2').trim()
if (!publicUrlValue) {
  throw new Error('Set VITE_PUBLIC_APP_URL in .env.android to the deployed public HTTPS site origin for Phantom mobile sign-in.')
}

let publicUrl
try {
  publicUrl = new URL(publicUrlValue)
} catch {
  throw new Error('VITE_PUBLIC_APP_URL in .env.android must be a valid public HTTPS URL.')
}

if (publicUrl.protocol !== 'https:' || publicUrl.pathname !== '/' || publicUrl.search || publicUrl.hash) {
  throw new Error('VITE_PUBLIC_APP_URL in .env.android must be the public HTTPS origin, without a path, query, or fragment.')
}
