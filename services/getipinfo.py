"""
Invoked from API Gateway, get IP address and Database from path parameters and
returns infos about the address
"""

import json
import os
import logging
from datetime import datetime
import ipaddress
import boto3
__logger__ = logging.getLogger()
__logger__.setLevel(logging.INFO)
S3 = boto3.client('s3', region_name=os.environ['AWS_REGION'])

__dbmapping__ = {
    "city": os.environ['dbCity'],
    "country": os.environ['dbCountry'],
    "asn": os.environ['dbAsn']
}

def handler(event, context): #pylint: disable=W0613, R0912
    """Return IP Address infos"""
    __logger__.info('got event{} %s', format(event))
    ip_request = event['pathParameters']['ip']
    __logger__.info('ip=%s', ip_request)

    try:
        ip_long = int(ipaddress.ip_address(ip_request))
    except ValueError:
        return invalid_content("Invalid IP " + ip_request)

    try:
        db_type = event['pathParameters']['dbType']
    except KeyError:
        db_type = ""

    network_head = ip_request.split('.')[0]

    if not db_type:
        data = getentry(network_head, ip_long, __dbmapping__['city'])
        asn = getentry(network_head, ip_long, __dbmapping__['asn'])
        data['data']['asn'] = asn['data']
        if 'valid_until' in data and 'valid_until' in asn:
            data['valid_until'] = min(data['valid_until'], asn['valid_until'])
        elif 'valid_until' in asn:
            data['valid_until'] = asn['valid_until']
        elif not 'valid_until' in data:
            data['valid_until'] = 0
    else:
        try:
            db_path = __dbmapping__[db_type]
        except KeyError:
            return invalid_content("Invalid database")

        data = getentry(network_head, ip_long, db_path)

    headers = {}
    if 'data' in data and data['data']:
        if 'valid_until' in data and data['valid_until']:
            expires = datetime.utcfromtimestamp(data['valid_until'])
            if expires > datetime.utcnow():
                headers["Expires"] = expires.strftime('%a, %d %b %Y %H:%M:%S GMT')
            else:
                headers["Cache-Control"] = "max-age: 86400"
        else:
            headers["Cache-Control"] = "max-age: 86400"
        response = {
            "statusCode": 200,
            "body": json.dumps(data['data']),
            "headers": headers
        }

        return response
    else:
        return invalid_content("IP not found", 404)

def getentry(network_head, ip_long, db_path):
    """Return IP info from a db"""

    data_path = os.environ['dataPath']
    data_bucket = os.environ['dataBucket']

    key = os.path.join(data_path, 'db', db_path, network_head)
    expression = "select * from s3object s where s.network_range_start<=%s \
    and s.network_range_end>=%s" % (ip_long, ip_long)

    query_result = S3.select_object_content(
        Bucket=data_bucket,
        Key="%s.gz" % key,
        ExpressionType='SQL',
        Expression=expression,
        InputSerialization={'JSON': {'Type': 'LINES'}, 'CompressionType': 'GZIP'},
        OutputSerialization={'JSON': {}},
    )
    records = json.dumps({
        "data": {}
    })
    for s3event in query_result['Payload']:
        if 'Records' in s3event:
            records = s3event['Records']['Payload'].decode('utf-8')
            break

    return json.loads(records)

def invalid_content(reason, code=400):
    """Build 400 response"""
    response = {
        "statusCode": code,
        "body":{
            "message": reason
        },
        "headers":{
            "Cache-Control": "max-age=60"
        }
    }
    return response
