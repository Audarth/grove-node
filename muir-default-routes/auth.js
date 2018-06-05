'use strict'

var provider = (function(){

  const authHelper = require('../muir-node-server-utils/auth-helper')
  const backend = require('../muir-node-server-utils/backend')
  //const fs = require('fs')
  const four0four = require('../muir-node-server-utils/404')()
  const options = require('../muir-node-server-utils/options')()

  var ca = ''
  // FIXME: better handled inside options?
  // if (options.mlCertificate) {
  //   console.log('Loading ML Certificate ' + options.mlCertificate)
  //   ca = fs.readFileSync(options.mlCertificate)
  // }

  const acceptJsonTypes = ['application/json','application/*','*/*']

  var provide = function(config) {
    var router = require('express').Router()

    router.get('/status', function(req, res) {
      // reply with 406 if client doesn't accept JSON
      if (!req.accepts(acceptJsonTypes)) {
        four0four.notAcceptable(req, res, acceptJsonTypes)
        return
      }

      noCache(res)
      if (!req.isAuthenticated()) {
        // /status never returns 401
        sendAuthStatus(res, false)
      } else {
        var passportUser = req.session.passport.user
        var path = '/v1/documents'
        var params = {
          uri: '/api/users/' + passportUser.username + '.json'
        }
        var reqOptions = {
          path: path,
          params: params,
          headers: req.headers,
          ca: ca
        }

        authHelper
        .getAuth(req.session, reqOptions)
        .then(function(authorization) {
          if (authorization) {
            reqOptions.headers.Authorization = authorization
          }

          backend.call(req, reqOptions, function(backendResponse, data) {
            if (backendResponse.statusCode === 200) {
              var json = JSON.parse(data.toString())
              sendAuthStatus(res, true, passportUser.username, json.user)
            } else if (backendResponse.statusCode === 404) {
              // no profile yet for user
              sendAuthStatus(res, true, passportUser.username, null)
            } else {
              sendAuthStatus(res, false)
            }
          })

        }, function(unauthorized) {
          // /status never returns 401
          sendAuthStatus(res, false)
        })
      }
    })

    // Anything except GET /status is denied with a 405
    router.use('/status', function(req, res) {
      four0four.methodNotAllowed(req, res, ['POST']);
    })

    router.post('/login', function(req, res, next) {
      // reply with 415 if body isn't JSON
      if (!req.is('application/json')) {
        four0four.unsupportedMediaType(req, res, ['application/json']);
        return
      }

      // reply with 406 if client doesn't accept JSON
      if (!req.accepts(acceptJsonTypes)) {
        four0four.notAcceptable(req, res, acceptJsonTypes)
        return
      }

      // handle body parsing old fashion way, as we only want to apply it for /login
      // and only after doing above asserts
      var data = []
      req.on('data', function(chunk) {
        data.push(chunk)
      })
      req.on('end', function() {
        req.body = JSON.parse(Buffer.concat(data).toString())

        // reply with 400 if username or password is missing
        var username = req.body.username;
        var password = req.body.password;
        if (username === undefined || password === undefined) {
          four0four.missingRequired(req, res, ['username', 'password']);
          return;
        }

        // make sure login isn't cached
        noCache(res)

        var startsWithMatch = new RegExp('^' + options.appName + '-')
        if (options.appUsersOnly && !startsWithMatch.test(username)) {
          four0four.forbidden(req, res)
        } else {
          authHelper.handleLocalAuth(req, res, next)
        }
      })
    })

    // Anything except POST /login is denied with a 405
    router.use('/login', function(req, res) {
      four0four.methodNotAllowed(req, res, ['POST']);
    })

    router.post('/logout', function(req, res) {
      noCache(res) // TODO: nothing to cache?
      req.logout()
      authHelper.clearAuthenticator(req.session)
      res.status(204).end()
    })

    // Anything except POST /logout is denied with a 405
    router.use('/logout', function(req, res) {
      four0four.methodNotAllowed(req, res, ['POST']);
    })

    // TODO: make more use of route middle-ware for checking authenticated and req assertions?
    // router.use(authHelper.handleLocalAuth);

    router.get('/profile', function(req, res) {
      // reply with 406 if client doesn't accept JSON
      if (!req.accepts(acceptJsonTypes)) {
        four0four.notAcceptable(req, res, acceptJsonTypes)
        return
      }

      noCache(res) // TODO: should we disallow caching?
      if (!req.isAuthenticated()) {
        // /profile does return 401
        four0four.unauthorized(req, res)
      } else {
        // TODO: still too much copy-paste from /status here
        var passportUser = req.session.passport.user
        var path = '/v1/documents'
        var params = {
          uri: '/api/users/' + passportUser.username + '.json'
        }
        var reqOptions = {
          path: path,
          params: params,
          headers: req.headers,
          ca: ca
        }

        authHelper
        .getAuth(req.session, reqOptions)
        .then(function(authorization) {
          if (authorization) {
            reqOptions.headers.Authorization = authorization
          }

          // call backend, and pipe clientResponse straight into res
          backend.call(req, reqOptions, null, res)

        }, function(unauthorized) {
          // TODO: might return an error too?
          // /profile does return 401
          four0four.unauthorized(req, res)
        })
      }
    })

    router.post('/profile', function(req, res) {
      // reply with 415 if body isn't JSON
      if (!req.is('application/json')) {
        four0four.unsupportedMediaType(req, res, ['application/json'])
        return
      }

      // TODO? req.getAuth().then....

      noCache(res) // TODO: nothing to cache anyhow?
      if (!req.isAuthenticated()) {
        // /profile does return 401
        four0four.unauthorized(req, res)
      } else {
        var passportUser = req.session.passport.user
        var path = '/v1/documents'
        var params = {
          uri: '/api/users/' + passportUser.username + '.json'
        }

        var reqOptions = {
          method: 'PUT',
          path: path,
          params: params,
          headers: req.headers,
          ca: ca
        }

        authHelper
        .getAuth(req.session, reqOptions)
        .then(function(authorization) {
          if (authorization) {
            reqOptions.headers.Authorization = authorization
          }

          // call backend, and pipe clientResponse straight into res
          backend.call(req, reqOptions, null, res)

        }, function(unauthorized) {
          // /profile does return 401
          four0four.unauthorized(req, res)
        })
      }
    })

    return router;
  };

  function noCache(response) {
    response.append('Cache-Control', 'no-cache, must-revalidate') // HTTP 1.1 - must-revalidate
    response.append('Pragma', 'no-cache') // HTTP 1.0
    response.append('Expires', 'Sat, 26 Jul 1997 05:00:00 GMT') // Date in the past
  }

  function sendAuthStatus(res, authenticated, username, profile) {
    res
    .status(200)
    .json({
      authenticated: authenticated,
      username: username,
      profile: profile || {},
      disallowUpdates: options.disallowUpdates,
      appUsersOnly: options.appUsersOnly,
      appName: options.appName
    })
  }

  return provide;
})();

module.exports = provider