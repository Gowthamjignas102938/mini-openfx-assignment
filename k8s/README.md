# Running MiniOpenFX on Minikube

What gets deployed into the `openfx` namespace:

| Object | What it is |
|---|---|
| `openfx-api` Deployment (2 replicas) + NodePort Service | the NestJS API, image `openfx:v1` |
| `openfx-frontend` Deployment (2 replicas) + NodePort Service | the React website served by nginx, image `openfx-frontend:v1`. nginx also forwards `/v1/...` to the API and adds the API key itself, so the key isn't built into the website's code |
| `openfx-migrate` Job | runs DB migrations + seeds starting balances **once** |
| `postgres` Deployment + 1Gi PVC + ClusterIP Service | demo database (data survives Pod restarts) |
| `redis` Deployment + ClusterIP Service | 15-second price cache |
| `openfx-config` ConfigMap | non-secret config (`PORT`, `NODE_ENV`, `REDIS_URL`) |
| `openfx-secrets` Secret | `API_KEY`, `POSTGRES_PASSWORD`, `DATABASE_URL`. **Created by hand, never committed** |

The app also calls Binance's public API for live prices, so the cluster needs internet access.

## 1. Deploy from scratch

Run everything from the repo root.

```bash
# 1. Start the cluster
minikube start --driver=docker
kubectl get nodes                      # wait for STATUS = Ready

# 2. Build the image and copy it into Minikube (Minikube can't see your Mac's Docker images)
docker build -t openfx:v1 .
minikube image load openfx:v1
docker build -t openfx-frontend:v1 frontend
minikube image load openfx-frontend:v1

# 3. Create your local, git-ignored secrets file (only needed once)
PW=$(openssl rand -hex 16); KEY=$(openssl rand -hex 32)
cat > k8s/.env.k8s <<EOF
API_KEY=$KEY
POSTGRES_PASSWORD=$PW
DATABASE_URL=postgresql://postgres:$PW@postgres:5432/miniopenfx
EOF
# (k8s/examples/secret.example.yaml shows the same keys with placeholder values)

# 4. Namespace first, then the Secret, then everything else
kubectl apply -f k8s/namespace.yaml
kubectl create secret generic openfx-secrets -n openfx --from-env-file=k8s/.env.k8s
kubectl apply -f k8s/

# 5. Wait until it's up
kubectl wait --for=condition=complete job/openfx-migrate -n openfx --timeout=300s
kubectl rollout status deployment/openfx-api -n openfx
kubectl get all -n openfx

# 6. Open it. On macOS each command keeps a tunnel open, so leave the terminal running
minikube service openfx-frontend -n openfx --url   # the website: open this in the browser
minikube service openfx-api -n openfx --url        # the raw API (for curl/Postman)
#   fallback: kubectl port-forward -n openfx svc/openfx-api 8080:80   ->  http://localhost:8080
```

Try it (replace the URL with the one printed above):

```bash
URL=http://127.0.0.1:XXXXX
KEY=$(grep ^API_KEY k8s/.env.k8s | cut -d= -f2)
curl $URL/                                                       # Hello World! (health check, no key)
curl $URL/v1/balances                                            # 401: no API key
curl -H "X-API-Key: $KEY" $URL/v1/balances                       # 5 seeded balances
curl -H "X-API-Key: $KEY" "$URL/v1/prices?symbol=BTCUSDT"        # live price, cached 15s in Redis
curl -X POST -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"fromCurrency":"USD","toCurrency":"BTC","fromAmount":100,"symbol":"BTCUSDT"}' \
  $URL/v1/trades                                                 # run within 15s of the price call
```

**After changing code:** rebuild with a new tag (`openfx:v2`), `minikube image load openfx:v2`,
update `image:` in `deployment.yaml` and `migrate-job.yaml`, then `kubectl apply -f k8s/`.
(If you reuse the same tag, also run `kubectl rollout restart deployment/openfx-api -n openfx`.)

## Tear down

```bash
kubectl delete namespace openfx     # removes everything in the namespace, including the DB disk
minikube stop                       # pause the cluster (keeps it for next time)
minikube delete                     # or: delete the cluster completely
```

## 2. Five-minute demo script

| Time | Do | Say |
|---|---|---|
| 0:00 | `kubectl get nodes` | "One-node Kubernetes cluster running locally in Docker via Minikube." |
| 0:30 | `kubectl get pods -n kube-system` | "These are the cluster's own components: **etcd** (the database of the cluster's state), **kube-apiserver** (every kubectl command goes through it), **kube-scheduler** (picks which node a Pod runs on), **kube-controller-manager** (keeps actual state matching desired state), plus **kube-proxy** (Service networking) and **CoreDNS** (lets Pods find each other by name, e.g. `postgres`)." |
| 1:15 | `kubectl get all -n openfx` | "My app: 2 API Pods, Postgres, Redis, and a one-off migration Job that shows Completed. The Services give each of them a stable name and address." |
| 2:00 | Open the website (`minikube service openfx-frontend -n openfx --url`): Prices → Trade → Balances → Trade History. Optionally also run the `curl` calls | "Health check needs no key, the real API needs the `X-API-Key` header. Prices come live from Binance and are cached in Redis for 15s. Balances come from Postgres." |
| 2:45 | Terminal 2: `kubectl get pods -n openfx -w`.<br>Terminal 1: `kubectl scale deployment openfx-api --replicas=4 -n openfx` | "I only changed the desired number. Kubernetes creates 2 more Pods, and they get traffic once their readiness probe passes." |
| 3:30 | `kubectl delete pod <one-openfx-api-pod> -n openfx` (watch terminal 2) | "Self-healing: I killed a Pod and the Deployment notices it has 3 of 4, so it starts a replacement within seconds. The Service just stops sending traffic to the dead one." |
| 4:15 | `kubectl scale deployment openfx-api --replicas=2 -n openfx`, then `kubectl logs -n openfx deployment/openfx-api --tail=5` | "Scale back down, and here are the app's logs. Config comes from a ConfigMap, secrets from a Secret created from a git-ignored file, so no secrets are in git or in the image." |

