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

module.exports.handler = async (event, context, callback) => {
  let url = 'https://datahub.io/core/airport-codes/r/airport-codes.json'
  getCodes(url).then((codes) => {
    let params = {
      Key: path.join(dataPath, 'src', 'airports', 'iata_codes.json.gz'),
      Body: zlib.gzipSync(JSON.stringify(codes)),
      ContentType: 'application/json',
      ContentEncoding: 'gzip'
    }
    return s3.putObject(params).promise()
  })
}

const getCodes = (url) => {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let response = ''
      if (res.statusCode === 302) {
        resolve(getCodes(res.headers['location']))
        return getCodes(res.headers['location'])
      }
      res.on('data', (d) => {
        response += d.toString()
      })
      res.on('end', () => {
        let content = iataOnly(JSON.parse(response))
        resolve(content)
        return content
      })
    }).on('error', (e) => {
      console.error(e)
      reject(e)
    })
  })
}
const iataOnly = (data) => {
  return data.filter(airport => airport.iata_code !== null)
}
