import { httpRouter } from 'convex/server'

import { authComponent, createAuth } from './auth'
import { upload, uploadPreflight } from './fileUpload'

const http = httpRouter()
authComponent.registerRoutesLazy(http, createAuth, { basePath: '/api/auth' })
http.route({ path: '/files/upload', method: 'POST', handler: upload })
http.route({
  path: '/files/upload',
  method: 'OPTIONS',
  handler: uploadPreflight,
})
export default http
