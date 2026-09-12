# Security policy

Purser sits between AI agents and your source code. Security reports are
taken seriously and I would rather hear about a problem than not.

## Reporting

Email **infopurser@gmail.com**. Please do not open a public issue for a
vulnerability.

Include what you did, what happened, and what you expected. A proof of
concept helps but is not required. You will get a first reply within 72 hours.

## Scope

In scope: anything that lets an agent write to the workspace without an
approval, forge or break the audit chain, escape the shell command
classifier, or exfiltrate credentials.

Out of scope: issues in the underlying model providers, and the known
limitations already documented in the repo. Those are written down
deliberately — please read them first, and tell me if one is understated.

## Supported versions

Pre-1.0. Only the latest release is supported.
