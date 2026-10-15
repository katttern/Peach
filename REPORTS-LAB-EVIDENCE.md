# Lab 5 — AWS evidence collected 2026-10-15

Region: `us-east-1`  
Stack: `peach-reports` (`UPDATE_COMPLETE`)  
Bucket: `peach-reports-470115905916`

## S3 objects

Output from `aws s3 ls s3://peach-reports-470115905916/reports/ --recursive --region us-east-1`:

```text
2026-10-15 10:43:01        145 reports/2026-W39.csv
2026-10-15 10:17:45        292 reports/2026-W40.csv
2026-10-15 10:35:32        390 reports/2026-W41.csv
```

The builder log shows `2026-W39` requested by `make` and `2026-W41` requested by the schedule.

## Trigger log lines

CloudWatch timestamps below are UTC. These are the required three trigger types:

```text
[INFO] 2026-10-15T07:19:17.800Z report-builder triggered trigger=schedule requested_by=schedule week=2026-W41 action=report
[INFO] 2026-10-15T07:31:02.328Z report-builder triggered trigger=sqs requested_by=make week=2026-W39 action=report
[INFO] 2026-10-15T07:43:01.400Z report-mailer triggered trigger=s3 event=ObjectCreated:Put bucket=peach-reports-470115905916 key=reports/2026-W39.csv
```

The mailer also logged `report-mailer sent key=reports/2026-W39.csv to=katuskatus07@gmail.com`. SES reports sending enabled and the recipient address verified. The SES account is still in the sandbox.

## Duplicate behavior observed

The builder wrote `reports/2026-W41.csv` repeatedly during the temporary schedule test. The mailer logged six successful sends for that same key, so the deployed implementation sends a duplicate email for every repeated ObjectCreated notification. The schedule is now back to `cron(0 7 ? * MON *)` in `Europe/Kyiv` and is enabled.

## Remaining proof item

Attach a screenshot from the recipient's inbox showing one delivered message with the CSV attached. CloudWatch confirms SES accepted the messages, but the inbox screenshot has not been captured here.

## Deployment mismatch to resolve before updating the stack

The live `peach-reports` stack contains an available standalone PostgreSQL `AWS::RDS::DBInstance`, not Aurora; no Aurora cluster exists in `us-east-1`. The corrected source template now expects the Lab 4 Aurora hostname and security group. Applying that template to the current stack would remove the existing DB resources unless migration/retention is planned. Do not update this live stack until the intended Aurora endpoint/security group is available and a safe database transition is decided.
