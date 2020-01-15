'use strict'

const country = require('../lib/country')(process.env.dataPath)

module.exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event))
  const countryCode = event.pathParameters.code.toLowerCase()
  const countryInfo = await country.getInfo(countryCode)

  if (countryInfo === false) {
    return invalidContent('Invalid Country Code', 400)
  }
  if (countryInfo === '') {
    return invalidContent('Country not found', 404)
  }
  const response = {
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
  const body = {
    message: reason
  }
  const response = {
    statusCode: code,
    body: JSON.stringify(body),
    headers: {
      'Cache-Control': 'max-age=60'
    }
  }
  console.log('Response:', JSON.stringify(response, null, 2))
  return response
}
