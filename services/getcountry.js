'use strict'

const AWS = require('aws-sdk')
const s3 = new AWS.S3({
  region: process.env.AWS_REGION,
  params: {
    Bucket: process.env.dataBucket
  }
})
const path = require('path')

module.exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event))
  let countryCode = event['pathParameters']['code'].toLowerCase()
  if (/^[a-z]{2}$/.test(countryCode) === false) {
    return invalidContent('Invalid Country Code', 400)
  }
  let dataPath = process.env.dataPath

  let key = path.join(dataPath, 'db', 'geonames', 'country', countryCode)
  let countryInfo = await s3.getObject({Key: key}).promise().then((data) => {
    return JSON.parse(data.Body.toString())
  }).catch((err) => {
    if (err) {
      console.log('Key ' + key + ' not found')
    }
    return null
  })
  if (!countryInfo) {
    return invalidContent('Country not found', 404)
  }
  let response = {
    statusCode: 200,
    body: JSON.stringify(countryInfo),
    headers: {
      'Cache-Control': 'max-age: 2628000'
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
