'use strict'

const ipData = require('../lib/ipinfo.js')

module.exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event))
  let ipRequest = event['pathParameters']['ip']
  let dbType = ''
  if ('dbType' in event['pathParameters']) {
    dbType = event['pathParameters']['dbType']
  }
  let ipInfo = await ipData.getInfo(ipRequest, dbType)
  let response = {}
  if (ipInfo.statusCode === 200) {
    response = {
      statusCode: ipInfo.statusCode,
      body: JSON.stringify(ipInfo.ipInfo),
      headers: ipInfo.headers
    }
  } else {
    response = {
      statusCode: ipInfo.statusCode,
      body: JSON.stringify({ message: ipInfo.message }),
      headers: {
        'Cache-Control': 'max-age=60'
      }
    }
  }
  console.log('Response:', JSON.stringify(response, null, 2))
  return response
}
