'use strict'

const AWS = require('aws-sdk')
const s3 = new AWS.S3({
  region: process.env.AWS_REGION,
  params: {
    Bucket: process.env.dataBucket
  }
})
const path = require('path')
const zlib = require('zlib')

module.exports.handler = async (event) => {
  let edgeName = event['pathParameters']['code'].toLowerCase()
  if (!/^[a-z]{3}[0-9]?[0-9]?(-.+)?$/.test(edgeName)) {
    return invalidContent('Invalid Edge', 400)
  }
  let shardId = edgeName.substring(0, 1)
  let dataPath = process.env.dataPath

  let key = path.join(dataPath, 'db', 'cloudfront', 'edges', shardId + '.json.gz')
  let shard = await getShard(key)
  if (shard === null) {
    return invalidContent('Shard not found', 404)
  }
  let data = null
  if (edgeName in shard) {
    console.log('Found detail case:', edgeName)
    data = shard[edgeName]
  } else if (edgeName.substring(0, 3) in shard) {
    console.log('Found standard case:', edgeName.substring(0, 3))
    data = shard[edgeName.substring(0, 3)]
  }
  if (data === null) {
    return invalidContent('Edge not found', 404)
  }
  let response = {
    statusCode: 200,
    body: JSON.stringify(data),
    headers: {
      'Cache-Control': 'max-age: 2628000'
    }
  }
  console.log('Response:', JSON.stringify(data, null, 2))
  return response
}

const getShard = async (key) => {
  return s3.getObject({Key: key}).promise().then((data) => {
    return JSON.parse(zlib.gunzipSync(data.Body))
  }).catch((err) => {
    if (err) {
      console.log('Key ' + key + ' not found')
    }
    return null
  })
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
