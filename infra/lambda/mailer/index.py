import logging
import os
import urllib.parse
from email.message import EmailMessage

import boto3

log = logging.getLogger()
log.setLevel(logging.INFO)
s3 = boto3.client("s3")
ses = boto3.client("sesv2")


def handler(event, context):
    for rec in event["Records"]:
        bucket = rec["s3"]["bucket"]["name"]
        key = urllib.parse.unquote_plus(rec["s3"]["object"]["key"])
        log.info(
            "report-mailer triggered trigger=s3 event=%s bucket=%s key=%s",
            rec["eventName"], bucket, key,
        )
        body = s3.get_object(Bucket=bucket, Key=key)["Body"].read()
        name = key.rsplit("/", 1)[-1]
        msg = EmailMessage()
        msg["Subject"] = "Weekly meetings report " + name[:-4]
        msg["From"] = os.environ["SENDER"]
        msg["To"] = os.environ["RECIPIENTS"]
        msg.set_content("The weekly meetings report is attached as " + name + ".")
        msg.add_attachment(
            body, maintype="text", subtype="csv", filename=name
        )
        ses.send_email(Content={"Raw": {"Data": msg.as_bytes()}})
        log.info("report-mailer sent key=%s to=%s", key, os.environ["RECIPIENTS"])
