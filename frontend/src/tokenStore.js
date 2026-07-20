/**
 * tokenStore.js — A simple module-level store for the Clerk session token.
 *
 * Why: Axios interceptors live outside React, so we can't use hooks there.
 * The AuthWrapper component (which IS inside React) calls setToken()
 * whenever Clerk refreshes the token. The Axios interceptor reads getToken()
 * before every request.
 */

let _token = null

export function setToken(token) {
  _token = token
}

export function getToken() {
  return _token
}
