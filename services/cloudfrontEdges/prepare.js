'use strict'

const path = require('path')
const zlib = require('zlib')
const AWS = require('aws-sdk')
const s3 = new AWS.S3({
  region: process.env.AWS_REGION,
  params: {
    Bucket: process.env.dataBucket
  }
})
const dataPath = process.env.dataPath
const country = require('../../lib/country')(dataPath)

const continents = {
  'eu': 'Europe',
  'na': 'North-America',
  'sa': 'South-America',
  'as': 'Asia',
  'oc': 'Oceania',
  'af': 'Africa',
  'an': 'Antartica'
}
const countries = {}
const usStates = {
  'US-AL': 'Alabama',
  'US-AK': 'Alaska',
  'US-AZ': 'Arizona',
  'US-AR': 'Arkansas',
  'US-CA': 'California',
  'US-CO': 'Colorado',
  'US-CT': 'Connecticut',
  'US-DE': 'Delaware',
  'US-FL': 'Florida',
  'US-GA': 'Georgia',
  'US-HI': 'Hawaii',
  'US-ID': 'Idaho',
  'US-IL': 'Illinois',
  'US-IN': 'Indiana',
  'US-IA': 'Iowa',
  'US-KS': 'Kansas',
  'US-KY': 'Kentucky',
  'US-LA': 'Louisiana',
  'US-ME': 'Maine',
  'US-MD': 'Maryland',
  'US-MA': 'Massachusetts',
  'US-MI': 'Michigan',
  'US-MN': 'Minnesota',
  'US-MS': 'Mississippi',
  'US-MO': 'Missouri',
  'US-MT': 'Montana',
  'US-NE': 'Nebraska',
  'US-NV': 'Nevada',
  'US-NH': 'New Hampshire',
  'US-NJ': 'New Jersey',
  'US-NM': 'New Mexico',
  'US-NY': 'New York',
  'US-NC': 'North Carolina',
  'US-ND': 'North Dakota',
  'US-OH': 'Ohio',
  'US-OK': 'Oklahoma',
  'US-OR': 'Oregon',
  'US-PA': 'Pennsylvania',
  'US-RI': 'Rhode Island',
  'US-SC': 'South Carolina',
  'US-SD': 'South Dakota',
  'US-TN': 'Tennessee',
  'US-TX': 'Texas',
  'US-UT': 'Utah',
  'US-VT': 'Vermont',
  'US-VA': 'Virginia',
  'US-WA': 'Washington',
  'US-WV': 'West Virginia',
  'US-WI': 'Wisconsin',
  'US-WY': 'Wyoming',
  'US-DC': 'District of Columbia',
  'US-AS': 'American Samoa',
  'US-GU': 'Guam',
  'US-MP': 'Northern Mariana Islands',
  'US-PR': 'Puerto Rico',
  'US-UM': 'United States Minor Outlying Islands',
  'US-VI': 'Virgin Islands, U.S.'
}
const cloudfrontEdges = {
  nrt52: {
    city: 'Osaka',
    region: 'Japan',
    continent: 'Asia',
    location: {
      lat: 34.7896,
      lon: 135.4381
    }
  },
  sfo4: {
    city: 'San Jose',
    region: 'California',
    continent: 'North-America',
    location: {
      lat: 37.3639,
      lon: 121.9298
    }
  },
  yto: {
    city: 'Torronto',
    region: 'Canada',
    continent: 'North-America',
    location: {
      lat: 43.676667,
      lon: -79.630556
    }
  }
}

const cityOverride = {
  fjr: 'Fujairah'
}
module.exports.handler = async (event, context) => {
  let bucket = event.Records[0].s3.bucket.name
  if (bucket !== process.env.dataBucket) {
    let error = new Error('Event bucket is different from dataBucket (' + bucket + ' !== ' + process.env.dataBucket + ')')
    return Promise.reject(error)
  }
  let dbFile = event.Records[0].s3.object.key
  let iataCodes = await getRawCodes(dbFile)
  let parsedCodes = await parseCodes(iataCodes)
  let edges = addEdges(parsedCodes)
  let shardedEdges = shardEdges(edges)
  let uploads = []
  for (let shardId in shardedEdges) {
    let key = path.join(dataPath, 'db', 'cloudfront', 'edges', shardId + '.json.gz')
    uploads.push(createFile(key, shardedEdges[shardId]))
  }
  return Promise.all(uploads).then((files) => {
    console.log('uploaded:', JSON.stringify(files, null, 2))
    return Promise.resolve()
  })
}

const getRawCodes = async (dbFile) => {
  return s3.getObject({Key: dbFile}).promise().then(data => {
    return JSON.parse(zlib.gunzipSync(data.Body))
  })
}

const parseCodes = async (codes) => {
  let parsed = {}
  for (let i = 0; i < codes.length; i++) {
    let code = codes[i]
    let iata = code.iata_code.toLowerCase()
    if (iata.length !== 3) {
      continue
    }
    let coordinates = code.coordinates.split(',')
    // for US: iso_region
    let region = ''
    if (code.iso_country === 'US' && /^US-/.test(code.iso_region)) {
      region = usStates[code.iso_region]
    } else {
      if (!countries[code.iso_country]) {
        let country = await getCountry(code.iso_country)
        countries[code.iso_country] = country
      }
      region = countries[code.iso_country]
    }
    if (code.municipality === '' || code.municipality === null) {
      if (iata in cityOverride) {
        code.municipality = cityOverride[iata]
      } else {
        code.municipality = iata
      }
    }
    parsed[iata] = {
      city: code.municipality,
      region: region,
      continent: continents[code.continent.toLowerCase()],
      location: {
        lon: parseFloat(coordinates[0]),
        lat: parseFloat(coordinates[1])
      }
    }
  }
  return parsed
}

const getCountry = async (code) => {
  let countryInfo = await country.getInfo(code)
  let countryName = ''
  try {
    countryName = countryInfo.country.name
  } catch (err) {
    console.log(err)
  }
  return countryName
}

const addEdges = (edges) => {
  return Object.assign(cloudfrontEdges, edges)
}

const shardEdges = (edges) => {
  let shards = {}
  for (let edge in edges) {
    let shardId = edge.substring(0, 1)
    if (!(shardId in shards)) {
      shards[shardId] = {}
    }
    shards[shardId][edge] = edges[edge]
  }
  return shards
}

const createFile = (key, content) => {
  let params = {
    Key: key,
    Body: zlib.gzipSync(JSON.stringify(content)),
    ContentType: 'application/json',
    ContentEncoding: 'gzip',
    StorageClass: 'STANDARD'
  }
  return s3.putObject(params).promise().then((data) => {
    return key
  })
}
