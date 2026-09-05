import {
    REMNAWAVE_CLIENT_TYPE_BROWSER,
    REMNAWAVE_CLIENT_TYPE_HEADER
} from '@remnawave/backend-contract'
import axios from 'axios'
import consola from 'consola/browser'

import { logoutEvents } from '../emitters/emit-logout'
import { clearQueryClient } from './query-client'
import { createSessionRequestBoundary } from './session-request-boundary'

let BASE_DOMAIN = __DOMAIN_BACKEND__
const isDev = __NODE_ENV__ === 'development'
const isDomainOverride = __DOMAIN_OVERRIDE__ === '1'

if (isDev) {
    BASE_DOMAIN = __DOMAIN_BACKEND__
} else {
    BASE_DOMAIN = window.location.origin
}

if (isDomainOverride) {
    BASE_DOMAIN = __DOMAIN_BACKEND__
}

export const getBackendDomain = () => BASE_DOMAIN

export const instance = axios.create({
    baseURL: BASE_DOMAIN,
    headers: {
        'Content-type': 'application/json',
        Accept: 'application/json',
        [REMNAWAVE_CLIENT_TYPE_HEADER]: REMNAWAVE_CLIENT_TYPE_BROWSER
    }
})

const authorizationSession = createSessionRequestBoundary(
    instance,
    () => {
        try {
            logoutEvents.emit()
        } catch (error) {
            consola.log('error', error)
        }
    },
    clearQueryClient
)

export const setAuthorizationToken = authorizationSession.setToken
export const getAuthorizationToken = authorizationSession.getToken
export const hasAuthorizationToken = () => getAuthorizationToken() !== ''
export const getSessionGeneration = authorizationSession.getGeneration
export const assertSessionGeneration = authorizationSession.assertGeneration
