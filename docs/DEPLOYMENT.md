# Isolated Railway deployment

- Public URL: https://workwork-quickview-production.up.railway.app/
- Repository: https://github.com/wilcoco/workwork-quickview (private)
- Project: `workwork-quickview`, `858d0a20-b606-4d24-b66d-3da56aca1514`
- Service: `88505e05-413a-4950-8a38-c62c77f4c9b1`
- Production environment: `28f69a12-b13b-45aa-b2a0-d3792ffb9c85`
- Persistent volume: `91f18e3e-d414-49db-91ef-d522474e27e5`, mounted at `/data`
- Database: `/data/quickview.sqlite`
- Dashboard: https://railway.com/project/858d0a20-b606-4d24-b66d-3da56aca1514/service/88505e05-413a-4950-8a38-c62c77f4c9b1?environmentId=28f69a12-b13b-45aa-b2a0-d3792ffb9c85

Variables:

```text
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
DATABASE_PATH=/data/quickview.sqlite
APP_ORIGIN=https://workwork-quickview-production.up.railway.app
QUICKVIEW_AI_MODE=guided
```

A single replica uses the mounted SQLite volume. Healthcheck is `/api/health`. HTTPS session cookies use a distinct `quickview_session` name. Only clean tracked source is deployed; no developer database, .env file or sample credentials are uploaded.

This pilot uses Railway CLI source upload. GitHub auto-deployment is not connected.

```sh
railway up --project 858d0a20-b606-4d24-b66d-3da56aca1514 --service 88505e05-413a-4950-8a38-c62c77f4c9b1 --environment 28f69a12-b13b-45aa-b2a0-d3792ffb9c85 --detach
```

Run from a clean exported source directory. Never remove the volume during a redeploy. Preserve the project/service IDs above; the original Workwork Cloud project is a different target. Changing application source does not require importing or modifying any original Workwork data.

Public signup is an independent account. Use the sample on the landing page to explore without creating records. Real companies start empty; deployment smoke tests use clearly named synthetic companies only.


## Consistent SQLite snapshots

The v0.2 image includes `scripts/backup.mjs`. An operator with access to this service's container can create a new local snapshot:

```sh
node scripts/backup.mjs --source /data/quickview.sqlite --destination /data/backups/quickview-UNIQUE-TIMESTAMP.sqlite
```

Use a new destination filename each time. The command refuses overwrites and missing sources, reads a consistent SQLite snapshot including committed WAL content, checks integrity, and restricts the output file to owner read/write. It prints record counts, not contents. Synthetic tests reopen the snapshot and confirm committed records survive independently.

A snapshot on the same volume is not disaster recovery. It must be transferred to an appropriately secured independent backup location under an agreed retention policy. No offsite destination, automatic backup schedule, or production disaster-recovery restore is configured by this release. Snapshots contain confidential company data, account hashes and sessions: never place them in git or a public artifact.

For restore, first preserve the current volume, stop writers, verify the chosen snapshot, and restore into a separate database path. Validate health, accounts and tenant records before switching DATABASE_PATH. Do not replace a live WAL database file or silently discard the current database.

## v0.2 release record

Application commit `9d333ff`; successful deployment `4e761851-5d28-4f3c-80ab-8ac9e451d5b1`. Public health and synthetic workflow tests passed, followed by an actual service restart and persistence checks. The additive schema-v3 migration retains prior users and records. An integrity-checked predeployment snapshot is retained at `/data/backups/pre-v02-1790406295844.sqlite` on the same private volume. This does not establish offsite disaster recovery.

## v0.3 release record

Application commit `2af02cc`; successful final deployment `f11c2a7c-e0e4-4f67-b549-1bbfbb26cd17`. HTTPS health reports `0.3.0`. Deploy only clean tracked exports with Railway CLI 4.29.0 or later supporting explicit `--project`; the local 4.6.3 binary does not support that `up` option.

An integrity-checked predeployment snapshot remains at `/data/backups/pre-v03-20260927-conversations.sqlite` on the same volume. No volume or database replacement was performed. Public synthetic conversation/reaction checks ran after the initial v0.3 build `43b485f` (deployment `8c4bd632-ebd3-4036-9f6b-76a8cf089d9c`). After final redeployment, a fresh sign-in confirmed those exact records and feedback counts survived. The final public JavaScript matches the tested release export byte-for-byte. The runtime remains in guided mode; no new model configuration or external messaging is introduced.
