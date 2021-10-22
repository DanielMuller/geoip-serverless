# Serverless GeoIP API
Serverless API to gather Geo Infos about IPs, using [Maxmind's](https://www.maxmind.com) databases (City, Country, ASN).

This project provides a cost effective serverless GeoIP service, leveraging several AWS products:
- [lambda](https://aws.amazon.com/lambda/features/)
- [API Gateway](https://aws.amazon.com/api-gateway/)
- [S3](https://aws.amazon.com/s3/)
- [S3 Select](https://aws.amazon.com/blogs/aws/s3-glacier-select/)
- [Cloudfront](https://aws.amazon.com/cloudfront/)
- [SSM](https://docs.aws.amazon.com/systems-manager/latest/userguide/what-is-systems-manager.html)
- [KMS](https://aws.amazon.com/kms/)

## Usage
*Combined City and ASN*
```
curl -H "x-api-key: xxxxxx" https://ipinfo.example.com/ipv4/8.8.8.8
```
*Specific database*
```
curl -H "x-api-key: xxxxxx" https://ipinfo.example.com/ipv4/8.8.8.8/city
curl -H "x-api-key: xxxxxx" https://ipinfo.example.com/ipv4/8.8.8.8/country
curl -H "x-api-key: xxxxxx" https://ipinfo.example.com/ipv4/8.8.8.8/asn
```
*Country Name from country code*
```
curl -H "x-api-key: xxxxxx" https://ipinfo.example.com/country/us
```
*Cloudfront Edge info from edge code*
```
curl -H "x-api-key: xxxxxx" https://ipinfo.example.com/edge/NRT52
```
*Caller IP infos*

Just the IP as text

```
curl -H "x-api-key: xxxxxx" https://ipinfo.example.com/ifconfig
```

IP with ASN, Country and City informations

```
curl -H "x-api-key: xxxxxx" https://ipinfo.example.com/ifconfig/detail
```

## Install
A working [serverless.com](https://serverless.com), nvm, aws-cli is needed.
```
git clone https://github.com/DanielMuller/geoip-serverless
cd geoip-serverless
nvm use
npm i
cp -a stages/sample.production.yml stages/production.yml
cp -a config/sample.download-schedules.yml config/download-schedules.yml
cp -a config/sample.airports-download-schedules.yml config/airports-download-schedules.yml
cp -a config/sample.apiusage.yml config/apiusage.yml
aws --profile production ssm put-parameter --name maxmindToken --value YourMaxminfToken --type SecureString
# Edit yml files to suite your needs
npm run deploy

# Trigger a first time download
sls -s production invoke -f Download -p events/GeoLite2-ASN.json
sls -s production invoke -f Download -p events/GeoLite2-City.json
sls -s production invoke -f Download -p events/GeoLite2-Country.json
sls -s production invoke -f AirportsDownload
```
### Database updates
Updates are run through Cloudwatch schedules events. You can change download times in `config/download-schedules.yml`

## Modify
```
git clone https://github.com/DanielMuller/geoip-serverless
cd geoip-serverless
nvm use
npm i
```

## Functions
### Download
Triggered from Cloudwatch scheduled event.
- Fetches the csv-zip and extracts the IP4-Blocks and english names (language can be changed in stages/production.yml)
- Uploads the files to S3

### Prepare
Triggered from S3PutObject event.
- Converts IP Ranges to Integer ranges
- Combines ranges and Names to partitioned JSON-Lines documents
- Uploads the files to S3

### Getipinfo
Triggered from api-gateway.
- Fetches the relevant row using S3-Select from the relevant database and partition

### AirportsDownload
Triggered from Cloudwatch scheduled event.
- Fetches the list of airport codes and stores the ones with a valid IATA code

### CloudfrontEdgesPrepare
Triggered from S3PutObject event on aiport codes.
- Convert airport codes to Cloudfront Edges informations

## Resources
### ApiGateway
API Gateway is a local gateway, access is granted using `x-api-key` header.

### Cloudfront
Cloudfront caches to response to reduce ApiGateway usage. Cache-Control is in sync with Maxmind's update schedule.
