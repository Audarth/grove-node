'use strict'

const router = require('express').Router()
const http = require('http')
const options = require('../utils/options')()

const processError = error => error.errorResponse

router.get('/', (req, res) => {
  // getAuth(req).then(auth => {
  const uri = req.query.uri
  const httpOptions = {
    // protocol: options.httpsStrict ? 'https' : 'http',
    hostname: options.mlHost,
    port: options.mlHttpPort,
    path: '/v1/documents?uri=' + uri,
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
    // auth: auth
  }
  const mlRequest = http.request(httpOptions, mlResponse => {
    let docBody = ''
    mlResponse.on('data', chunk => {
      docBody += chunk
    })
    mlResponse.on('end', () => {
      if (mlResponse.statusCode === 200) {
        const contentType = mlResponse.headers['content-type']
        if (contentType.includes('application/json')) {
          docBody = JSON.parse(docBody)
        }
        res.json({
          content: docBody,
          contentType: contentType
        })
      } else {
        res
          .status(mlResponse.statusCode)
          .json(processError(JSON.parse(docBody)))
      }
    })
  })

  mlRequest.on('error', e => {
    console.error(`problem with request: ${e.message}`)
  })

  mlRequest.end()
  // })
})

module.exports = router