## 3. Questions your colleague will probably ask

1. **Why not just use docker-compose?**
   Compose runs containers. Kubernetes also keeps them running: it restarts failed Pods, scales replicas, load-balances through Services and does rolling updates. The same YAML works on a real cloud cluster (EKS/GKE/AKS).

2. **How do the Pods find Postgres and Redis?**
   Through Services. Each Service gets a DNS name inside the cluster (`postgres`, `redis`), so `DATABASE_URL` just says `@postgres:5432`. Pod IPs change every restart, but Service names don't.

3. **Where are the secrets, and are they safe?**
   In a Kubernetes Secret made with `kubectl create secret ... --from-env-file=k8s/.env.k8s`. That file is git-ignored, and only a placeholder template is committed. Secrets are only base64-encoded by default. In production you'd add encryption at rest or an external manager such as Vault or a cloud secrets manager.

4. **What do the readiness and liveness probes do?**
   Both call `GET /`. **Readiness** asks "can it take traffic?", and the Service skips Pods that aren't ready. **Liveness** asks "is it stuck?", and Kubernetes restarts the container after 3 failures in a row.

5. **Why is migration a separate Job instead of part of app startup?**
   With several replicas, each Pod would try to create the same tables at once and race each other. A Job runs it exactly once. Also, scaling to 4 replicas doesn't re-run migrations.

   *(Bonus: "Is this production-ready?" Not quite. Postgres and Redis are single Pods for the demo. Production would use a managed database, an Ingress with TLS, and images pushed to a registry.)*

## 4. Troubleshooting cheat sheet

Start with these three commands:

```bash
kubectl get pods -n openfx                             # what state is each Pod in?
kubectl describe pod <pod> -n openfx                   # read the Events at the bottom
kubectl logs <pod> -n openfx [--previous] [-c <container>]   # --previous = logs of the crashed run
kubectl get events -n openfx --sort-by=.lastTimestamp
```

| Symptom | Meaning | Fix |
|---|---|---|
| `ErrImageNeverPull` / `ImagePullBackOff` | Minikube doesn't have `openfx:v1`, so it tried to download it and failed | `minikube image load openfx:v1`; check with `minikube image ls \| grep openfx` |
| `CrashLoopBackOff` | The app starts, crashes and is restarted again and again | `kubectl logs <pod> --previous`. Common cause: missing `API_KEY`, or a wrong `DATABASE_URL` |
| `CreateContainerConfigError` | The Secret or ConfigMap it references doesn't exist | Create the Secret (step 4 above), then `kubectl get secret -n openfx` |
| `Pending` | No room to schedule it, or the disk (PVC) isn't bound | `kubectl describe pod` → Events; `kubectl get pvc -n openfx` |
| Pod `Running` but `0/1` Ready | Readiness probe failing | `kubectl describe pod` shows probe errors; check the logs |
| Job `Failed` / `BackoffLimitExceeded` | Migration kept failing | `kubectl delete job openfx-migrate -n openfx && kubectl apply -f k8s/migrate-job.yaml`, then `kubectl logs job/openfx-migrate -n openfx -c migrate` |
| `Can't find meta/_journal.json` / `Permission denied` in the migrate Job | The container runs as non-root user `node` and can't read root-only files | Already fixed with `COPY --chown=node:node` in the Dockerfile. Rebuild and reload the image |
| `[ioredis] ECONNREFUSED` right after deploy | The API started before Redis was ready | Harmless. It reconnects automatically |
| New code not showing up | Same tag reused, so Pods kept the old image | Use a new tag, or `kubectl rollout restart deployment/openfx-api -n openfx` |
| Website Pods `0/1` Ready with probe 404s, or `Permission denied` in `kubectl logs` | nginx can't read its config template, so it runs its default config | Already fixed with `COPY --chown=nginx:nginx` in `frontend/Dockerfile`. Rebuild and reload |
| Can't reach `$(minikube ip):30080` from the Mac | The Docker driver on macOS doesn't expose the node IP | Use `minikube service openfx-api -n openfx --url` (keep it running) or `kubectl port-forward` |
| `/v1/prices` returns 502 | The cluster can't reach Binance | Check internet access / DNS: `kubectl run -it --rm t --image=busybox -n openfx -- nslookup api.binance.com` |
