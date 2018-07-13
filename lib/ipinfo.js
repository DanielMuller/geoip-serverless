'use strict'

const AWS = require('aws-sdk')
const s3 = new AWS.S3({
  region: process.env.AWS_REGION,
  params: {
    Bucket: process.env.dataBucket
  }
})
const ip = require('ip')
const path = require('path')
const dateFormat = require('dateformat')

const dbMapping = {
  city: process.env.dbCity,
  country: process.env.dbCountry,
  asn: process.env.dbAsn
}

module.exports.getInfo = async (ipRequest, dbType) => {
  if (!ip.isV4Format(ipRequest)) {
    return invalidContent('Invalid IP ' + ipRequest)
  }
  console.log('ip:', ipRequest)
  let networkHead = parseInt(ipRequest.split('.')[0])
  console.log('networkHead:', networkHead)
  let ipLong = ''
  try {
    ipLong = ip.toLong(ipRequest)
  } catch (error) {
    return invalidContent('Invalid IP ' + ipRequest)
  }

  let data = {}
  if (dbType === '') {
    data = await getEntry(networkHead, ipLong, dbMapping['city'])
    if (data === null) {
      return invalidContent('IP not found', 404)
    }
    let asn = await getEntry(networkHead, ipLong, dbMapping['asn'])
    if (asn === null) {
      data['data']['asn'] = {}
    } else {
      data['data']['asn'] = asn['data']
    }
    if ('valid_until' in data && 'valid_until' in asn) {
      data['valid_until'] = Math.min(data['valid_until'], asn['valid_until'])
    } else if ('valid_until' in asn) {
      data['valid_until'] = asn['valid_until']
    } else if (!('valid_until' in data)) {
      data['valid_until'] = 0
    }
  } else {
    let dbPath = ''
    try {
      dbPath = dbMapping[dbType]
    } catch (error) {
      dbPath = ''
    }
    if (dbPath === '' || dbPath === undefined) {
      return invalidContent('Invalid database')
    }
    data = await getEntry(networkHead, ipLong, dbPath)
  }

  console.log('data:', data)

  let headers = {}
  if ('data' in data && data['data']) {
    if ('valid_until' in data && data['valid_until']) {
      let expires = new Date(data['valid_until'] * 1000)
      console.log(dateFormat(expires))
      let now = new Date()
      console.log(dateFormat(now))
      if (expires > now) {
        headers['Expires'] = dateFormat(expires, 'expiresHeaderFormat', true)
      } else {
        headers['Cache-Control'] = 'max-age: 86400'
      }
    } else {
      headers['Cache-Control'] = 'max-age: 86400'
    }
    let response = {
      statusCode: 200,
      ipInfo: data['data'],
      headers: headers
    }
    return response
  } else {
    return invalidContent('IP not found', 404)
  }
}

const getEntry = async (networkHead, ipLong, dbPath) => {
  let dataPath = process.env.dataPath
  let dataBucket = process.env.dataBucket

  let key = path.join(dataPath, 'db', dbPath, networkHead.toString())
  let expression = 'select * from s3object s where s.network_range_start<=' + ipLong + ' and s.network_range_end>=' + ipLong

  let params = {
    Bucket: dataBucket,
    Key: key + '.gz',
    Expression: expression,
    ExpressionType: 'SQL',
    InputSerialization: {
      'JSON': {
        'Type': 'LINES'
      },
      'CompressionType': 'GZIP'
    },
    OutputSerialization: {
      'JSON': {}
    }
  }
  let queryResult = await s3Select(params)
  return queryResult
}

const s3Select = async (params) => {
  return new Promise((resolve, reject) => {
    let record = {}
    s3.selectObjectContent(params, (err, data) => {
      if (err) {
        resolve(null)
        return null
      }
      let eventStream = data.Payload
      eventStream.on('data', function (event) {
        if (event.Records) {
          if (event.Records.Payload) {
            record = JSON.parse(event.Records.Payload.toString())
          }
        }
      })
      eventStream.on('error', function (err) { console.log('err', err) })
      eventStream.on('end', function () {
        resolve(record)
        return record
      })
    })
  })
}

const invalidContent = (reason, code = 400) => {
  let response = {
    statusCode: code,
    message: reason
  }
  console.log('invalidContent', response)
  return response
}
