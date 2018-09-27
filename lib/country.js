'use strict'

const AWS = require('aws-sdk')
const s3 = new AWS.S3({
  region: process.env.AWS_REGION,
  params: {
    Bucket: process.env.dataBucket
  }
})
const path = require('path')

module.exports = (dataPath) => {
  var module = {}

  module.getInfo = async (countryCode) => {
    countryCode = countryCode.toLowerCase()
    if (/^[a-z]{2}$/.test(countryCode) === false) {
      return false
    }

    let key = path.join(dataPath, 'db', 'geonames', 'country', countryCode)
    let countryInfo = await s3GetSync(key)
    if (!countryInfo) {
      return ''
    }
    return countryInfo
  }

  return module
}

const s3GetSync = async (key) => {
  var data = await s3.getObject({Key: key}).promise().then((resp) => {
    return JSON.parse(resp.Body.toString())
  }).catch((err) => {
    if (err) {
      console.log('Key ' + key + ' not found')
    }
    return ''
  })
  return data
}
