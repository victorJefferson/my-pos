/**
 * tokenStore.js — A simple module-level store for the Clerk session token.
 *
 * Why: Axios interceptors live outside React, so we can't use hooks there.
 * The AuthWrapper component (which IS inside React) calls setToken()
 * whenever Clerk refreshes the token. The Axios interceptor reads getToken()
 * before every request.
 */

let _token = null
let _tokenFetcher = null

export function setToken(token) {
  _token = token
}

export function setTokenFetcher(fetcherFn) {
  _tokenFetcher = fetcherFn
}

export function getToken() {
  return _token
}

export async function getFreshToken(options = {}) {
  if (_tokenFetcher) {
    try {
      const fresh = await _tokenFetcher(options)
      if (fresh) {
        _token = fresh
        return fresh
      }
    } catch (e) {
      console.warn('[Appa Software] Token fetcher failed:', e)
    }
  }
  return _token
}
