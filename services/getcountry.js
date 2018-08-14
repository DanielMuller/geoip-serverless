'use strict'

const country = require('../lib/country')(process.env.dataPath)

module.exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event))
  let countryCode = event['pathParameters']['code'].toLowerCase()
  let countryInfo = await country.getInfo(countryCode)

  if (countryInfo === false) {
    return invalidContent('Invalid Country Code', 400)
  }
  if (countryInfo === '') {
    return invalidContent('Country not found', 404)
  }
  let response = {
    statusCode: 200,
    body: JSON.stringify(countryInfo),
    headers: {
      'Cache-Control': 'max-age=2628000'
    }
  }
  console.log('Response:', JSON.stringify(countryInfo, null, 2))
  return response
}

const invalidContent = (reason, code = 400) => {
  let body = {
    message: reason
  }
  let response = {
    statusCode: code,
    body: JSON.stringify(body),
    headers: {
      'Cache-Control': 'max-age=60'
    }
  }
  console.log('Response:', JSON.stringify(response, null, 2))
  return response
}
