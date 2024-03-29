'use strict'

const AWS = require('aws-sdk')

const s3 = new AWS.S3({
  region: process.env.AWS_REGION,
  params: {
    Bucket: process.env.dataBucket
  }
})
const dataPath = process.env.dataPath
const path = require('path')
const zlib = require('zlib')
const https = require('https')
const got = require('got')
const urlToOptions = require('url-to-options')
const gots = got.extend({
  request: (url, options, callback) => {
    return https.request({ ...options, ...urlToOptions(url) }, callback)
  }
})

module.exports.handler = (event, context) => {
  const url = 'https://datahub.io/core/airport-codes/r/airport-codes.json'
  return getCodes(url).then((codes) => {
    console.log('Received ' + codes.length + ' airport codes')
    const params = {
      Key: path.join(dataPath, 'src', 'airports', 'iata_codes.json.gz'),
      Body: zlib.gzipSync(JSON.stringify(codes)),
      ContentType: 'application/json',
      ContentEncoding: 'gzip'
    }
    console.log('Storing to ' + params.Key)
    return s3.putObject(params).promise()
  })
}

const getCodes = (url) => {
  return gots(url)
    .then((res) => {
      return iataOnly(JSON.parse(res.body))
    })
    .catch(err => console.log(err))
}

const iataOnly = (data) => {
  return data.filter(airport => airport.iata_code !== null)
}
