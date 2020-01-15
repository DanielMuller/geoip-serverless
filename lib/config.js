'use strict'
const _ = require('lodash')
const YAML = require('js-yaml')
const fs = require('fs')
var path = require('path')

function getAllFiles (filePath) {
  try {
    var files = fs.readdirSync(filePath)
    return (_.flatten(files.map(function (file) {
      if (fs.statSync(filePath + '/' + file).isDirectory()) {
        return (getAllFiles(filePath + '/' + file))
      }
      return (filePath + '/' + file)
    })))
  } catch (err) {
    return ([])
  }
}
const resources = () => {
  const elements = {}
  var resFiles = getAllFiles('./resources')
  resFiles.map((file) => {
    if (path.extname(file).toLowerCase() !== '.yml') {
      return
    }
    const doc = YAML.safeLoad(fs.readFileSync(file, 'utf8'))
    if (doc) {
      const methodName = file.split('/').slice(2, 4).map((name) => { return _.upperFirst(name) }).join('').replace(/\.yml$/i, '')
      elements[methodName] = doc
    }
  })
  var fctFiles = getAllFiles('./services')
  fctFiles.map((file) => {
    if (path.extname(file).toLowerCase() !== '.yml') {
      return
    }
    const doc = YAML.safeLoad(fs.readFileSync(file, 'utf8'))
    if (doc && doc.properties) {
      _.forOwn(doc.properties, (property, resourceName) => {
        const methodName = file.split('/').slice(2, 4).map((name) => { return _.upperFirst(name) }).join('').replace(/\.yml$/i, '') + _.upperFirst(resourceName)
        elements[methodName] = _.merge(elements[methodName] || {}, { Properties: property })
      })
    }
  })
  return elements
}
const functions = () => {
  const elements = {}
  var fctFiles = getAllFiles('./services')
  fctFiles.map((file) => {
    if (path.extname(file).toLowerCase() !== '.yml') {
      return
    }
    if (/^.*doc\.yml$/i.test(file)) {
      return
    }
    const doc = YAML.safeLoad(fs.readFileSync(file, 'utf8'))
    if (doc) {
      delete doc.properties
      const methodName = file.split('/').slice(2, 4).map((name) => { return _.upperFirst(name) }).join('').replace(/\.yml$/i, '')
      elements[methodName] = doc
    }
  })
  return elements
}
module.exports.resources = resources
module.exports.functions = functions
