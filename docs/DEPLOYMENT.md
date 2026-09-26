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
