'use strict'

module.exports.handler = (event, context, callback) => {
  const myIp = event.requestContext.identity.sourceIp
  const headers = {
    'Content-Type': 'text/plain'
  }
  const response = {
    statusCode: 200,
    body: myIp,
    headers: headers
  }
  callback(null, response)
}
