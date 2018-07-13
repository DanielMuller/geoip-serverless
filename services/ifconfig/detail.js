'use strict'

const https = require('https')

module.exports.handler = async (event) => {
  console.log(JSON.stringify(event))
  let myIp = event.requestContext.identity.sourceIp
  let country = await getInfo(myIp, 'country')
  let city = await getInfo(myIp, 'city')
  let asn = await getInfo(myIp, 'asn')
  let info = {
    country: country,
    asn: asn,
    city: city
  }
  let headers = {
    'Cache-Control': 'max-age:0'
  }
  let response = {
    statusCode: 200,
    body: info,
    headers: headers
  }
  console.log(JSON.stringify(response, null, 2))
  return response
}

const getInfo = async (ip, db) => {
  return new Promise((resolve, reject) => {
    let options = {
      host: process.env.countryApiDomain,
      path: '/ipv4/' + ip + '/' + db,
      headers: {
        'x-api-key': process.env.countryApiKey
      }
    }
    let rawData = ''
    https.get(options, (res) => {
      res.on('data', (chunk) => {
        rawData += chunk
      })
      res.on('end', () => {
        return JSON.parse(rawData)
      })
    }).on('error', (e) => {
      console.error(e)
      reject(e)
    })
  })
}
