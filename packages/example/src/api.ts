import { Functions } from './functions'
import { module } from './module'
import { Types } from './types'
import { CronApi } from '@mondrian-framework/cron'
import { GraphqlApi } from '@mondrian-framework/graphql'
import { RestApi } from '@mondrian-framework/rest'

//TODO:
//How to exlude function implementation in package release?
//create a genetaror that writes a sdk.ts with only the required information
export const MODULE = module

export const REST_API: RestApi<Functions> = {
  version: 100,
  functions: {
    register: [
      { method: 'post', path: '/subscribe', version: { max: 1 } },
      { method: 'put', path: '/register', version: { min: 2 } },
    ],
    users: { method: 'get', version: { min: 2 } },
    login: { method: 'get', path: '/login/{email}' },
    publish: { method: 'get', version: { min: 2 }, path: '/publish/{title}' },
    myPosts: { method: 'post', path: '/posts' },
    test: { method: 'post', path: '/test/{tenantId}' },
  },
  options: { introspection: true },
}

export const GRAPHQL_API = {
  functions: {
    register: [
      { type: 'mutation', name: 'subscribe', inputName: 'user' },
      { type: 'mutation', name: 'register', inputName: 'user' },
    ],
    users: { type: 'query', namespace: null },
    login: { type: 'query' },
    publish: { type: 'mutation', inputName: 'post' },
    myPosts: { type: 'query', name: 'posts' },
  },
  options: { introspection: true },
} satisfies GraphqlApi<Functions>

export const CRON_API = {
  functions: {
    checkPost: {
      cron: '*/30 * * * * *',
      runAtStart: false,
    },
  },
} satisfies CronApi<Types, Functions>
