'use strict'

const fs = require('fs')
const path = require('path')
const csvjson = require('csvjson')
const csv = require('csvtojson')
const ip = require('ip')
const rimraf = require('rimraf')
const zlib = require('zlib')
const AWS = require('aws-sdk')
const s3 = new AWS.S3({
  region: process.env.AWS_REGION,
  params: {
    Bucket: process.env.dataBucket
  }
})
const dataPath = process.env.dataPath
const locale = process.env.locale

module.exports.handler = async (event, context) => {
  let bucket = event.Records[0].s3.bucket.name
  if (bucket !== process.env.dataBucket) {
    let error = new Error('Event bucket is different from dataBucket (' + bucket + ' !== ' + process.env.dataBucket + ')')
    return Promise.reject(error)
  }
  let dbManifest = event.Records[0].s3.object.key
  let dbEdition = getDbEdition(dbManifest)
  if (!dbEdition) {
    let error = new Error('Unable to identify dbEdition in ' + dbManifest)
    return Promise.reject(error)
  }

  let manifest = await getS3Data(dbManifest)
  let dbInfo = getDataFiles(manifest, dbEdition)
  if (!dbInfo.ranges) {
    let error = new Error('No range file in ' + dbManifest)
    return Promise.reject(error)
  }
  let uploads = []
  let locationData = null
  if (dbInfo.geonames) {
    locationData = await getLocationData(dbInfo.geonames)
    if (dbInfo.type === 'country') {
      for (let geonameId in locationData) {
        let countryInfo = formatCountry(locationData[geonameId])
        if (countryInfo.country.code !== '') {
          let key = path.join(dataPath, 'db', 'geonames', 'country', countryInfo.country.code.toLowerCase())
          uploads.push(createFile(countryInfo, key))
        }
      }
    }
  }

  let tempDir = path.join('/tmp', Date.now().toString())
  fs.mkdirSync(tempDir)
  let csvFilePath = path.join(tempDir, 'ranges.csv.gz')
  await saveS3ToDisk(dbInfo.ranges, csvFilePath)
  console.log(dbEdition + ' saved to disk: ' + csvFilePath)
  let dbPartitions = await generateDB(csvFilePath, dbInfo, locationData)
  console.log(dbEdition + ' converted to JSON')
  for (let i = 0; i < dbPartitions.length; i++) {
    let file = dbPartitions[i] + '.gz'
    let filename = path.basename(file)
    let key = path.join('db', dbEdition, filename)
    uploads.push(upload(file, key))
  }
  return Promise.all(uploads).then((files) => {
    console.log('uploaded:', JSON.stringify(files, null, 2))
    rimraf.sync(tempDir)
    return Promise.resolve()
  })
}

