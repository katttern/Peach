# Lab 5 — Step 7 answers

## Duplicate S3 event

With the current mailer, uploading the same report twice produces two identical emails: each successful `PutObject` generates an ObjectCreated notification, and the mailer has no sent-state check. I would store delivery state in a DynamoDB table with a conditional write before sending. The idempotency key should identify the report object, for example `bucket + key` (or `bucket + key + versionId` if bucket versioning is enabled). For this lab, `reports/<ISO-week>.csv` is stable, so the week/object key is enough. Store a status and timestamp, and do not send when the item is already marked sent. There is a small unavoidable failure window if SES accepts the message but the Lambda fails before recording `sent`; a production design can use a transactional outbox plus reconciliation, but SES itself does not provide an idempotency token.

## Three ways for a VPC Lambda to reach SES

Approximate us-east-1 network charges, using 730 hours/month and excluding taxes, data transfer and SES message charges:

| Option | Approximate monthly network cost | Tradeoff |
| --- | ---: | --- |
| NAT gateway | `$0.045/hour × 730 = $32.85` for one AZ, plus `$0.045/GB` processed | General internet access; one per-AZ deployment costs more and cross-AZ traffic can add charges. |
| SES interface endpoint | About `$0.01/hour × 730 = $7.30` per enabled AZ, plus endpoint data processing | Private SES connectivity, but billed per AZ; availability-zone count changes the fixed cost. |
| Split builder and mailer | No NAT or SES endpoint charge for this path | The builder writes to S3 through its free gateway endpoint; the mailer runs outside the VPC and calls SES. |

At ten more emails a week, I would keep the split: it adds no network endpoint cost and keeps each Lambda limited to the access it needs. At a million emails a week, I would still keep the split unless there were another reason for the mailer to be in the VPC; I would first measure Lambda duration, SES sending limits and delivery throughput. A NAT gateway is hard to justify solely for SES. An SES endpoint can be sensible if the mailer must access private resources, but otherwise the split stays simpler and avoids per-AZ endpoint charges. AWS lists NAT gateway hourly and per-GB charges in its [VPC pricing](https://aws.amazon.com/vpc/pricing/) and interface endpoint hourly/data charges in [PrivateLink pricing](https://aws.amazon.com/privatelink/pricing/).

## A link that works for a week

Do not send a presigned URL made from the Lambda execution role's temporary credentials. Upload the report to a private bucket and create the link with an IAM user credential; S3 query-string presigned URLs can be valid for up to seven days when signed with long-lived credentials. A stronger production option is a CloudFront signed URL with a trusted key group and a one-week expiry, with CloudFront accessing the private bucket through Origin Access Control. The recipient then gets a time-limited link without making the report public. AWS documents S3 presigned URL credential lifetime [here](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html) and [CloudFront signed URLs](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-signed-urls.html).

## Evidence checklist

- Screenshot of the delivered SES email with the CSV attachment.
- The S3 listing, trigger log lines and duplicate-send observation are recorded in [REPORTS-LAB-EVIDENCE.md](REPORTS-LAB-EVIDENCE.md).
- DLQ exercise: deliberately fail one week, confirm three receives and DLQ delivery, then redrive after fixing the failure.
