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
const got = require('got')

module.exports.handler = (event, context) => {
  let url = 'https://datahub.io/core/airport-codes/r/airport-codes.json'
  return getCodes(url).then((codes) => {
    console.log('Received ' + codes.length + ' airport codes')
    let params = {
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
  return got(url)
    .then((res) => {
      return iataOnly(JSON.parse(res.body))
    })
}

const iataOnly = (data) => {
  return data.filter(airport => airport.iata_code !== null)
}
