'use strict'

const ipData = require('../../lib/ipinfo.js')

module.exports.handler = async (event) => {
  console.log('Event received:', JSON.stringify(event))
  const myIp = event.requestContext.identity.sourceIp
  const countryData = await ipData.getInfo(myIp, 'country')
  let country = {}
  if (countryData.statusCode === 200) {
    country = countryData.ipInfo
  }
  const cityData = await ipData.getInfo(myIp, 'city')
  let city = {}
  if (cityData.statusCode === 200) {
    city = cityData.ipInfo
  }
  let asn = {}
  const asnData = await ipData.getInfo(myIp, 'asn')
  if (asnData.statusCode === 200) {
    asn = asnData.ipInfo
  }
  const info = {
    myIp: myIp,
    country: country,
    city: city,
    asn: asn
  }
  const headers = {
    'Cache-Control': 'max-age=0'
  }
  const response = {
    statusCode: 200,
    body: JSON.stringify(info),
    headers: headers
  }
  console.log(JSON.stringify(response, null, 2))
  return response
}