const getDbEdition = (dbManifest) => {
  let pattern = (path.join(dataPath, 'src/') + '([^/]+)/' + path.basename(dbManifest)).replace(/\//g, '\\/')
  let match = dbManifest.match(pattern)
  if (!match) {
    return false
  }
  return match[1]
}

const getS3Data = async (key, compressed = false) => {
  let params = {
    Key: key
  }
  let data = await s3.getObject(params).promise()
  if (compressed) {
    return zlib.gunzipSync(data.Body).toString()
  } else {
    return data.Body.toString()
  }
}

const saveS3ToDisk = (key, filePath) => {
  return new Promise((resolve, reject) => {
    let file = fs.createWriteStream(filePath)
    file.on('close', function () {
      resolve(filePath)
    })
    s3.getObject({Key: key}).createReadStream().on('error', (err) => {
      console.log(err)
      reject(err)
    }).pipe(file)
  })
}

const getDataFiles = (filesList, dbEdition) => {
  let files = JSON.parse(filesList)
  let dbData = {
    type: getDbType(dbEdition),
    price: getDbPrice(dbEdition),
    dbEdition: dbEdition,
    ranges: null,
    geonames: null
  }

  for (let i = 0; i < files.length; i++) {
    if (path.basename(files[i]) === dbEdition + '-Blocks-IPv4.csv.gz') {
      dbData.ranges = files[i]
    }
    if (path.basename(files[i]) === dbEdition + '-Locations-' + locale + '.csv.gz') {
      dbData.geonames = files[i]
    }
  }
  return dbData
}

const getDbType = (dbEdition) => {
  let dbType = null
  let match = dbEdition.toLowerCase().match(/^.*-([a-z]+)$/)
  if (match) {
    dbType = match[1]
  }
  return dbType
}

const getDbPrice = (dbEdition) => {
  let dbPrice = 'paid'
  let match = dbEdition.toLowerCase().match(/lite/i)
  if (match) {
    dbPrice = 'free'
  }
  return dbPrice
}

const getLocationData = async (csvFilePath) => {
  let data = await getS3Data(csvFilePath, true)
  let jsonData = csvjson.toObject(data)
  let result = {}
  for (let i = 0; i < jsonData.length; i++) {
    let jsonObj = jsonData[i]
    jsonObj.is_in_european_union = (jsonObj.is_in_european_union === '1')
    let geonameId = jsonObj.geoname_id
    delete jsonObj.locale_code
    delete jsonObj.geoname_id
    result[geonameId] = jsonObj
  }
  return result
}

const generateDB = (csvFilePath, dbInfo, locationData) => {
  var dbType = dbInfo.type
  var dbPrice = dbInfo.price
  return new Promise((resolve, reject) => {
    let result = ''
    let fileContent = ''
    let csvFileFolder = path.dirname(csvFilePath)
    let dbFolder = path.join(csvFileFolder, 'db')
    let dbPartitions = []
    fs.mkdirSync(dbFolder)
    let csvFileStream = fs.createReadStream(csvFilePath).pipe(zlib.createGunzip())
    let previousFileId = -1
    csv()
      .fromStream(csvFileStream)
      .on('data', (data) => {
        let jsonObj = JSON.parse(data.toString('utf8'))
        if (dbPrice === 'free') {
          jsonObj.valid_until = firstThursday()
        } else {
          jsonObj.valid_until = nextThursday()
        }
        if (dbType === 'asn') {
          result = parseArn(jsonObj)
        }
        if (dbType === 'country') {
          result = parseCountry(jsonObj, locationData)
        }
        if (dbType === 'city') {
          result = parseCity(jsonObj, locationData)
        }
        let fileId = result.network_head.toString()
        let file = path.join(dbFolder, fileId)
        let previousFile = path.join(dbFolder, previousFileId.toString())
        if (previousFileId > -1 && previousFileId !== fileId) {
          let input = Buffer.from(fileContent, 'utf-8')
          fs.writeFileSync(previousFile + '.gz', zlib.gzipSync(input))
          fileContent = ''
        }
        fileContent = fileContent + JSON.stringify(result) + '\n'
        if (!dbPartitions.includes(file)) {
          dbPartitions.push(file)
        }
        previousFileId = fileId
      })
      .on('done', (error) => {
        if (error) {
          reject(error)
        }
        let previousFile = path.join(dbFolder, previousFileId.toString())
        let input = Buffer.from(fileContent, 'utf-8')
        fs.writeFileSync(previousFile + '.gz', zlib.gzipSync(input))
        fileContent = ''
        resolve(dbPartitions)
      })
  })
}

const clean = (jsonObj) => {
  delete jsonObj.is_anonymous_proxy
  delete jsonObj.is_satellite_provider
  jsonObj.updated_at = Math.floor(((new Date()).getTime()) / 1000)
  jsonObj.data = {}
  return jsonObj
}
const parseNetwork = (jsonObj) => {
  jsonObj = clean(jsonObj)
  let network = jsonObj.network
  delete jsonObj.network
  let subnet = ip.cidrSubnet(network)
  let rangeStart = subnet.networkAddress
  let rangeEnd = subnet.broadcastAddress
  jsonObj.network_head = parseInt(network.split('.')[0])
  jsonObj.network_range_start = ip.toLong(rangeStart)
  jsonObj.network_range_end = ip.toLong(rangeEnd)
  return jsonObj
}
const parseArn = (jsonObj) => {
  jsonObj = parseNetwork(jsonObj)
  jsonObj.data.autonomous_system_number = parseInt(jsonObj.autonomous_system_number)
  jsonObj.data.autonomous_system_organization = jsonObj.autonomous_system_organization
  delete jsonObj.autonomous_system_number
  delete jsonObj.autonomous_system_organization
  return jsonObj
}

const parseCountry = (jsonObj, countryData) => {
  jsonObj = parseNetwork(jsonObj)
  let location = countryData[jsonObj.geoname_id]
  if (location) {
    let locationData = formatCountry(location)
    jsonObj.data.continent = locationData.continent
    jsonObj.data.country = locationData.country
  }
  jsonObj = cleanGeoname(jsonObj)
  return jsonObj
}

const formatCountry = (location) => {
  return {
    country: {
      code: location.country_iso_code,
      name: location.country_name,
      is_eu: location.is_in_european_union
    },
    continent: {
      code: location.continent_code,
      name: location.continent_name
    }
  }
}

const parseCity = (jsonObj, cityData) => {
  jsonObj = parseNetwork(jsonObj)
  jsonObj.latitude = parseFloat(jsonObj.latitude) || null
  jsonObj.longitude = parseFloat(jsonObj.longitude) || null
  jsonObj.accuracy_radius = parseInt(jsonObj.accuracy_radius) || null
  let location = cityData[jsonObj.geoname_id]
  if (location) {
    jsonObj.data.continent = {
      code: location.continent_code,
      name: location.continent_name
    }
    jsonObj.data.country = {
      code: location.country_iso_code,
      name: location.country_name,
      is_eu: location.is_in_european_union
    }
    jsonObj.data.city = {
      name: location.city_name,
      metro_code: location.metro_code,
      postal_code: jsonObj.postal_code
    }
    jsonObj.data.subdivision_1 = {
      iso_code: location.subdivision_1_iso_code,
      name: location.subdivision_1_name
    }
    jsonObj.data.subdivision_2 = {
      iso_code: location.subdivision_2_iso_code,
      name: location.subdivision_2_name
    }
    if (jsonObj.latitude && jsonObj.longitude) {
      jsonObj.data.location = {
        geo_point: {
          type: 'Point',
          coordinates: [jsonObj.longitude, jsonObj.latitude]
        },
        accuracy_radius: jsonObj.accuracy_radius
      }
    }
    jsonObj.data.time_zone = location.time_zone
  }
  jsonObj = cleanGeoname(jsonObj)
  return jsonObj
}
const cleanGeoname = (jsonObj) => {
  delete jsonObj.geoname_id
  delete jsonObj.registered_country_geoname_id
  delete jsonObj.represented_country_geoname_id
  delete jsonObj.postal_code
  delete jsonObj.latitude
  delete jsonObj.longitude
  delete jsonObj.accuracy_radius
  delete jsonObj.time_zone
  return jsonObj
}

const upload = (file, key) => {
  let stream = fs.createReadStream(file)

  let params = {
    Key: key,
    Body: stream,
    ContentType: 'application/x-gzip',
    StorageClass: 'STANDARD'
  }
  return s3.upload(params).promise().then((data) => {
    return data.Key
  })
}

const createFile = (content, key) => {
  let params = {
    Key: key,
    Body: JSON.stringify(content),
    ContentType: 'application/json',
    StorageClass: 'STANDARD'
  }
  return s3.putObject(params).promise().then((data) => {
    return data.Key
  })
}

// Maxminds GeoIP2 is updated every Tuesday
// We update source on Wednesday. Data is valid until next Thursday 12pm
const nextThursday = () => {
  let d = new Date()
  d.setUTCDate(d.getUTCDate() + (7 - d.getUTCDay()) % 7 + 4)
  d.setUTCHours(12, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
}

// Maxminds geoLite2 updates every first Tuesday of the month
// We cache until the 5th, which will always be after Tuesday
const firstThursday = () => {
  let d = new Date()
  if (d.getUTCDate() >= 5) {
    d.setUTCMonth(d.getUTCMonth() + 1)
  }
  d.setUTCDate(5)
  d.setUTCHours(12, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
}
