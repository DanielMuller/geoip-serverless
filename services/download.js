'use strict'

const AWS = require('aws-sdk')
const ssm = new AWS.SSM({
  region: process.env.AWS_REGION
})
const s3 = new AWS.S3({
  region: process.env.AWS_REGION,
  params: {
    Bucket: process.env.dataBucket
  }
})
const dataPath = process.env.dataPath
const path = require('path')
const fs = require('fs')
const zlib = require('zlib')
const https = require('https')
const AdmZip = require('adm-zip')
const rimraf = require('rimraf')
const encryptedLicence = process.env.ssmMaxmindToken
const locale = process.env.locale.toLowerCase()

module.exports.handler = async (event, context, callback) => {
  console.log('Event:', JSON.stringify(event))
  var db = event.editionId
  const licence = await decrypt(encryptedLicence)
  const url = 'https://download.maxmind.com/app/geoip_download?edition_id=' + db + '-CSV&suffix=zip&license_key=' + licence
  const tmpFolder = path.join('/tmp', Date.now().toString())
  fs.mkdirSync(tmpFolder)

  const zipFile = path.join(tmpFolder, db + '.zip')
  console.log('Start download: ' + db + ' to ' + zipFile)
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      response.on('data', (data) => {
        fs.appendFileSync(zipFile, data)
      })
      response.on('end', () => {
        var zip = new AdmZip(zipFile)
        var zipEntries = zip.getEntries()
        const uploads = []
        zipEntries.forEach((zipEntry) => {
          const entryName = zipEntry.entryName
          const isCSV = path.extname(entryName).toLowerCase() === '.csv'
          const isIPv4 = path.basename(entryName).indexOf('Blocks-IPv4') > -1
          const isLang = path.basename(entryName).indexOf('-Locations-' + locale) > -1
          if (isCSV && (isIPv4 || isLang)) {
            zip.extractEntryTo(entryName, tmpFolder, false, true)
            // let file = path.join(tmpFolder, tmpFolder, zipEntry.name) // Dirty fix to overvome a bug in adm-zip 0.4.11
            const file = path.join(tmpFolder, zipEntry.name) // For adm-zip 0.4.7
            console.log(dataPath, db)
            const key = path.join(dataPath, 'src', db, path.basename(file))
            console.log('upload to s3://' + process.env.dataBucket + '/' + key)
            uploads.push(upload(file, key))
          }
        })
        Promise.all(uploads).then((files) => {
          console.log('Content uploaded to S3: ' + JSON.stringify(files))
          rimraf.sync(tmpFolder)
          const key = path.join(dataPath, 'src', db, 'manifest.json')
          const params = {
            Body: JSON.stringify(files, null, 2),
            Key: key,
            ContentType: 'application/json',
            StorageClass: 'STANDARD'
          }
          s3.putObject(params).promise().then((data) => {
            console.log('manifest uploaded')
            return db
          })
        })
      })
    })
  })
}

const decrypt = async (key) => {
  var params = {
    Name: key,
    WithDecryption: true
  }
  const data = await ssm.getParameter(params).promise()
  return data.Parameter.Value
}

const upload = (file, key) => {
  const gzkey = key + '.gz'
  const body = fs.createReadStream(file).pipe(zlib.createGzip())

  const params = {
    Key: gzkey,
    Body: body,
    ContentType: 'application/x-gzip',
    StorageClass: 'STANDARD'
  }
  return s3.upload(params).promise().then((data) => {
    return data.Key
  })
}
