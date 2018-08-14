'use strict'

const ipData = require('../../lib/ipinfo.js')

module.exports.handler = async (event) => {
  console.log('Event received:', JSON.stringify(event))
  let myIp = event.requestContext.identity.sourceIp
  let countryData = await ipData.getInfo(myIp, 'country')
  let country = {}
  if (countryData.statusCode === 200) {
    country = countryData.ipInfo
  }
  let cityData = await ipData.getInfo(myIp, 'city')
  let city = {}
  if (cityData.statusCode === 200) {
    city = cityData.ipInfo
  }
  let asn = {}
  let asnData = await ipData.getInfo(myIp, 'asn')
  if (asnData.statusCode === 200) {
    asn = asnData.ipInfo
  }
  let info = {
    myIp: myIp,
    country: country,
    city: city,
    asn: asn
  }
  let headers = {
    'Cache-Control': 'max-age=0'
  }
  let response = {
    statusCode: 200,
    body: JSON.stringify(info),
    headers: headers
  }
  console.log(JSON.stringify(response, null, 2))
  return response
}
