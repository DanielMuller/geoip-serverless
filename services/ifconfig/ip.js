'use strict'

module.exports.handler = (event, context, callback) => {
  let myIp = event.requestContext.identity.sourceIp
  let headers = {
    'Content-Type': 'text/plain'
  }
  let response = {
    statusCode: 200,
    body: myIp,
    headers: headers
  }
  callback(null, response)
}
